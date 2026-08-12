const { EmbedBuilder } = require('discord.js');
const { client: db } = require('../../database/db');

const EMBED_COLOR = 0x5865f2;
const REPOST_GAP_MS = 10_000; // gap between the old sticky disappearing and the new one being posted
const DEFAULT_REPOST_DELAY_SECONDS = 30; // how long to wait, after new activity, before reposting at all

// In-memory cache keyed by channel_id, kept in sync with the sticky_messages
// table. Reading from here avoids a DB round-trip on every single message
// sent in the server (messageCreate fires very often).
const cache = new Map();

// In-memory cache of the "enabled" flag per guild, kept in sync with the
// sticky_config table. Same reasoning as the sticky cache above: reading from
// here avoids a DB round-trip on every single message sent in the server.
const guildEnabledCache = new Map();

// Channels where a repost is currently in flight. The gateway event for the
// message we just sent via channel.send() can arrive BEFORE that call even
// resolves (REST response and gateway event are two independent channels),
// so comparing message.id to the cached lastMessageId alone isn't enough:
// there's a window where the cache still holds the *previous* id. While a
// channel is in this set, any messageCreate for it is treated as our own
// echo and ignored, which closes that race instead of triggering a cascade
// of self-reposts.
const postingInProgress = new Set();

// Channels with a repost already scheduled (waiting out their configured delay
// before actually happening). Extra messages that arrive during that wait don't
// pile up more scheduled reposts — one pending repost already covers them, since
// it always acts on whatever the sticky's current content is when it fires.
const repostScheduled = new Set();

function buildStickyEmbed(content) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(content)
    .setFooter({ text: '📌 Sticky message' });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Loads every configured sticky from the DB into the in-memory cache.
// Called once at startup (see events/ready.js).
async function loadAll() {
  const result = await db.execute('SELECT * FROM sticky_messages');
  cache.clear();
  for (const row of result.rows) {
    cache.set(row.channel_id, {
      guildId: row.guild_id,
      channelId: row.channel_id,
      content: row.content,
      lastMessageId: row.last_message_id,
      repostDelaySeconds: Number(row.repost_delay_seconds ?? DEFAULT_REPOST_DELAY_SECONDS),
    });
  }

  const configResult = await db.execute('SELECT guild_id, enabled FROM sticky_config');
  guildEnabledCache.clear();
  for (const row of configResult.rows) {
    guildEnabledCache.set(row.guild_id, Boolean(row.enabled));
  }

  return cache.size;
}

function isEnabled(guildId) {
  return guildEnabledCache.has(guildId) ? guildEnabledCache.get(guildId) : true; // enabled by default
}

async function setEnabled(guildId, enabled) {
  await db.execute({
    sql: `INSERT INTO sticky_config (guild_id, enabled) VALUES (?, ?)
          ON CONFLICT (guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
  guildEnabledCache.set(guildId, enabled);
}

function getStickyByChannel(channelId) {
  return cache.get(channelId) || null;
}

function listByGuild(guildId) {
  return [...cache.values()].filter((s) => s.guildId === guildId);
}

// Deletes the previous sticky message (if it still exists) and posts a fresh
// one at the bottom of the channel, then updates the cache and DB with the
// new message id. Used both when a sticky is first created and every time
// a scheduled repost (see handleNewMessage) fires.
async function repostSticky(channel, sticky) {
  postingInProgress.add(channel.id);
  try {
    if (sticky.lastMessageId) {
      const oldMessage = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
      if (oldMessage) await oldMessage.delete().catch(() => null);

      // Only wait when there was actually a previous sticky to remove — the very
      // first post for a channel (setSticky with no lastMessageId yet) should stay
      // instant. While we wait, the channel is still in postingInProgress, so any
      // messages sent in the meantime won't trigger a second, overlapping repost.
      await sleep(REPOST_GAP_MS);
    }

    const newMessage = await channel.send({ embeds: [buildStickyEmbed(sticky.content)] });

    sticky.lastMessageId = newMessage.id;
    cache.set(channel.id, sticky);

    await db.execute({
      sql: 'UPDATE sticky_messages SET last_message_id = ?, updated_at = ? WHERE guild_id = ? AND channel_id = ?',
      args: [newMessage.id, Date.now(), sticky.guildId, channel.id],
    });

    return newMessage;
  } finally {
    postingInProgress.delete(channel.id);
  }
}

// Creates (or replaces) the sticky configured for a channel, and immediately
// posts it — admin-triggered changes (via /sticky add|edit) stay instant, only the
// passive repost-on-new-activity flow below waits out the configured delay.
// `delaySeconds` defaults to 30s; pass an explicit value to set/change it.
async function setSticky(channel, content, createdBy, delaySeconds = DEFAULT_REPOST_DELAY_SECONDS) {
  const guildId = channel.guild.id;
  const sticky = { guildId, channelId: channel.id, content, lastMessageId: null, repostDelaySeconds: delaySeconds };

  await db.execute({
    sql: `INSERT INTO sticky_messages (guild_id, channel_id, content, last_message_id, repost_delay_seconds, created_by, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?, ?)
          ON CONFLICT (guild_id, channel_id) DO UPDATE SET
            content = excluded.content,
            last_message_id = NULL,
            repost_delay_seconds = excluded.repost_delay_seconds,
            created_by = excluded.created_by,
            updated_at = excluded.updated_at`,
    args: [guildId, channel.id, content, delaySeconds, createdBy, Date.now()],
  });

  cache.set(channel.id, sticky);
  await repostSticky(channel, sticky);
}

// Removes the sticky configured for a channel and, on a best-effort basis,
// deletes the last message it had posted there.
async function removeSticky(guild, channelId) {
  const sticky = cache.get(channelId);
  if (!sticky) return false;

  if (sticky.lastMessageId) {
    const channel = guild.channels.cache.get(channelId);
    const oldMessage = channel ? await channel.messages.fetch(sticky.lastMessageId).catch(() => null) : null;
    if (oldMessage) await oldMessage.delete().catch(() => null);
  }

  await db.execute({
    sql: 'DELETE FROM sticky_messages WHERE guild_id = ? AND channel_id = ?',
    args: [guild.id, channelId],
  });

  cache.delete(channelId);
  repostScheduled.delete(channelId);
  return true;
}

// Called from events/messageCreate.js for every message sent in the server.
// If the channel has an active sticky and this message isn't the sticky's own
// repost, schedules a repost after the sticky's configured delay (default 30s)
// instead of moving it immediately — reduces how often it hops around in busy
// channels. Further messages arriving during that wait don't add extra reposts,
// since the one already scheduled will pick up the latest content when it fires.
async function handleNewMessage(message) {
  const sticky = cache.get(message.channel.id);
  if (!sticky) return;
  if (!isEnabled(sticky.guildId)) return;
  if (postingInProgress.has(message.channel.id)) return; // our own repost is still in flight for this channel
  if (message.id === sticky.lastMessageId) return; // fallback safety check, same idea but after the fact
  if (repostScheduled.has(message.channel.id)) return; // a repost is already queued, it'll cover this too

  repostScheduled.add(message.channel.id);
  const channel = message.channel;
  const delayMs = (sticky.repostDelaySeconds ?? DEFAULT_REPOST_DELAY_SECONDS) * 1000;

  const timer = setTimeout(async () => {
    repostScheduled.delete(channel.id);
    const latestSticky = cache.get(channel.id); // re-read: content/delay may have changed since scheduling
    if (!latestSticky) return; // removed while waiting

    await repostSticky(channel, latestSticky).catch((err) => {
      console.error(`[sticky] Failed to repost sticky message in channel ${channel.id}:`, err);
    });
  }, delayMs);
  timer.unref?.();
}

module.exports = {
  DEFAULT_REPOST_DELAY_SECONDS,
  loadAll,
  getStickyByChannel,
  listByGuild,
  setSticky,
  removeSticky,
  handleNewMessage,
  isEnabled,
  setEnabled,
};

const { EmbedBuilder } = require('discord.js');
const { client: db } = require('../../database/db');

const EMBED_COLOR = 0x5865f2;
const REPOST_DELAY_MS = 10_000; // gap between the old sticky disappearing and the new one being posted

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
// handleNewMessage() detects new activity in a channel that has one.
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
      await sleep(REPOST_DELAY_MS);
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
// posts it.
async function setSticky(channel, content, createdBy) {
  const guildId = channel.guild.id;
  const sticky = { guildId, channelId: channel.id, content, lastMessageId: null };

  await db.execute({
    sql: `INSERT INTO sticky_messages (guild_id, channel_id, content, last_message_id, created_by, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
          ON CONFLICT (guild_id, channel_id) DO UPDATE SET
            content = excluded.content,
            last_message_id = NULL,
            created_by = excluded.created_by,
            updated_at = excluded.updated_at`,
    args: [guildId, channel.id, content, createdBy, Date.now()],
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
  return true;
}

// Called from events/messageCreate.js for every message sent in the server.
// If the channel has an active sticky and this message isn't the sticky's
// own repost, delete-and-repost it so it stays at the bottom of the channel.
async function handleNewMessage(message) {
  const sticky = cache.get(message.channel.id);
  if (!sticky) return;
  if (!isEnabled(sticky.guildId)) return;
  if (postingInProgress.has(message.channel.id)) return; // our own repost is still in flight for this channel
  if (message.id === sticky.lastMessageId) return; // fallback safety check, same idea but after the fact

  await repostSticky(message.channel, sticky).catch((err) => {
    console.error(`[sticky] Failed to repost sticky message in channel ${message.channel.id}:`, err);
  });
}

module.exports = {
  loadAll,
  getStickyByChannel,
  listByGuild,
  setSticky,
  removeSticky,
  handleNewMessage,
  isEnabled,
  setEnabled,
};

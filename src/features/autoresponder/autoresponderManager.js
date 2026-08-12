const { PermissionFlagsBits } = require('discord.js');
const repo = require('./autoresponderRepository');

class ValidationError extends Error {}

const MAX_EMOJIS = 10;
const MAX_REDIRECT_WINDOW_SECONDS = 30;

// Channels/threads currently waiting to see if the configured "redirect" bot posts
// within its window — channelId -> { timer, originalMessage, config }. Also in-memory
// only: losing a pending entry on a restart just means that one original message never
// gets a reaction, which is an acceptable, self-correcting edge case.
const pendingRedirects = new Map();

// Serializes handleMessage per channel. Discord delivers messageCreate events for a
// guild in order, but our own handler is async and does several awaited DB calls
// before reaching here (postlimit, sticky, goosepizza, then autoresponder) — two
// messages sent moments apart can interleave and finish those earlier steps in either
// order, so without this a fast-replying bot's message could reach the redirect check
// BEFORE the human message that was supposed to start the wait for it, always missing
// it and falling back. Chaining onto a per-channel queue guarantees messages are
// actually handled in the order they were sent, not the order their processing happens
// to finish.
const channelQueues = new Map();

function runInChannelOrder(channelId, task) {
  const previous = channelQueues.get(channelId) ?? Promise.resolve();
  const next = previous.then(task, task);
  // Keep the stored tail always-settled so a single failure doesn't wedge the queue for
  // that channel, and so old settled promises don't accumulate in memory forever.
  channelQueues.set(channelId, next.catch(() => {}));
  return next;
}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

// Accepts a space/comma-separated list of unicode and/or custom server emojis.
function parseEmojis(input) {
  const tokens = input
    .trim()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new ValidationError('Provide at least one emoji (e.g. "🍕", or "🍕 🔥 ⭐").');
  }
  if (tokens.length > MAX_EMOJIS) {
    throw new ValidationError(`You can configure at most ${MAX_EMOJIS} emojis per channel.`);
  }

  const customEmojiPattern = /^<a?:\w{2,32}:\d{17,20}>$/;
  const seen = new Set();
  const deduped = [];

  for (const token of tokens) {
    const isCustom = customEmojiPattern.test(token);
    const looksLikeUnicodeEmoji = !isCustom && /[^\x00-\x7F]/.test(token);

    if (!isCustom && !looksLikeUnicodeEmoji) {
      throw new ValidationError(
        `"${token}" doesn't look like a valid emoji. Use unicode emojis (🍕) or custom server emojis, separated by spaces or commas.`
      );
    }
    if (!seen.has(token)) {
      seen.add(token);
      deduped.push(token);
    }
  }

  return deduped;
}

// --- Content filter matching ---

// Video link patterns — mainly YouTube, the platform the person actually asked for.
const VIDEO_LINK_PATTERN = /https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/i;

// x.com/Twitter links, including the common "fx"-style mirror domains people use to get
// working embeds (fxtwitter, vxtwitter, fixvx, fixupx, and their twitter.com equivalents).
const X_LINK_PATTERN =
  /https?:\/\/(www\.)?(x\.com|twitter\.com|fxtwitter\.com|fixupx\.com|vxtwitter\.com|fixvx\.com)\//i;

function hasMediaAttachment(message) {
  return message.attachments.some((a) => a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/'));
}

function hasVideoLink(message) {
  return VIDEO_LINK_PATTERN.test(message.content);
}

function hasXLink(message) {
  return X_LINK_PATTERN.test(message.content);
}

// No criteria enabled means "no filter" — matches everything, same as before this
// feature existed. Otherwise matches if the message satisfies ANY enabled criterion.
function matchesContentFilter(message, contentFilter) {
  const { attachment, videoLink, xLink } = contentFilter;
  if (!attachment && !videoLink && !xLink) return true;

  return (attachment && hasMediaAttachment(message)) || (videoLink && hasVideoLink(message)) || (xLink && hasXLink(message));
}

function assertCanReactInChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions])) {
    throw new ValidationError(`I need "View Channel", "Read Message History" and "Add Reactions" permissions in ${channel}.`);
  }
}

// --- Configuration ---

async function setChannel(guild, channel, emojisInput, contentFilter, redirectBotId, redirectWindowSeconds, createdBy) {
  const emojis = parseEmojis(emojisInput);

  if ((redirectBotId != null) !== (redirectWindowSeconds != null)) {
    throw new ValidationError('Provide both a redirect bot ID and a redirect window, or neither.');
  }
  if (redirectBotId != null) {
    if (!/^\d{17,20}$/.test(redirectBotId)) {
      throw new ValidationError('That doesn\'t look like a valid bot ID (right-click the bot → "Copy User ID").');
    }
    if (
      !Number.isInteger(redirectWindowSeconds) ||
      redirectWindowSeconds < 1 ||
      redirectWindowSeconds > MAX_REDIRECT_WINDOW_SECONDS
    ) {
      throw new ValidationError(`The redirect window must be a whole number of seconds between 1 and ${MAX_REDIRECT_WINDOW_SECONDS}.`);
    }
  }

  assertCanReactInChannel(guild, channel);
  await repo.setChannel(guild.id, channel.id, emojis, contentFilter, redirectBotId ?? null, redirectWindowSeconds ?? null, createdBy);
  return {
    emojis,
    contentFilter,
    redirectBotId: redirectBotId ?? null,
    redirectWindowSeconds: redirectWindowSeconds ?? null,
  };
}

async function removeChannel(guildId, channelId) {
  return repo.removeChannel(guildId, channelId);
}

async function listChannels(guildId) {
  return repo.getAllChannels(guildId);
}

// message.react() wants just the custom emoji's numeric ID (or the raw unicode string),
// not the full <:name:id> markup used when storing/displaying it.
function extractReactableEmoji(emojiString) {
  const customMatch = emojiString.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
  return customMatch ? customMatch[1] : emojiString;
}

async function reactWithConfiguredEmojis(message, config) {
  for (const emoji of config.emojis) {
    await message.react(extractReactableEmoji(emoji)).catch((err) => {
      console.warn(`[autoresponder] Could not react with ${emoji} in guild ${message.guild.id}:`, err.message);
    });
  }
}

// Looks up the autoresponder for a message's channel — checked directly first, and if
// the message is inside a thread, falls back to the thread's PARENT channel, so a
// config set on a forum/text channel also applies to reactions posted in its threads
// (e.g. each "room" thread under a shared parent).
async function resolveConfig(guildId, message) {
  const direct = await repo.getChannel(guildId, message.channelId);
  if (direct) return direct;

  if (message.channel?.isThread?.()) {
    return repo.getChannel(guildId, message.channel.parentId);
  }
  return null;
}

// Called from messageCreate for every new guild message. If this channel (or the parent
// of the thread it's in) has an autoresponder configured, reacts with the configured
// emoji(s) — the exact target message and timing depend on which mode is set:
//
//   normal mode   — reacts to every message that passes the content filter (if any).
//   redirect mode — reacts to nothing right away. Instead, waits up to the configured
//                   window for the specific "redirect" bot to post in the same channel;
//                   if it does, the reaction goes on ITS message instead of the
//                   original. If the window expires without it posting, the original
//                   message gets the reaction as a fallback.
async function handleMessage(message) {
  return runInChannelOrder(message.channelId, () => handleMessageInOrder(message));
}

async function handleMessageInOrder(message) {
  if (!(await repo.isEnabled(message.guild.id))) return;

  const config = await resolveConfig(message.guild.id, message);
  if (!config) return;

  const isRedirectMode = config.redirectBotId != null;

  // Matches the redirect bot by its user ID, OR by webhook ID — many "repost"/"embed
  // fixer" bots actually post via a Discord webhook rather than as a live bot
  // connection, in which case message.author.id is a per-webhook pseudo-user id, NOT
  // the bot application's own id. Checking both covers either setup.
  const isFromRedirectBot = isRedirectMode && (message.author?.id === config.redirectBotId || message.webhookId === config.redirectBotId);

  if (isRedirectMode) {
    console.log(
      `[autoresponder] guild=${message.guild.id} channel=${message.channelId} msg=${message.id} author=${message.author?.id} webhookId=${message.webhookId ?? 'none'} bot=${message.author?.bot} — redirectBotId=${config.redirectBotId} isFromRedirectBot=${isFromRedirectBot}`
    );
  }

  // In redirect mode, a message from the specific redirect bot resolves any pending
  // wait for this channel — react to IT instead of the original, and skip everything
  // else below (a redirect-bot message with nothing pending gets no reaction on its
  // own; it only ever substitutes for a waiting original).
  if (isFromRedirectBot) {
    const pending = pendingRedirects.get(message.channelId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRedirects.delete(message.channelId);
      console.log(`[autoresponder] Redirect matched — reacting to the bot's message ${message.id} instead of ${pending.originalMessage.id}`);
      await reactWithConfiguredEmojis(message, config);
    } else {
      console.log(`[autoresponder] Redirect bot posted but nothing was pending for channel ${message.channelId} — no reaction`);
    }
    return;
  }

  // Every other bot's messages are ignored, including this bot's own.
  if (message.author?.bot) return;

  if (!matchesContentFilter(message, config.contentFilter)) return;

  if (isRedirectMode) {
    const existing = pendingRedirects.get(message.channelId);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      pendingRedirects.delete(message.channelId);
      console.log(`[autoresponder] Redirect window expired for message ${message.id} in channel ${message.channelId} — falling back to the original poster`);
      reactWithConfiguredEmojis(message, config).catch((err) => {
        console.error(`[autoresponder] Failed to react to fallback message in guild ${message.guild.id}:`, err);
      });
    }, config.redirectWindowSeconds * 1000);
    timer.unref?.();

    pendingRedirects.set(message.channelId, { timer, originalMessage: message });
    console.log(`[autoresponder] Waiting up to ${config.redirectWindowSeconds}s for redirect bot ${config.redirectBotId} in channel ${message.channelId} (original message ${message.id})`);
    return;
  }

  await reactWithConfiguredEmojis(message, config);
}

module.exports = {
  ValidationError,
  MAX_REDIRECT_WINDOW_SECONDS,
  isEnabled,
  setEnabled,
  setChannel,
  removeChannel,
  listChannels,
  handleMessage,
};

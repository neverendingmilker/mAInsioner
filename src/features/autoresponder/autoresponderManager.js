const { PermissionFlagsBits } = require('discord.js');
const repo = require('./autoresponderRepository');

class ValidationError extends Error {}

const MAX_EMOJIS = 10;
const MAX_PAIR_WINDOW_SECONDS = 30;

// Timestamp of the last message seen in each channel/thread that has at least one
// autoresponder with "pair mode" enabled — kept in memory only (losing it on a restart
// just means the very next message after a restart is never treated as "the second of a
// pair", which is a harmless, self-correcting edge case).
const lastMessageTimestamps = new Map();

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

async function setChannel(guild, channel, emojisInput, contentFilter, pairWithinSeconds, createdBy) {
  const emojis = parseEmojis(emojisInput);
  if (pairWithinSeconds != null && (!Number.isInteger(pairWithinSeconds) || pairWithinSeconds < 1 || pairWithinSeconds > MAX_PAIR_WINDOW_SECONDS)) {
    throw new ValidationError(`The pair window must be a whole number of seconds between 1 and ${MAX_PAIR_WINDOW_SECONDS}.`);
  }
  assertCanReactInChannel(guild, channel);
  await repo.setChannel(guild.id, channel.id, emojis, contentFilter, pairWithinSeconds ?? null, createdBy);
  return { emojis, contentFilter, pairWithinSeconds: pairWithinSeconds ?? null };
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
// of the thread it's in) has an autoresponder configured, reacts with every configured
// emoji, in order — provided the message also passes the content filter (if any) and,
// in "pair mode", arrived within the configured window of the previous message there.
async function handleMessage(message) {
  if (!(await repo.isEnabled(message.guild.id))) return;

  const config = await resolveConfig(message.guild.id, message);
  if (!config) return;

  const isPairMode = config.pairWithinSeconds != null;

  // Normal mode still ignores every bot (including this one) — unchanged default
  // behavior. Pair mode explicitly allows OTHER bots' messages, since that's usually
  // who posts the "second" message of a rapid pair; this bot's own messages are still
  // excluded either way, to avoid ever reacting to itself.
  if (message.author?.bot) {
    if (!isPairMode || message.author.id === message.client.user.id) return;
  }

  if (!matchesContentFilter(message, config.contentFilter)) return;

  if (isPairMode) {
    const previousTimestamp = lastMessageTimestamps.get(message.channelId);
    lastMessageTimestamps.set(message.channelId, message.createdTimestamp);

    const isSecondOfPair =
      previousTimestamp != null && message.createdTimestamp - previousTimestamp < config.pairWithinSeconds * 1000;
    if (!isSecondOfPair) return; // a solo message, or the first of a pair — no reaction in this mode
  }

  for (const emoji of config.emojis) {
    await message.react(extractReactableEmoji(emoji)).catch((err) => {
      console.warn(`[autoresponder] Could not react with ${emoji} in guild ${message.guild.id}:`, err.message);
    });
  }
}

module.exports = {
  ValidationError,
  MAX_PAIR_WINDOW_SECONDS,
  isEnabled,
  setEnabled,
  setChannel,
  removeChannel,
  listChannels,
  handleMessage,
};

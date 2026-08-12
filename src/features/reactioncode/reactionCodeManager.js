const repo = require('./reactionCodeRepository');

class ValidationError extends Error {}

const CODE_PATTERN = /^\d{1,9}$/;

// Most recently posted image message per channel that has this feature configured.
// In-memory only — losing it on a restart just means the very next code typed after a
// restart won't find a pending image to apply to, a harmless, self-correcting edge case
// (posting the image again re-establishes it).
const lastImageMessages = new Map();

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

// --- Configuration ---

async function addChannel(guildId, channel, createdBy) {
  await repo.addChannel(guildId, channel.id, createdBy);
}

async function removeChannel(guildId, channelId) {
  lastImageMessages.delete(channelId);
  return repo.removeChannel(guildId, channelId);
}

async function listChannels(guildId) {
  return repo.getAllChannels(guildId);
}

function assertValidDigit(digit) {
  if (!/^\d$/.test(digit)) {
    throw new ValidationError(`"${digit}" isn't valid — a digit must be a single character, 0-9.`);
  }
}

function assertValidEmoji(emoji) {
  const customEmojiPattern = /^<a?:\w{2,32}:\d{17,20}>$/;
  const looksLikeUnicodeEmoji = !customEmojiPattern.test(emoji) && /[^\x00-\x7F]/.test(emoji);
  if (!customEmojiPattern.test(emoji) && !looksLikeUnicodeEmoji) {
    throw new ValidationError(`"${emoji}" doesn't look like a valid emoji.`);
  }
}

async function setDigit(guildId, channelId, digit, emoji) {
  assertValidDigit(digit);
  assertValidEmoji(emoji);
  await repo.setDigit(guildId, channelId, digit, emoji);
}

// Accepts several "digit=emoji" pairs separated by commas in one go, e.g.
// "1=🔥,2=⭐,9=💯" — parses and validates every pair BEFORE saving any of them, so a
// single typo doesn't leave the mapping half-applied.
async function setDigits(guildId, channelId, mappingInput) {
  const pairs = mappingInput
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (pairs.length === 0) {
    throw new ValidationError('Provide at least one "digit=emoji" pair, e.g. "1=🔥,2=⭐,9=💯".');
  }

  const parsed = [];
  const seenDigits = new Set();
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      throw new ValidationError(`"${pair}" isn't valid — use the format digit=emoji, e.g. "1=🔥".`);
    }
    const digit = pair.slice(0, eqIndex).trim();
    const emoji = pair.slice(eqIndex + 1).trim();

    assertValidDigit(digit);
    assertValidEmoji(emoji);
    if (seenDigits.has(digit)) {
      throw new ValidationError(`Digit "${digit}" is listed more than once.`);
    }
    seenDigits.add(digit);
    parsed.push({ digit, emoji });
  }

  for (const { digit, emoji } of parsed) {
    await repo.setDigit(guildId, channelId, digit, emoji);
  }

  return parsed;
}

async function removeDigit(guildId, channelId, digit) {
  return repo.removeDigit(guildId, channelId, digit);
}

async function getDigitMap(guildId, channelId) {
  return repo.getDigitMap(guildId, channelId);
}

// message.react() wants just the custom emoji's numeric ID (or the raw unicode string),
// not the full <:name:id> markup used when storing/displaying it.
function extractReactableEmoji(emojiString) {
  const customMatch = emojiString.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
  return customMatch ? customMatch[1] : emojiString;
}

function hasImageAttachment(message) {
  return [...message.attachments.values()].some((a) => a.contentType?.startsWith('image/'));
}

// Called from messageCreate for every new guild message. Two things this feature reacts
// to, only in channels it's configured for:
//   - a message with an image attachment: remembered as the "pending image" to apply a
//     code to, replacing whatever image was pending before.
//   - a message that's ONLY digits (up to 9 of them): decodes each digit into its
//     configured emoji, removes every reaction THIS BOT previously added to the pending
//     image, adds the newly decoded ones instead, then deletes the digit message. If
//     there's no pending image, the digit message is left alone (nothing to apply it to).
async function handleMessage(message) {
  if (message.author?.bot) return;
  if (!(await repo.isEnabled(message.guild.id))) return;
  if (!(await repo.hasChannel(message.guild.id, message.channelId))) return;

  if (hasImageAttachment(message)) {
    lastImageMessages.set(message.channelId, message);
    return;
  }

  const content = message.content.trim();
  if (!CODE_PATTERN.test(content)) return;

  const pendingImage = lastImageMessages.get(message.channelId);
  if (!pendingImage) return; // nothing to apply this code to — leave the stray message alone

  const digitMap = await repo.getDigitMap(message.guild.id, message.channelId);

  const botReactions = pendingImage.reactions.cache.filter((r) => r.me);
  for (const reaction of botReactions.values()) {
    await reaction.users.remove(message.client.user.id).catch((err) => {
      console.warn(`[reactioncode] Could not remove a previous reaction in guild ${message.guild.id}:`, err.message);
    });
  }

  const seenEmojis = new Set();
  for (const digit of content) {
    const emoji = digitMap.get(digit);
    if (!emoji || seenEmojis.has(emoji)) continue;
    seenEmojis.add(emoji);
    await pendingImage.react(extractReactableEmoji(emoji)).catch((err) => {
      console.warn(`[reactioncode] Could not react with ${emoji} in guild ${message.guild.id}:`, err.message);
    });
  }

  await message.delete().catch((err) => {
    console.warn(`[reactioncode] Could not delete the code message in guild ${message.guild.id}:`, err.message);
  });
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  addChannel,
  removeChannel,
  listChannels,
  setDigit,
  setDigits,
  removeDigit,
  getDigitMap,
  handleMessage,
};

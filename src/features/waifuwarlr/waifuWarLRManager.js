const { PermissionFlagsBits } = require('discord.js');
const repo = require('./waifuWarLRRepository');

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

// Deleting the code message means deleting someone ELSE's message (the channel's
// owner), which needs Manage Messages specifically — Add Reactions/View
// Channel/Read Message History alone (enough for the reaction-swapping part) isn't
// sufficient for that. Checked up front so a missing permission shows up immediately
// as a clear error instead of a reaction working fine while the delete silently fails.
function assertCanManageChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (
    !perms?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ManageMessages,
    ])
  ) {
    throw new ValidationError(
      `I need "View Channel", "Read Message History", "Add Reactions" and "Manage Messages" permissions in ${channel} ` +
        `(Manage Messages is specifically needed to delete the digit-code messages, which aren't posted by the bot).`
    );
  }
}

// --- Configuration ---

async function addChannel(guild, channel, createdBy) {
  assertCanManageChannel(guild, channel);
  await repo.addChannel(guild.id, channel.id, createdBy);
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

// `digit` and `emoji` can each be a single value, or several separated by commas — when
// several, they're paired up by position (1st digit with 1st emoji, 2nd with 2nd, ...),
// so both lists must be the same length. Every pair is validated before anything is
// saved, so a single bad entry doesn't leave the mapping half-applied.
async function setDigit(guildId, channelId, digitInput, emojiInput) {
  const digits = digitInput
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const emojis = emojiInput
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (digits.length === 0 || emojis.length === 0) {
    throw new ValidationError('Provide at least one digit and one emoji.');
  }
  if (digits.length !== emojis.length) {
    throw new ValidationError(
      `Got ${digits.length} digit(s) but ${emojis.length} emoji(s) — when listing several, give the same number of each so they can be paired up.`
    );
  }

  const seenDigits = new Set();
  for (let i = 0; i < digits.length; i++) {
    assertValidDigit(digits[i]);
    assertValidEmoji(emojis[i]);
    if (seenDigits.has(digits[i])) {
      throw new ValidationError(`Digit "${digits[i]}" is listed more than once.`);
    }
    seenDigits.add(digits[i]);
  }

  for (let i = 0; i < digits.length; i++) {
    await repo.setDigit(guildId, channelId, digits[i], emojis[i]);
  }

  return digits.map((digit, i) => ({ digit, emoji: emojis[i] }));
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
      console.warn(`[waifuwarlr] Could not remove a previous reaction in guild ${message.guild.id}:`, err.message);
    });
  }

  const seenEmojis = new Set();
  for (const digit of content) {
    const emoji = digitMap.get(digit);
    if (!emoji || seenEmojis.has(emoji)) continue;
    seenEmojis.add(emoji);
    await pendingImage.react(extractReactableEmoji(emoji)).catch((err) => {
      console.warn(`[waifuwarlr] Could not react with ${emoji} in guild ${message.guild.id}:`, err.message);
    });
  }

  await message.delete().catch((err) => {
    console.warn(`[waifuwarlr] Could not delete the code message in guild ${message.guild.id}:`, err.message);
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
  removeDigit,
  getDigitMap,
  handleMessage,
};

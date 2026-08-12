const { PermissionFlagsBits } = require('discord.js');
const repo = require('./autoresponderRepository');

class ValidationError extends Error {}

const MAX_EMOJIS = 10;

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

function assertCanReactInChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions])) {
    throw new ValidationError(`I need "View Channel", "Read Message History" and "Add Reactions" permissions in ${channel}.`);
  }
}

// --- Configuration ---

async function setChannel(guild, channel, emojisInput, createdBy) {
  const emojis = parseEmojis(emojisInput);
  assertCanReactInChannel(guild, channel);
  await repo.setChannel(guild.id, channel.id, emojis, createdBy);
  return { emojis };
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

// Called from messageCreate for every new guild message. If this channel has an
// autoresponder configured, reacts with every configured emoji, in order.
async function handleMessage(message) {
  if (message.author?.bot) return;
  if (!(await repo.isEnabled(message.guild.id))) return;

  const config = await repo.getChannel(message.guild.id, message.channelId);
  if (!config) return;

  for (const emoji of config.emojis) {
    await message.react(extractReactableEmoji(emoji)).catch((err) => {
      console.warn(`[autoresponder] Could not react with ${emoji} in guild ${message.guild.id}:`, err.message);
    });
  }
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  setChannel,
  removeChannel,
  listChannels,
  handleMessage,
};

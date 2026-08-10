const { PermissionFlagsBits } = require('discord.js');
const repo = require('./goosepizzaRepository');

class ValidationError extends Error {}

const MAX_TRIGGER_LENGTH = 100;
const RESPONSE_MODES = {
  message: 'Comment (posts a new message with the emoji)',
  reaction: 'React (reacts to the triggering message with the emoji)',
};
const DEFAULT_RESPONSE_MODE = 'message';

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

async function getConfig(guildId) {
  const cfg = await repo.getConfig(guildId);
  return {
    channel_id: cfg?.channel_id ?? null,
    trigger_text: cfg?.trigger_text ?? repo.DEFAULT_TRIGGER,
    emoji: cfg?.emoji ?? repo.DEFAULT_EMOJI,
    response_mode: cfg?.response_mode ?? DEFAULT_RESPONSE_MODE,
  };
}

function assertCanPostInChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    throw new ValidationError(`I need "View Channel" and "Send Messages" permissions in ${channel} to post there.`);
  }
}

async function setChannel(guild, channel) {
  assertCanPostInChannel(guild, channel);
  await repo.setChannel(guild.id, channel.id);
}

async function setTrigger(guildId, triggerText) {
  const trimmed = triggerText.trim();
  if (!trimmed) {
    throw new ValidationError('The trigger text can\'t be empty.');
  }
  if (trimmed.length > MAX_TRIGGER_LENGTH) {
    throw new ValidationError(`Keep the trigger text under ${MAX_TRIGGER_LENGTH} characters.`);
  }
  await repo.setTrigger(guildId, trimmed);
}

// Accepts a single unicode emoji or a Discord custom emoji (<:name:id> / <a:name:id>) —
// stored and later posted exactly as given, so it renders correctly in the reply.
function assertValidEmoji(input) {
  const trimmed = input.trim();
  const isCustom = /^<a?:\w{2,32}:\d{17,20}>$/.test(trimmed);
  const looksLikeUnicodeEmoji = !isCustom && /[^\x00-\x7F]/.test(trimmed);

  if (!isCustom && !looksLikeUnicodeEmoji) {
    throw new ValidationError(
      `"${trimmed}" doesn't look like a valid emoji. Use a unicode emoji (🍕) or a custom server emoji (type it and Discord will convert it, or paste its \`<:name:id>\` form).`
    );
  }
  return trimmed;
}

async function setEmoji(guildId, emojiInput) {
  const emoji = assertValidEmoji(emojiInput);
  await repo.setEmoji(guildId, emoji);
  return emoji;
}

async function setMode(guildId, mode) {
  if (!Object.prototype.hasOwnProperty.call(RESPONSE_MODES, mode)) {
    throw new ValidationError(`Unknown response mode "${mode}".`);
  }
  await repo.setMode(guildId, mode);
}

// message.react() wants just the custom emoji's numeric ID (or the raw unicode string),
// not the full <:name:id> markup used when posting it as text.
function extractReactableEmoji(emojiString) {
  const customMatch = emojiString.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
  return customMatch ? customMatch[1] : emojiString;
}

// Called from messageCreate for every new guild message. If this channel is the
// configured one and the trigger text appears anywhere in the message (case-insensitive),
// posts the configured emoji as a reply-less follow-up message.
// Called from messageCreate for every new guild message. If this channel is the
// configured one and the trigger text appears anywhere in the message (case-insensitive),
// either posts the configured emoji as a new message, or reacts with it on the
// triggering message directly, depending on the configured response mode.
async function handleMessage(message) {
  if (message.author?.bot) return;
  if (!(await repo.isEnabled(message.guild.id))) return;

  const cfg = await repo.getConfig(message.guild.id);
  if (!cfg?.channel_id || cfg.channel_id !== message.channelId) return;

  const trigger = cfg.trigger_text || repo.DEFAULT_TRIGGER;
  if (!message.content.toLowerCase().includes(trigger.toLowerCase())) return;

  const emoji = cfg.emoji || repo.DEFAULT_EMOJI;
  const mode = cfg.response_mode || DEFAULT_RESPONSE_MODE;

  if (mode === 'reaction') {
    await message.react(extractReactableEmoji(emoji)).catch((err) => {
      console.warn(`[goosepizza] Could not react in guild ${message.guild.id}:`, err.message);
    });
  } else {
    await message.channel.send({ content: emoji, allowedMentions: { parse: [] } }).catch((err) => {
      console.warn(`[goosepizza] Could not post the emoji in guild ${message.guild.id}:`, err.message);
    });
  }
}

module.exports = {
  ValidationError,
  RESPONSE_MODES,
  DEFAULT_RESPONSE_MODE,
  isEnabled,
  setEnabled,
  getConfig,
  setChannel,
  setTrigger,
  setEmoji,
  setMode,
  handleMessage,
};

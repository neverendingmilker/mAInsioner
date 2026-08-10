const { PermissionFlagsBits } = require('discord.js');
const repo = require('./goosepizzaRepository');

class ValidationError extends Error {}

const MAX_TRIGGER_LENGTH = 100;

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

// Called from messageCreate for every new guild message. If this channel is the
// configured one and the trigger text appears anywhere in the message (case-insensitive),
// posts the configured emoji as a reply-less follow-up message.
async function handleMessage(message) {
  if (message.author?.bot) return;
  if (!(await repo.isEnabled(message.guild.id))) return;

  const cfg = await repo.getConfig(message.guild.id);
  if (!cfg?.channel_id || cfg.channel_id !== message.channelId) return;

  const trigger = cfg.trigger_text || repo.DEFAULT_TRIGGER;
  if (!message.content.toLowerCase().includes(trigger.toLowerCase())) return;

  const emoji = cfg.emoji || repo.DEFAULT_EMOJI;
  await message.channel.send({ content: emoji, allowedMentions: { parse: [] } }).catch((err) => {
    console.warn(`[goosepizza] Could not post the emoji in guild ${message.guild.id}:`, err.message);
  });
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  getConfig,
  setChannel,
  setTrigger,
  setEmoji,
  handleMessage,
};

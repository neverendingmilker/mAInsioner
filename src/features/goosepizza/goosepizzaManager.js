const { PermissionFlagsBits } = require('discord.js');
const repo = require('./goosepizzaRepository');

class ValidationError extends Error {}

const MAX_TRIGGER_LENGTH = 100;
const RESPONSE_MODES = {
  message: 'Comment (posts a new message with the emoji)',
  reaction: 'React (reacts to the triggering message with the emoji)',
};
const DEFAULT_RESPONSE_MODE = repo.DEFAULT_RESPONSE_MODE;

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

// --- Validation helpers ---

function assertValidResponseMode(mode) {
  if (!Object.prototype.hasOwnProperty.call(RESPONSE_MODES, mode)) {
    throw new ValidationError(`Unknown response mode "${mode}".`);
  }
}

function assertValidTriggerText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ValidationError("The trigger text can't be empty.");
  }
  if (trimmed.length > MAX_TRIGGER_LENGTH) {
    throw new ValidationError(`Keep the trigger text under ${MAX_TRIGGER_LENGTH} characters.`);
  }
  return trimmed;
}

// Accepts a single unicode emoji or a Discord custom emoji (<:name:id> / <a:name:id>) —
// stored and later posted/reacted exactly as given.
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

// The permission needed depends on the response mode: posting a comment needs Send
// Messages, reacting needs Add Reactions (both also need View Channel / read history).
function assertCanRespondInChannel(guild, channel, mode) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  const needed =
    mode === 'reaction'
      ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions]
      : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];

  if (!perms?.has(needed)) {
    const needsList =
      mode === 'reaction' ? '"View Channel", "Read Message History" and "Add Reactions"' : '"View Channel" and "Send Messages"';
    throw new ValidationError(`I need ${needsList} permissions in ${channel} for this trigger.`);
  }
}

// message.react() wants just the custom emoji's numeric ID (or the raw unicode string),
// not the full <:name:id> markup used when posting it as text.
function extractReactableEmoji(emojiString) {
  const customMatch = emojiString.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
  return customMatch ? customMatch[1] : emojiString;
}

// --- CRUD used by the /goosepizza command handlers ---

async function create(guild, name, channel, triggerInput, emojiInput, mode, createdBy) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ValidationError('Give this trigger a name.');
  }

  const resolvedMode = mode ?? DEFAULT_RESPONSE_MODE;
  assertValidResponseMode(resolvedMode);
  const triggerText = assertValidTriggerText(triggerInput ?? repo.DEFAULT_TRIGGER);
  const emoji = assertValidEmoji(emojiInput ?? repo.DEFAULT_EMOJI);
  assertCanRespondInChannel(guild, channel, resolvedMode);

  const existing = await repo.getByName(guild.id, trimmedName);
  if (existing) {
    throw new ValidationError(`A GoosePizza trigger named "${trimmedName}" already exists. Use \`/goosepizza edit\` to change it.`);
  }

  await repo.createTrigger(guild.id, trimmedName, channel.id, triggerText, emoji, resolvedMode, createdBy);

  return { name: trimmedName, channel, triggerText, emoji, mode: resolvedMode };
}

async function edit(guild, name, updates) {
  const trigger = await repo.getByName(guild.id, name);
  if (!trigger) {
    throw new ValidationError(`No GoosePizza trigger named "${name}" found.`);
  }

  const fields = {};

  if (updates.triggerInput !== undefined) {
    fields.trigger_text = assertValidTriggerText(updates.triggerInput);
  }
  if (updates.emojiInput !== undefined) {
    fields.emoji = assertValidEmoji(updates.emojiInput);
  }
  if (updates.mode !== undefined) {
    assertValidResponseMode(updates.mode);
    fields.response_mode = updates.mode;
  }
  if (updates.channel) {
    fields.channel_id = updates.channel.id;
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('Provide at least one field to change.');
  }

  const finalChannel = updates.channel ?? (await guild.channels.fetch(trigger.channel_id).catch(() => null));
  const finalMode = fields.response_mode ?? trigger.response_mode;
  if (finalChannel) {
    assertCanRespondInChannel(guild, finalChannel, finalMode);
  }

  await repo.updateTrigger(guild.id, name, fields);
  return { ...trigger, ...fields };
}

async function remove(guildId, name) {
  return repo.removeTrigger(guildId, name);
}

async function listAll(guildId) {
  return repo.getAllInGuild(guildId);
}

async function getNamesList(guildId) {
  const triggers = await repo.getAllInGuild(guildId);
  return triggers.map((t) => t.name);
}

// --- Passive trigger handling ---

// Called from messageCreate for every new guild message. Every trigger configured to
// watch this channel is checked independently — several can fire off the same message
// (different words, different emojis, different modes), each doing its own thing.
async function handleMessage(message) {
  if (message.author?.bot) return;
  if (!(await repo.isEnabled(message.guild.id))) return;

  const triggers = await repo.getTriggersForChannel(message.guild.id, message.channelId);
  if (triggers.length === 0) return;

  const lowerContent = message.content.toLowerCase();

  for (const trigger of triggers) {
    if (!lowerContent.includes(trigger.trigger_text.toLowerCase())) continue;

    if (trigger.response_mode === 'reaction') {
      await message.react(extractReactableEmoji(trigger.emoji)).catch((err) => {
        console.warn(`[goosepizza] Could not react for trigger "${trigger.name}" in guild ${message.guild.id}:`, err.message);
      });
    } else {
      await message.channel.send({ content: trigger.emoji, allowedMentions: { parse: [] } }).catch((err) => {
        console.warn(`[goosepizza] Could not post for trigger "${trigger.name}" in guild ${message.guild.id}:`, err.message);
      });
    }
  }
}

module.exports = {
  ValidationError,
  RESPONSE_MODES,
  DEFAULT_RESPONSE_MODE,
  isEnabled,
  setEnabled,
  create,
  edit,
  remove,
  listAll,
  getNamesList,
  handleMessage,
};

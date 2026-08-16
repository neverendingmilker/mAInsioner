const { PermissionFlagsBits } = require('discord.js');
const repo = require('./reactionLimitRepository');
const { isMod } = require('../../utils/modRole');

class ValidationError extends Error {}

const DEFAULT_REACTION_LIMIT = 5;
const MIN_REACTION_LIMIT = 1;
const MAX_REACTION_LIMIT = 100;

// Reactions the bot itself just removed for going over the limit — tracked briefly so
// the resulting messageReactionRemove event isn't mistaken for the user manually
// un-reacting (which decrements their count; an enforcement removal must not, since
// that reaction was never counted in the first place).
const pendingSelfRemovals = new Set();
const SELF_REMOVAL_SAFETY_TTL_MS = 10_000;

function emojiKey(reaction) {
  return reaction.emoji.id ?? reaction.emoji.name;
}

function selfRemovalKey(messageId, userId, reaction) {
  return `${messageId}:${userId}:${emojiKey(reaction)}`;
}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

function assertCanManageReactionsInChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages])) {
    throw new ValidationError(`I need "View Channel", "Read Message History" and "Manage Messages" permissions in ${channel} (removing others' reactions requires Manage Messages).`);
  }
}

function assertValidLimit(limit) {
  if (!Number.isInteger(limit) || limit < MIN_REACTION_LIMIT || limit > MAX_REACTION_LIMIT) {
    throw new ValidationError(`The reaction limit must be a whole number between ${MIN_REACTION_LIMIT} and ${MAX_REACTION_LIMIT}.`);
  }
}

// --- Configuration ---

async function setChannel(guild, channel, reactionLimit, ignoreFirstPost, createdBy) {
  assertValidLimit(reactionLimit);
  assertCanManageReactionsInChannel(guild, channel);
  await repo.setChannel(guild.id, channel.id, reactionLimit, ignoreFirstPost, createdBy);
}

async function removeChannel(guildId, channelId) {
  return repo.removeChannel(guildId, channelId);
}

async function listChannels(guildId) {
  return repo.getAllChannels(guildId);
}

// Moderators (the configured Mod role, or Administrator) are always exempt — no
// configurable exempt-role list, matching the "does exactly one thing" scope of this
// feature.
async function isExempt(member) {
  return isMod(member);
}

// Called from messageReactionAdd for every new reaction in the guild. Only acts on
// reactions inside a thread whose PARENT channel has this feature configured; once a
// user's already-counted reactions in that thread reach the limit, any further one gets
// removed immediately.
async function handleReactionAdd(reaction, user, guild) {
  if (user.bot) return;
  if (!(await repo.isEnabled(guild.id))) return;

  const message = reaction.message;
  const channel = message.channel;
  if (!channel?.isThread?.()) return;

  const config = await repo.getChannel(guild.id, channel.parentId);
  if (!config) return;

  // A thread's starter message shares its ID with the thread itself.
  if (config.ignoreFirstPost && message.id === channel.id) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (await isExempt(member)) return;

  const currentCount = await repo.getCount(guild.id, channel.id, user.id);
  if (currentCount >= config.reactionLimit) {
    const key = selfRemovalKey(message.id, user.id, reaction);
    pendingSelfRemovals.add(key);
    setTimeout(() => pendingSelfRemovals.delete(key), SELF_REMOVAL_SAFETY_TTL_MS).unref?.();

    await reaction.users.remove(user.id).catch(() => {
      pendingSelfRemovals.delete(key); // the removal never actually happened, don't leave the guard dangling
    });
    return;
  }

  await repo.incrementCount(guild.id, channel.id, user.id);
}

// Called from messageReactionRemove for every reaction removed in the guild. Decrements
// the user's running count — but only for a genuine, user-initiated removal; a removal
// this feature itself just performed (see above) must not decrement, since that
// reaction was blocked before ever being counted.
async function handleReactionRemove(reaction, user, guild) {
  if (user.bot) return;
  if (!(await repo.isEnabled(guild.id))) return;

  const message = reaction.message;
  const channel = message.channel;
  if (!channel?.isThread?.()) return;

  const key = selfRemovalKey(message.id, user.id, reaction);
  if (pendingSelfRemovals.has(key)) {
    pendingSelfRemovals.delete(key);
    return;
  }

  const config = await repo.getChannel(guild.id, channel.parentId);
  if (!config) return;
  if (config.ignoreFirstPost && message.id === channel.id) return;

  await repo.decrementCount(guild.id, channel.id, user.id);
}

module.exports = {
  ValidationError,
  DEFAULT_REACTION_LIMIT,
  MIN_REACTION_LIMIT,
  MAX_REACTION_LIMIT,
  isEnabled,
  setEnabled,
  setChannel,
  removeChannel,
  listChannels,
  handleReactionAdd,
  handleReactionRemove,
};

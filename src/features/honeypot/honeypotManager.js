const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const repo = require('./honeypotRepository');
const { isMod } = require('../../utils/modRole');

class ValidationError extends Error {}

const BUTTON_CUSTOM_ID = 'honeypot:kick';
const DEFAULT_MESSAGE = '⚠️ This area is restricted. Do not interact with this channel in any way.';
const DEFAULT_BUTTON_LABEL = 'Click here';
const KICK_REASON = 'Honeypot: interacted with a restricted channel';

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

function assertCanSetUp(guild, channel) {
  const botMember = guild.members.me;
  const perms = botMember && channel.permissionsFor(botMember);
  if (!perms?.has(PermissionFlagsBits.KickMembers)) {
    throw new ValidationError('I need the "Kick Members" permission in this server to set up a honeypot.');
  }
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    throw new ValidationError('I need "View Channel" and "Send Messages" in that channel to post the trap message.');
  }
}

// Posts the bait message (with its button) and starts tracking the channel as a trap.
// Re-running this for a channel that's already a honeypot replaces the old message with
// a fresh one (the old message, if it still exists, is left as-is — remove it first if
// you want it cleaned up).
async function addChannel(guild, channel, messageText, buttonLabel, createdBy) {
  assertCanSetUp(guild, channel);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_CUSTOM_ID).setLabel(buttonLabel || DEFAULT_BUTTON_LABEL).setStyle(ButtonStyle.Danger)
  );

  const message = await channel.send({ content: messageText || DEFAULT_MESSAGE, components: [row] });
  await repo.addChannel(guild.id, channel.id, message.id, createdBy);
  return message;
}

async function removeChannel(guild, channelId) {
  const existing = await repo.getChannel(guild.id, channelId);
  const removedCount = await repo.removeChannel(guild.id, channelId);
  if (removedCount === 0) {
    throw new ValidationError("That channel isn't set up as a honeypot.");
  }

  if (existing) {
    const channel = guild.channels.cache.get(channelId);
    const message = channel && (await channel.messages.fetch(existing.messageId).catch(() => null));
    await message?.delete().catch(() => {}); // best-effort cleanup, not critical if it fails
  }
}

async function listChannels(guildId) {
  return repo.getAllChannels(guildId);
}

// Kicks the member unless they're a Mod/Administrator (who are always safe from every
// trigger below). Returns true if a kick happened, false if the member was exempt or
// the kick failed (e.g. the bot's role isn't high enough — logged, not thrown, since
// callers here are passive event handlers with no good way to surface an error).
async function kickIfNotMod(guild, member) {
  if (isMod(member)) return false;

  try {
    await member.kick(KICK_REASON);
    return true;
  } catch (err) {
    console.error(`[honeypot] Could not kick ${member.id} in guild ${guild.id}:`, err.message);
    return false;
  }
}

// --- Event hooks, one per trigger type ---

async function handleMessage(message) {
  if (message.author.bot) return;
  if (!(await repo.isEnabled(message.guild.id))) return;

  const honeypot = await repo.getChannel(message.guild.id, message.channelId);
  if (!honeypot) return;

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  await kickIfNotMod(message.guild, member);
}

async function handleReactionAdd(reaction, user, guild) {
  if (user.bot) return;
  if (!(await repo.isEnabled(guild.id))) return;

  const honeypot = await repo.getChannel(guild.id, reaction.message.channelId);
  if (!honeypot) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await kickIfNotMod(guild, member);
}

// Returns true if this interaction was the honeypot button (so interactionCreate.js
// knows to stop routing it anywhere else), regardless of whether a kick happened.
async function handleButtonClick(interaction) {
  if (interaction.customId !== BUTTON_CUSTOM_ID) return false;

  if (!(await repo.isEnabled(interaction.guildId))) {
    await interaction.reply({ content: '⚠️ This feature is currently disabled.', ephemeral: true }).catch(() => {});
    return true;
  }

  const kicked = await kickIfNotMod(interaction.guild, interaction.member);
  if (!kicked) {
    // Either they're a Mod/Admin (safe), or the kick failed — either way, don't leave
    // Discord's client showing the interaction as stuck/failed.
    await interaction.reply({ content: 'Nothing happens.', ephemeral: true }).catch(() => {});
  }
  // If they WERE kicked, skip replying: they're no longer in the server, and there's no
  // one left who needs to see a response.
  return true;
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  addChannel,
  removeChannel,
  listChannels,
  handleMessage,
  handleReactionAdd,
  handleButtonClick,
  BUTTON_CUSTOM_ID,
};

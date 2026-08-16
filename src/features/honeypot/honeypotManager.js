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
//
// `emoji` is optional: if given, the bot reacts to its own bait message with it, purely
// as extra bait. It's not required for the trap to work — reacting with ANY emoji on
// the honeypot message already triggers a kick (see handleReactionAdd) — it's just used
// afterwards to know which of the message's reactions is "ours" to clean up post-kick.
async function addChannel(guild, channel, messageText, buttonLabel, createdBy, emoji) {
  assertCanSetUp(guild, channel);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_CUSTOM_ID).setLabel(buttonLabel || DEFAULT_BUTTON_LABEL).setStyle(ButtonStyle.Success)
  );

  const message = await channel.send({ content: messageText || DEFAULT_MESSAGE, components: [row] });

  if (emoji) {
    try {
      await message.react(emoji);
    } catch (err) {
      await message.delete().catch(() => {});
      throw new ValidationError(`That doesn't look like a valid emoji I can react with: ${err.message}`);
    }
  }

  await repo.addChannel(guild.id, channel.id, message.id, createdBy, emoji || null);
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

// The bait text and button label aren't duplicated into the DB — the live Discord message
// is the only copy — so this is how a caller (the dashboard's edit form) finds out what
// they currently say. Also doubles as an existence check: `messageMissing: true` means the
// trap message itself is gone (deleted outside the bot's control), so there's nothing left
// to edit — the channel would need to be removed and re-added instead.
async function getChannelDetails(guild, channelId) {
  const honeypot = await repo.getChannel(guild.id, channelId);
  if (!honeypot) return null;

  const channel = guild.channels.cache.get(channelId);
  const message = channel && (await channel.messages.fetch(honeypot.messageId).catch(() => null));

  if (!message) {
    return { ...honeypot, messageMissing: true, messageText: '', buttonLabel: '' };
  }

  return {
    ...honeypot,
    messageMissing: false,
    messageText: message.content || '',
    buttonLabel: message.resolveComponent(BUTTON_CUSTOM_ID)?.label ?? DEFAULT_BUTTON_LABEL,
  };
}

// Edits the honeypot's existing bait message and button label in place — unlike
// addChannel (which always posts a brand-new message), this updates the one that's
// already live, so anyone looking at the channel right now sees the change immediately
// instead of the channel ending up with two trap messages.
async function editChannel(guild, channelId, messageText, buttonLabel) {
  const honeypot = await repo.getChannel(guild.id, channelId);
  if (!honeypot) {
    throw new ValidationError("That channel isn't set up as a honeypot.");
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    throw new ValidationError("That channel doesn't exist anymore.");
  }

  const message = await channel.messages.fetch(honeypot.messageId).catch(() => null);
  if (!message) {
    throw new ValidationError('The trap message no longer exists on Discord — remove this trap and add it again instead.');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_CUSTOM_ID).setLabel(buttonLabel || DEFAULT_BUTTON_LABEL).setStyle(ButtonStyle.Success)
  );

  try {
    await message.edit({ content: messageText || DEFAULT_MESSAGE, components: [row] });
  } catch (err) {
    throw new ValidationError(`Couldn't update the trap message: ${err.message}`);
  }
}

// Kicks the member unless they're a Mod/Administrator (who are always safe from every
// trigger below). Returns true if a kick happened, false if the member was exempt or
// the kick failed (e.g. the bot's role isn't high enough — logged, not thrown, since
// callers here are passive event handlers with no good way to surface an error).
// `channelId`/`trigger` (one of 'message'/'reaction'/'button') are recorded to the kick
// log on success — see getKickLog.
async function kickIfNotMod(guild, member, channelId, trigger) {
  if (isMod(member)) return false;

  try {
    await member.kick(KICK_REASON);
  } catch (err) {
    console.error(`[honeypot] Could not kick ${member.id} in guild ${guild.id}:`, err.message);
    return false;
  }

  await repo.logKick(guild.id, member.id, member.user?.tag ?? null, channelId, trigger).catch((err) => {
    console.error(`[honeypot] Kicked ${member.id} but failed to log it:`, err.message);
  });
  return true;
}

// Total kicks plus the most recent ones, for the `/honeypot log` subcommand.
async function getKickLog(guildId, limit = 10) {
  const [total, recent] = await Promise.all([repo.getKickCount(guildId), repo.getRecentKicks(guildId, limit)]);
  return { total, recent };
}

// True if `reaction` is the one matching the emoji the bot itself reacted with when the
// trap was set up (see addChannel's `emoji` param) — used to find "our" reaction again
// after a kick, to remove it. `storedEmoji` is whatever raw string was passed to
// message.react() back then, either a unicode emoji or a `<a:name:id>`/`<:name:id>` mention.
function reactionMatchesStoredEmoji(reaction, storedEmoji) {
  if (!storedEmoji) return false;
  const customMatch = storedEmoji.match(/^<a?:\w+:(\d+)>$/);
  if (customMatch) return reaction.emoji.id === customMatch[1];
  return reaction.emoji.name === storedEmoji;
}

// Removes the bot's own reaction (the one added in addChannel, if any) from the honeypot
// message once it's done its job — best-effort, never throws.
async function cleanUpOwnReaction(guild, message, honeypot) {
  if (!honeypot.emoji) return;
  const botId = guild.members.me?.id;
  if (!botId) return;

  const ownReaction = message.reactions.cache.find((r) => reactionMatchesStoredEmoji(r, honeypot.emoji));
  await ownReaction?.users.remove(botId).catch(() => {});
}

// --- Event hooks, one per trigger type ---

async function handleMessage(message) {
  if (message.author.bot) return;
  if (!(await repo.isEnabled(message.guild.id))) return;

  const honeypot = await repo.getChannel(message.guild.id, message.channelId);
  if (!honeypot) return;

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  const kicked = await kickIfNotMod(message.guild, member, message.channelId, 'message');
  if (kicked) {
    await message.delete().catch(() => {});
  }
}

async function handleReactionAdd(reaction, user, guild) {
  if (user.bot) return;
  if (!(await repo.isEnabled(guild.id))) return;

  const honeypot = await repo.getChannel(guild.id, reaction.message.channelId);
  if (!honeypot) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const kicked = await kickIfNotMod(guild, member, reaction.message.channelId, 'reaction');
  if (kicked) {
    await cleanUpOwnReaction(guild, reaction.message, honeypot);
  }
}

// Returns true if this interaction was the honeypot button (so interactionCreate.js
// knows to stop routing it anywhere else), regardless of whether a kick happened.
async function handleButtonClick(interaction) {
  if (interaction.customId !== BUTTON_CUSTOM_ID) return false;

  if (!(await repo.isEnabled(interaction.guildId))) {
    await interaction.reply({ content: '⚠️ This feature is currently disabled.', ephemeral: true }).catch(() => {});
    return true;
  }

  const kicked = await kickIfNotMod(interaction.guild, interaction.member, interaction.channelId, 'button');
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
  getChannelDetails,
  editChannel,
  getKickLog,
  handleMessage,
  handleReactionAdd,
  handleButtonClick,
  BUTTON_CUSTOM_ID,
  DEFAULT_MESSAGE,
  DEFAULT_BUTTON_LABEL,
};

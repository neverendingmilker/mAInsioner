const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const repo = require('./warningRepository');
const config = require('../../config/config');

class ValidationError extends Error {}

const EMBED_COLOR = 0xe74c3c;
const MAX_DESCRIPTION_LENGTH = 4000; // stay safely under Discord's 4096-char embed description cap
const REASON_MAX_LENGTH = 300;

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

function assertCanAssignRole(guild, role) {
  const botMember = guild.members.me;
  if (!botMember || botMember.roles.highest.position <= role.position) {
    throw new ValidationError(
      `My role needs to be higher than ${role} for me to be able to assign it. Move my role above it in Server Settings → Roles and try again.`
    );
  }
}

function assertCanPostInChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    throw new ValidationError(`I need "View Channel" and "Send Messages" permissions in ${channel} to post the warnings list there.`);
  }
}

// --- Configuration ---

async function setRoles(guild, role1, role2) {
  if (role1.id === role2.id) {
    throw new ValidationError('The two roles need to be different from each other.');
  }
  assertCanAssignRole(guild, role1);
  assertCanAssignRole(guild, role2);

  await repo.setRoles(guild.id, role1.id, role2.id);
}

async function setChannel(guild, channel) {
  assertCanPostInChannel(guild, channel);
  await repo.setChannel(guild.id, channel.id);
  await refreshEmbed(guild); // post (or re-post in the new channel) right away
}

async function getRoleChoices(guild) {
  const cfg = await repo.getConfig(guild.id);
  if (!cfg) return [];

  const choices = [];
  for (const roleId of [cfg.role_1_id, cfg.role_2_id]) {
    if (!roleId) continue;
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (role) choices.push({ name: role.name, id: role.id });
  }
  return choices;
}

// --- Issuing warnings ---

async function giveWarning(guild, targetUser, reason, roleId, issuedBy) {
  const cfg = await repo.getConfig(guild.id);
  if (!cfg?.role_1_id || !cfg?.role_2_id) {
    throw new ValidationError('Configure the two assignable roles first with `/warning roles`.');
  }
  if (roleId !== cfg.role_1_id && roleId !== cfg.role_2_id) {
    throw new ValidationError('That role isn\'t one of the two configured for `/warning give` — pick one from the list.');
  }
  if (!cfg.channel_id) {
    throw new ValidationError('Configure the warnings channel first with `/warning channel`.');
  }

  const trimmedReason = reason.trim().slice(0, REASON_MAX_LENGTH);
  if (!trimmedReason) {
    throw new ValidationError('Provide a reason.');
  }

  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    throw new ValidationError("That user doesn't seem to be a member of this server.");
  }

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    throw new ValidationError('The configured role no longer exists — reconfigure it with `/warning roles`.');
  }
  assertCanAssignRole(guild, role);

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch((err) => {
      throw new ValidationError(`Could not assign ${role} to ${member}: ${err.message}`);
    });
  }

  await repo.addWarning(guild.id, targetUser.id, 'warning', trimmedReason, role.id, issuedBy);
  await refreshEmbed(guild);

  return { role };
}

async function giveVerbal(guild, targetUser, reason, issuedBy) {
  const cfg = await repo.getConfig(guild.id);
  if (!cfg?.channel_id) {
    throw new ValidationError('Configure the warnings channel first with `/warning channel`.');
  }

  const trimmedReason = reason.trim().slice(0, REASON_MAX_LENGTH);
  if (!trimmedReason) {
    throw new ValidationError('Provide a reason.');
  }

  await repo.addWarning(guild.id, targetUser.id, 'verbal', trimmedReason, null, issuedBy);
  await refreshEmbed(guild);
}

// --- Embed building / posting ---

function formatEntryLine(warning) {
  const typeLabel = warning.type === 'verbal' ? 'Verbal' : 'Warning';
  const dateTag = `<t:${Math.floor(Number(warning.created_at) / 1000)}:D>`;
  return `${typeLabel} - ${warning.reason} - ${dateTag}`;
}

function buildDescription(allWarnings) {
  const byUser = new Map();
  for (const warning of allWarnings) {
    if (!byUser.has(warning.user_id)) byUser.set(warning.user_id, []);
    byUser.get(warning.user_id).push(warning);
  }

  // Most recently warned/verbal'd user goes to the top of the list.
  const userBlocks = [...byUser.entries()]
    .map(([userId, entries]) => ({
      userId,
      lastActivity: Math.max(...entries.map((e) => Number(e.created_at))),
      text: `<@${userId}>\n${entries.map(formatEntryLine).join('\n')}`,
    }))
    .sort((a, b) => b.lastActivity - a.lastActivity);

  if (userBlocks.length === 0) return 'No warnings recorded yet.';

  let body = userBlocks.map((b) => b.text).join('\n\n');
  if (body.length > MAX_DESCRIPTION_LENGTH) {
    body = `${body.slice(0, MAX_DESCRIPTION_LENGTH)}\n\n*(list truncated — too many entries to show here)*`;
  }
  return body;
}

async function buildEmbed(guildId) {
  const allWarnings = await repo.getAllWarnings(guildId);
  const body = buildDescription(allWarnings);

  const now = new Date();
  const dateText = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now);
  const timeTag = `<t:${Math.floor(now.getTime() / 1000)}:t>`;

  return new EmbedBuilder()
    .setTitle('Warnings')
    .setColor(EMBED_COLOR)
    .setDescription(`Last update: ${dateText} ${timeTag}\n\n${body}`);
}

// Edits the tracked warnings-list message in place, or posts a fresh one if there
// isn't a valid one yet (first use, or it was deleted/the channel changed).
async function refreshEmbed(guild) {
  const cfg = await repo.getConfig(guild.id);
  if (!cfg?.channel_id) return; // nowhere configured to post yet

  const channel = await guild.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const embed = await buildEmbed(guild.id);

  if (cfg.embed_message_id) {
    const existing = await channel.messages.fetch(cfg.embed_message_id).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] }).catch(() => {});
      return;
    }
  }

  const sent = await channel.send({ embeds: [embed] }).catch((err) => {
    console.warn(`[warning] Could not post the warnings list in guild ${guild.id}:`, err.message);
    return null;
  });
  if (sent) await repo.setEmbedMessageId(guild.id, sent.id);
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  setRoles,
  setChannel,
  getRoleChoices,
  giveWarning,
  giveVerbal,
  refreshEmbed,
};

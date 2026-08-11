const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const repo = require('./warningRepository');
const config = require('../../config/config');
const { zonedTimeToUtc } = require('../../utils/timezoneDate');

class ValidationError extends Error {}

const EMBED_COLOR = 0xe74c3c;
const MAX_DESCRIPTION_LENGTH = 3800; // stay safely under Discord's 4096-char embed description cap
const REASON_MAX_LENGTH = 300;

// Parses "DD/MM/YY" or "DD/MM/YYYY" into midnight of that date, in the bot's configured
// timezone — used to backdate a warning/verbal to when it actually happened, rather
// than when it was logged. Never includes a time component, only ever a date.
function parseWarningDate(input) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(input.trim());
  if (!match) {
    throw new ValidationError('Invalid date. Use DD/MM/YY or DD/MM/YYYY — e.g. 15/03/25 or 15/03/2025.');
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) {
    year += year <= 79 ? 2000 : 1900;
  }

  const roundTrip = new Date(year, month - 1, day);
  const isValidCalendarDate =
    roundTrip.getFullYear() === year && roundTrip.getMonth() === month - 1 && roundTrip.getDate() === day;
  if (!isValidCalendarDate) {
    throw new ValidationError(`"${input}" isn't a valid date.`);
  }

  const midnight = zonedTimeToUtc(year, month - 1, day, 0, 0, 0, config.timezone);
  if (midnight.getTime() > Date.now()) {
    throw new ValidationError(`"${input}" is in the future.`);
  }
  return midnight.getTime();
}

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

// --- Issuing warnings ---

// Escalation ladder: no role yet -> role_1; already has role_1 -> role_2; already has
// role_2 -> nothing left to escalate to, flag it for a human decision instead.
// `targetUserId` doesn't need to belong to a current member — if they've left the
// server, the warning is still logged, just without any role to check/assign.
async function warnUser(guild, targetUserId, reason, issuedBy, dateInput) {
  const cfg = await repo.getConfig(guild.id);
  if (!cfg?.role_1_id || !cfg?.role_2_id) {
    throw new ValidationError('Configure the two assignable roles first with `/warning roles`.');
  }
  if (!cfg.channel_id) {
    throw new ValidationError('Configure the warnings channel first with `/warning channel`.');
  }

  const trimmedReason = reason.trim().slice(0, REASON_MAX_LENGTH);
  if (!trimmedReason) {
    throw new ValidationError('Provide a reason.');
  }

  const member = await guild.members.fetch(targetUserId).catch(() => null);

  let assignedRole = null;
  let outcome = 'assigned'; // 'assigned' | 'alreadyMaxed' | 'notInServer'

  if (!member) {
    outcome = 'notInServer';
  } else {
    const hasRole1 = member.roles.cache.has(cfg.role_1_id);
    const hasRole2 = member.roles.cache.has(cfg.role_2_id);

    if (hasRole2) {
      outcome = 'alreadyMaxed';
    } else {
      const roleIdToAssign = hasRole1 ? cfg.role_2_id : cfg.role_1_id;
      const role = guild.roles.cache.get(roleIdToAssign) ?? (await guild.roles.fetch(roleIdToAssign).catch(() => null));
      if (!role) {
        throw new ValidationError('One of the configured roles no longer exists — reconfigure with `/warning roles`.');
      }
      assertCanAssignRole(guild, role);

      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch((err) => {
          throw new ValidationError(`Could not assign ${role} to ${member}: ${err.message}`);
        });
      }
      assignedRole = role;
    }
  }

  await repo.addWarning(
    guild.id,
    targetUserId,
    'warning',
    trimmedReason,
    assignedRole?.id ?? null,
    issuedBy,
    dateInput ? parseWarningDate(dateInput) : undefined
  );
  await refreshEmbed(guild);

  return { outcome, assignedRole, member };
}

async function giveVerbal(guild, targetUserId, reason, issuedBy, dateInput) {
  const cfg = await repo.getConfig(guild.id);
  if (!cfg?.channel_id) {
    throw new ValidationError('Configure the warnings channel first with `/warning channel`.');
  }

  const trimmedReason = reason.trim().slice(0, REASON_MAX_LENGTH);
  if (!trimmedReason) {
    throw new ValidationError('Provide a reason.');
  }

  await repo.addWarning(guild.id, targetUserId, 'verbal', trimmedReason, null, issuedBy, dateInput ? parseWarningDate(dateInput) : undefined);
  await refreshEmbed(guild);
}

// Edits an existing warning/verbal — but ONLY if the person editing is the same one who
// originally issued it. Can change the reason and/or backdate it to a different date.
async function editWarning(guild, warningId, editorId, updates) {
  const warning = await repo.getWarningById(warningId);
  if (!warning || warning.guild_id !== guild.id) {
    throw new ValidationError("That warning doesn't exist.");
  }
  if (warning.issued_by !== editorId) {
    throw new ValidationError('You can only edit warnings you issued yourself.');
  }

  const fields = {};
  if (updates.reason !== undefined) {
    const trimmedReason = updates.reason.trim().slice(0, REASON_MAX_LENGTH);
    if (!trimmedReason) {
      throw new ValidationError('Provide a reason.');
    }
    fields.reason = trimmedReason;
  }
  if (updates.dateInput !== undefined) {
    fields.created_at = parseWarningDate(updates.dateInput);
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('Provide at least a new reason or a new date to change.');
  }

  await repo.updateWarning(warningId, fields);
  await refreshEmbed(guild);

  return { ...warning, ...fields };
}

// Warnings/verbals issued by one specific person — powers the autocomplete on
// /warning edit, so a mod only ever sees (and can pick from) their own entries.
async function getOwnWarningsList(guildId, issuedBy) {
  const rows = await repo.getWarningsByIssuer(guildId, issuedBy);
  return rows.map((row) => ({
    id: row.id,
    label: `${row.type === 'verbal' ? 'Verbal' : 'Warning'} — ${row.reason.slice(0, 60)}`,
  }));
}

// --- Embed building / posting ---

// Shows the NAME of the role that was actually assigned for a given warning entry
// (as a role mention — inert inside an embed, doesn't ping anyone), falling back to a
// generic label for verbals or for warnings that didn't result in a role change
// (already-maxed-out escalations, or the person wasn't in the server).
function formatEntryLine(warning) {
  let typeLabel;
  if (warning.type === 'verbal') {
    typeLabel = 'Verbal';
  } else if (warning.role_id) {
    typeLabel = `<@&${warning.role_id}>`;
  } else {
    typeLabel = 'Warning';
  }
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

// Cross-references everyone who was ever escalated to role_2 against the server's
// current ban list, using Discord's own ban list (GuildBanManager) — no separate
// tracking needed on our side, it's all derived from data Discord already has.
// Silently returns an empty list if the bot lacks the Ban Members permission.
async function getBannedAfterFinalWarning(guild, allWarnings, role2Id) {
  if (!role2Id) return [];

  const escalatedUserIds = [...new Set(allWarnings.filter((w) => w.role_id === role2Id).map((w) => w.user_id))];
  if (escalatedUserIds.length === 0) return [];

  let bans;
  try {
    bans = await guild.bans.fetch();
  } catch {
    return []; // no Ban Members permission, or the fetch otherwise failed — skip quietly
  }

  return escalatedUserIds.filter((userId) => bans.has(userId));
}

async function buildEmbed(guild) {
  const cfg = await repo.getConfig(guild.id);
  const allWarnings = await repo.getAllWarnings(guild.id);
  const body = buildDescription(allWarnings);

  const now = new Date();
  const dateText = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now);
  const timeTag = `<t:${Math.floor(now.getTime() / 1000)}:t>`;

  let description = `Last update: ${dateText} ${timeTag}\n\n${body}`;

  const bannedUserIds = await getBannedAfterFinalWarning(guild, allWarnings, cfg?.role_2_id);
  if (bannedUserIds.length > 0) {
    description += `\n\n**🔨 Banned after final warning**\n${bannedUserIds.map((id) => `<@${id}>`).join('\n')}`;
  }

  return new EmbedBuilder().setTitle('Warnings').setColor(EMBED_COLOR).setDescription(description);
}

// Edits the tracked warnings-list message in place, or posts a fresh one if there
// isn't a valid one yet (first use, or it was deleted/the channel changed).
async function refreshEmbed(guild) {
  const cfg = await repo.getConfig(guild.id);
  if (!cfg?.channel_id) return; // nowhere configured to post yet

  const channel = await guild.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const embed = await buildEmbed(guild);

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
  warnUser,
  giveVerbal,
  editWarning,
  getOwnWarningsList,
  refreshEmbed,
};

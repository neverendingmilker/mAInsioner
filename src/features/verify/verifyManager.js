const { PermissionFlagsBits } = require('discord.js');
const repo = require('./verifyRepository');
const { isMod } = require('../../utils/modRole');
const { buildReportEmbed } = require('./reportEmbed');

class ValidationError extends Error {}

const TYPES = ['sub', 'domme', 'maledom'];

const TYPE_LABELS = {
  sub: 'Sub',
  domme: 'Domme',
  maledom: 'Maledom',
};

// Embed side-bar color used in the verification report, per type.
const TYPE_COLORS = {
  sub: 0x00ff00, // green
  domme: 0xff0000, // red
  maledom: 0x0f00ff, // blue
};

async function getGuildConfig(guildId) {
  return repo.getGuildConfig(guildId);
}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

// Updates any combination of settings in one call: the give roles for the three
// verification types, the single shared remove role, the report channel, and/or
// the role allowed to run /verify sub, domme and maledom. `updates` keys (all
// optional, pass only the ones that changed): subGive, dommeGive, maledomGive,
// remove, allowedRole (role ID strings), channel (channel ID string).
async function setConfig(guildId, updates) {
  const current = await repo.getGuildConfig(guildId);

  const merged = {
    sub_give_role_id: updates.subGive !== undefined ? updates.subGive : current.sub_give_role_id,
    domme_give_role_id: updates.dommeGive !== undefined ? updates.dommeGive : current.domme_give_role_id,
    maledom_give_role_id:
      updates.maledomGive !== undefined ? updates.maledomGive : current.maledom_give_role_id,
    remove_role_id: updates.remove !== undefined ? updates.remove : current.remove_role_id,
    report_channel_id: updates.channel !== undefined ? updates.channel : current.report_channel_id,
    allowed_role_id: updates.allowedRole !== undefined ? updates.allowedRole : current.allowed_role_id,
    default_sub_role_id:
      updates.defaultSubRole !== undefined ? updates.defaultSubRole : current.default_sub_role_id,
  };

  await repo.setGuildConfig(guildId, merged);
  return merged;
}

// --- Sub roles: an admin-configured set of roles that /verify sub checks a member
// against — if they hold NONE of them, the configured default role gets assigned as a
// fallback. What the roles represent is entirely up to the admin; the bot only checks
// set membership. ---

async function setSubRoles(guildId, roleIds) {
  await repo.setSubRoles(guildId, roleIds);
}

async function getSubRoles(guildId) {
  return repo.getSubRoles(guildId);
}

// Called only from the "sub" verification flow. No-op if the feature isn't configured
// (no default role and/or no sub-roles set) — this is an OPT-IN extra, not required
// for /verify sub to work. Returns a short status string used to build the command's
// reply notes: 'not-configured', 'already-had-one', or 'assigned'.
async function assignDefaultSubRoleIfMissing(guild, member) {
  const config = await repo.getGuildConfig(guild.id);
  if (!config.default_sub_role_id) return 'not-configured';

  const subRoleIds = await repo.getSubRoles(guild.id);
  if (subRoleIds.length === 0) return 'not-configured';

  const hasAny = subRoleIds.some((roleId) => member.roles.cache.has(roleId));
  if (hasAny) return 'already-had-one';

  await member.roles.add(config.default_sub_role_id).catch((err) => {
    console.error(`[verify] Could not assign the default sub role to ${member.id}:`, err.message);
  });
  return 'assigned';
}

// Returns { giveRoleId, removeRoleId } for a verification type, reading from the
// guild's config object (as returned by getGuildConfig). removeRoleId is the same
// single shared role for all three types.
function getRoleIdsForType(config, type) {
  if (!TYPES.includes(type)) {
    throw new ValidationError(`Unknown verification type "${type}".`);
  }
  return {
    giveRoleId: config[`${type}_give_role_id`],
    removeRoleId: config.remove_role_id,
  };
}

// Who can run /verify sub, domme and maledom: anyone with Manage Roles (always
// allowed), plus — if configured via /verify config allowedrole — anyone holding
// that specific role.
async function canUseVerifyCommands(member, config) {
  if (await isMod(member)) return true;
  if (config.allowed_role_id && member.roles.cache.has(config.allowed_role_id)) return true;
  return false;
}

// --- Verification reports (for /verify edit) ---

const EDITABLE_FIELDS = ['verification', 'social'];

async function recordReport(report) {
  return repo.insertReport(report);
}

// The report to edit for a given user: always the most recent one, regardless of
// which of the three types it was ("edit the last one" when several exist).
async function getLastReportForUser(guildId, userId) {
  return repo.getLastReportForUser(guildId, userId);
}

async function getReportById(id) {
  return repo.getReportById(id);
}

async function deleteReport(id) {
  return repo.deleteReport(id);
}

async function updateReportField(id, field, value) {
  if (!EDITABLE_FIELDS.includes(field)) {
    throw new ValidationError(`Field "${field}" can't be edited.`);
  }
  await repo.updateReportField(id, field, value);
}

// Most recent reports for a guild, regardless of type — used by the dashboard's
// recent-reports list (mirrors Warnings' equivalent query/truncation convention).
async function getAllReportsInGuild(guildId, limit) {
  return repo.getAllReportsInGuild(guildId, limit);
}

// --- Shared side-effect logic behind /verify sub, /verify domme, /verify maledom AND
// the dashboard's "issue verification" form. This function only DOES things (assigns/
// removes roles, posts the report) and returns a structured result describing what
// happened — it never builds any user-facing text itself. That's deliberate: the
// Discord command (verifyAction.js) reconstructs its existing reply text verbatim from
// this result (so its output stays byte-identical to before this was extracted), while
// the dashboard route renders its own flash/UI from the same facts. Pre-flight
// validation (role configured? role still exists? bot role hierarchy high enough?) is
// intentionally NOT done here — it stays in each caller, since the Discord command's
// early-exit messages use role mentions that only make sense in a Discord reply, and
// the dashboard needs its own plain-text equivalents; both callers already have
// `config` and can do these three checks themselves before calling this.
//
// `member` must be a real GuildMember (role assignment requires membership) and
// `giveRole` must already be a resolved, assignable Role — both validated by the
// caller. Returns:
//   { label, giveRole, alreadyHadRole, removeRole, crossRemovals, subRole, report }
async function performVerification(
  guild,
  type,
  { member, giveRole, config, verification, social, moderatorMention, moderatorId, verifiedAtSeconds }
) {
  const botMember = guild.members.me;

  const result = {
    label: TYPE_LABELS[type],
    giveRole,
    alreadyHadRole: false,
    removeRole: null, // { missing: true } | { role, removed: true } | { role, blocked: true } | null
    crossRemovals: [], // [{ type, role, removed?: true, blocked?: true }]
    subRole: null, // { status, defaultRole? } — only set for type === 'sub'
    report: null, // { channelMissing } | { noPermission, channel } | { posted, channel, message, oldReportDeleted }
  };

  result.alreadyHadRole = member.roles.cache.has(giveRole.id);
  if (result.alreadyHadRole) {
    // no-op: member already has it
  } else {
    await member.roles.add(giveRole);
  }

  const removeRoleId = config.remove_role_id;
  if (removeRoleId) {
    const removeRole = guild.roles.cache.get(removeRoleId);
    if (!removeRole) {
      result.removeRole = { missing: true };
    } else if (member.roles.cache.has(removeRole.id)) {
      if (botMember.roles.highest.position > removeRole.position) {
        await member.roles.remove(removeRole);
        result.removeRole = { role: removeRole, removed: true };
      } else {
        result.removeRole = { role: removeRole, blocked: true };
      }
    }
  }

  // Keep the three verification types mutually exclusive: if the member holds the
  // "give" role of one of the other two types, strip it now that they're being
  // verified as this one.
  for (const otherType of TYPES) {
    if (otherType === type) continue;

    const otherGiveRoleId = config[`${otherType}_give_role_id`];
    if (!otherGiveRoleId) continue;

    const otherGiveRole = guild.roles.cache.get(otherGiveRoleId);
    if (!otherGiveRole || !member.roles.cache.has(otherGiveRole.id)) continue;

    if (botMember.roles.highest.position > otherGiveRole.position) {
      await member.roles.remove(otherGiveRole);
      result.crossRemovals.push({ type: otherType, role: otherGiveRole, removed: true });
    } else {
      result.crossRemovals.push({ type: otherType, role: otherGiveRole, blocked: true });
    }
  }

  // Sub-only: if configured, make sure the member holds at least one of the admin's
  // sub roles, backfilling the configured default if they hold none of them.
  if (type === 'sub') {
    const status = await assignDefaultSubRoleIfMissing(guild, member);
    result.subRole = { status };
    if (status === 'assigned') {
      result.subRole.defaultRole = guild.roles.cache.get(config.default_sub_role_id) || null;
    }
  }

  // Post the verification report to the configured channel (if any).
  if (config.report_channel_id) {
    const reportChannel = guild.channels.cache.get(config.report_channel_id);
    if (!reportChannel) {
      result.report = { channelMissing: true };
    } else {
      const canSend = botMember && reportChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages);
      if (!canSend) {
        result.report = { noPermission: true, channel: reportChannel };
      } else {
        // If this user already has a report (from a previous verification), delete
        // the old message and DB row first, so they end up with just one report.
        const existingReport = await getLastReportForUser(guild.id, member.id);
        let oldReportDeleted = false;
        if (existingReport) {
          const oldChannel = guild.channels.cache.get(existingReport.channel_id);
          if (oldChannel) {
            const oldMessage = await oldChannel.messages.fetch(existingReport.message_id).catch(() => null);
            if (oldMessage) {
              await oldMessage.delete().catch(() => null);
              oldReportDeleted = true;
            }
          }
          await deleteReport(existingReport.id);
        }

        const reportEmbed = buildReportEmbed({
          color: TYPE_COLORS[type],
          userMention: `${member.user}`,
          userAvatarURL: member.user.displayAvatarURL(),
          userId: member.id,
          verification,
          social,
          verifiedAtSeconds,
          moderatorMention,
        });

        const reportMessage = await reportChannel.send({ content: `${member.user}`, embeds: [reportEmbed] });

        await recordReport({
          guild_id: guild.id,
          user_id: member.id,
          type,
          channel_id: reportChannel.id,
          message_id: reportMessage.id,
          verification,
          social,
          verified_at: verifiedAtSeconds,
          moderator_id: moderatorId,
        });

        result.report = { posted: true, channel: reportChannel, message: reportMessage, oldReportDeleted };
      }
    }
  }

  return result;
}

// Updates one field of an existing report and keeps the live Discord embed in sync —
// shared by /verify edit's modal submit and the dashboard's report edit form. Returns
// { found: false } if the report no longer exists (row was deleted); otherwise
// { found: true, messageUpdated, report } — messageUpdated is false if the original
// message/channel could no longer be found (still saved to the DB either way).
async function updateReportAndSync(guild, reportId, field, value) {
  const report = await getReportById(reportId);
  if (!report) {
    return { found: false };
  }

  await updateReportField(reportId, field, value);

  const channel = guild.channels.cache.get(report.channel_id);
  const message = channel ? await channel.messages.fetch(report.message_id).catch(() => null) : null;

  if (!message) {
    return { found: true, messageUpdated: false, report };
  }

  const targetUser = await guild.client.users.fetch(report.user_id).catch(() => null);
  const moderator = report.moderator_id ? await guild.client.users.fetch(report.moderator_id).catch(() => null) : null;

  const updatedEmbed = buildReportEmbed({
    color: TYPE_COLORS[report.type],
    userMention: targetUser ? `${targetUser}` : `<@${report.user_id}>`,
    userAvatarURL: targetUser ? targetUser.displayAvatarURL() : null,
    userId: report.user_id,
    verification: field === 'verification' ? value : report.verification,
    social: field === 'social' ? value : report.social,
    verifiedAtSeconds: report.verified_at,
    moderatorMention: moderator ? `${moderator}` : report.moderator_id ? `<@${report.moderator_id}>` : 'Unknown',
  });

  await message.edit({ embeds: [updatedEmbed] });

  return { found: true, messageUpdated: true, report };
}

module.exports = {
  ValidationError,
  TYPES,
  TYPE_LABELS,
  TYPE_COLORS,
  EDITABLE_FIELDS,
  getGuildConfig,
  isEnabled,
  setEnabled,
  setConfig,
  setSubRoles,
  getSubRoles,
  assignDefaultSubRoleIfMissing,
  getRoleIdsForType,
  canUseVerifyCommands,
  recordReport,
  getLastReportForUser,
  getReportById,
  updateReportField,
  deleteReport,
  getAllReportsInGuild,
  performVerification,
  updateReportAndSync,
};

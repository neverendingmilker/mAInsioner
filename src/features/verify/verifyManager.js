const repo = require('./verifyRepository');
const { isMod } = require('../../utils/modRole');

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
  };

  await repo.setGuildConfig(guildId, merged);
  return merged;
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
function canUseVerifyCommands(member, config) {
  if (isMod(member)) return true;
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
  getRoleIdsForType,
  canUseVerifyCommands,
  recordReport,
  getLastReportForUser,
  getReportById,
  updateReportField,
  deleteReport,
};

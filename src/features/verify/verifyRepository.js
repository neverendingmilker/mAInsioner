const db = require('../../database/db');

// --- Guild config: which role to give / (optionally) remove for each verification
// type, the channel where verification reports get posted, and which role (besides
// Manage Roles holders) is allowed to run /verify sub, domme and maledom ---

async function getGuildConfig(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM verify_role_config WHERE guild_id = ?',
    args: [guildId],
  });

  const row = result.rows[0];
  return row
    ? {
        guild_id: row.guild_id,
        sub_give_role_id: row.sub_give_role_id,
        domme_give_role_id: row.domme_give_role_id,
        maledom_give_role_id: row.maledom_give_role_id,
        remove_role_id: row.remove_role_id,
        report_channel_id: row.report_channel_id,
        allowed_role_id: row.allowed_role_id,
        default_total_role_id: row.default_total_role_id,
      }
    : {
        guild_id: guildId,
        sub_give_role_id: null,
        domme_give_role_id: null,
        maledom_give_role_id: null,
        remove_role_id: null,
        report_channel_id: null,
        allowed_role_id: null,
        default_total_role_id: null,
      };
}

// Always writes all 7 columns (the manager merges with the existing row first, so
// callers never need to worry about accidentally clearing a value that wasn't touched).
async function setGuildConfig(guildId, fields) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO verify_role_config
            (guild_id, sub_give_role_id, domme_give_role_id, maledom_give_role_id, remove_role_id, report_channel_id, allowed_role_id, default_total_role_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET
            sub_give_role_id = excluded.sub_give_role_id,
            domme_give_role_id = excluded.domme_give_role_id,
            maledom_give_role_id = excluded.maledom_give_role_id,
            remove_role_id = excluded.remove_role_id,
            report_channel_id = excluded.report_channel_id,
            allowed_role_id = excluded.allowed_role_id,
            default_total_role_id = excluded.default_total_role_id`,
    args: [
      guildId,
      fields.sub_give_role_id,
      fields.domme_give_role_id,
      fields.maledom_give_role_id,
      fields.remove_role_id,
      fields.report_channel_id,
      fields.allowed_role_id,
      fields.default_total_role_id,
    ],
  });
}

// --- "Total" roles: an admin-configured set of roles (any number) that /verify sub
// checks a member against — if they hold NONE of them, the configured default role is
// assigned as a fallback. What the roles represent is up to the admin; the bot only
// checks membership in the set. ---

async function setTotalRoles(guildId, roleIds) {
  await db.ready;
  await db.client.execute({ sql: 'DELETE FROM verify_total_roles WHERE guild_id = ?', args: [guildId] });
  for (const roleId of roleIds) {
    await db.client.execute({
      sql: 'INSERT INTO verify_total_roles (guild_id, role_id) VALUES (?, ?)',
      args: [guildId, roleId],
    });
  }
}

async function getTotalRoles(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT role_id FROM verify_total_roles WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map((r) => r.role_id);
}

// --- Verification reports: one row per posted report embed, so it can be found
// again later (by user) and edited via /verify edit ---

function parseReportRow(row) {
  return {
    id: row.id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    type: row.type,
    channel_id: row.channel_id,
    message_id: row.message_id,
    verification: row.verification,
    social: row.social,
    verified_at: row.verified_at,
    moderator_id: row.moderator_id,
  };
}

async function insertReport(report) {
  await db.ready;
  const result = await db.client.execute({
    sql: `INSERT INTO verify_reports
            (guild_id, user_id, type, channel_id, message_id, verification, social, verified_at, moderator_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      report.guild_id,
      report.user_id,
      report.type,
      report.channel_id,
      report.message_id,
      report.verification,
      report.social,
      report.verified_at,
      report.moderator_id,
    ],
  });
  return Number(result.lastInsertRowid);
}

// The most recent report for this user in this guild, regardless of type (sub,
// domme or maledom) — matches "edit the last one" when several exist.
async function getLastReportForUser(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM verify_reports WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
    args: [guildId, userId],
  });
  return result.rows[0] ? parseReportRow(result.rows[0]) : null;
}

async function getReportById(id) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM verify_reports WHERE id = ?',
    args: [id],
  });
  return result.rows[0] ? parseReportRow(result.rows[0]) : null;
}

async function deleteReport(id) {
  await db.ready;
  await db.client.execute({
    sql: 'DELETE FROM verify_reports WHERE id = ?',
    args: [id],
  });
}

// `field` must be 'verification' or 'social' — validated by the caller (manager).
async function updateReportField(id, field, value) {
  await db.ready;
  await db.client.execute({
    sql: `UPDATE verify_reports SET ${field} = ? WHERE id = ?`,
    args: [value, id],
  });
}

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM verify_role_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Boolean(row.enabled) : true; // enabled by default until explicitly toggled off
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO verify_role_config (guild_id, enabled) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

module.exports = {
  getGuildConfig,
  setGuildConfig,
  setTotalRoles,
  getTotalRoles,
  isEnabled,
  setEnabled,
  insertReport,
  getLastReportForUser,
  getReportById,
  updateReportField,
  deleteReport,
};

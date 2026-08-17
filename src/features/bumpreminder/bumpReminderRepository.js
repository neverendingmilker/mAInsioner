const db = require('../../database/db');

// --- Guild config (posting channel + optional pinged role + pending-timer state) ---

async function getConfig(guildId) {
  await db.ready;
  const result = await db.client.execute({ sql: 'SELECT * FROM bumpreminder_config WHERE guild_id = ?', args: [guildId] });
  const row = result.rows[0];
  return row
    ? {
        guild_id: row.guild_id,
        channel_id: row.channel_id,
        role_id: row.role_id,
        next_reminder_at: row.next_reminder_at === null || row.next_reminder_at === undefined ? null : Number(row.next_reminder_at),
        last_bumped_by: row.last_bumped_by,
      }
    : { guild_id: guildId, channel_id: null, role_id: null, next_reminder_at: null, last_bumped_by: null };
}

async function setChannel(guildId, channelId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO bumpreminder_config (guild_id, channel_id) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
    args: [guildId, channelId],
  });
}

async function setRole(guildId, roleId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO bumpreminder_config (guild_id, role_id) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET role_id = excluded.role_id`,
    args: [guildId, roleId],
  });
}

// Arms the timer for the next reminder — called every time a Disboard bump is detected,
// including one that fires before a previous timer was ever consumed (a manual /bump
// outside the reminder flow just re-arms it to the new cooldown, nothing more to reconcile).
async function recordBump(guildId, nextReminderAt, bumpedByUserId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO bumpreminder_config (guild_id, next_reminder_at, last_bumped_by) VALUES (?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET next_reminder_at = excluded.next_reminder_at, last_bumped_by = excluded.last_bumped_by`,
    args: [guildId, nextReminderAt, bumpedByUserId],
  });
}

// Consumes the timer once the reminder has actually been posted, so the scheduler doesn't
// keep re-posting it every minute until the next bump.
async function clearReminder(guildId) {
  await db.ready;
  await db.client.execute({ sql: 'UPDATE bumpreminder_config SET next_reminder_at = NULL WHERE guild_id = ?', args: [guildId] });
}

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({ sql: 'SELECT enabled FROM bumpreminder_config WHERE guild_id = ?', args: [guildId] });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO bumpreminder_config (guild_id, enabled) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// Every guild whose timer is armed and already due (used by the scheduler) — enabled and
// channel-configured only, same shape as incidentRepository's getAllConfiguredGuilds.
async function getAllDueGuilds(now) {
  await db.ready;
  const result = await db.client.execute({
    sql: `SELECT * FROM bumpreminder_config
          WHERE next_reminder_at IS NOT NULL AND next_reminder_at <= ? AND enabled = 1 AND channel_id IS NOT NULL`,
    args: [now],
  });
  return result.rows;
}

module.exports = {
  getConfig,
  setChannel,
  setRole,
  recordBump,
  clearReminder,
  isEnabled,
  setEnabled,
  getAllDueGuilds,
};

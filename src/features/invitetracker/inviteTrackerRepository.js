const db = require('../../database/db');

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM invitetracker_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO invitetracker_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

async function recordJoin(guildId, memberId, inviterId, inviteCode) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO invitetracker_joins (guild_id, member_id, inviter_id, invite_code, joined_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [guildId, memberId, inviterId ?? null, inviteCode ?? null, Date.now()],
  });
}

// Closes the member's most recent still-open join record. If they'd joined more than
// once (left and came back before), only the latest open one is closed — the others
// were already closed by their own earlier departure.
async function recordLeave(guildId, memberId) {
  await db.ready;
  await db.client.execute({
    sql: `UPDATE invitetracker_joins
          SET left_at = ?
          WHERE id = (
            SELECT id FROM invitetracker_joins
            WHERE guild_id = ? AND member_id = ? AND left_at IS NULL
            ORDER BY joined_at DESC
            LIMIT 1
          )`,
    args: [Date.now(), guildId, memberId],
  });
}

// `current` = still in the server right now, `total` = everyone who ever joined
// through that inviter, including people who later left.
async function getLeaderboard(guildId, limit) {
  await db.ready;
  const result = await db.client.execute({
    sql: `SELECT inviter_id,
                 COUNT(*) AS total,
                 SUM(CASE WHEN left_at IS NULL THEN 1 ELSE 0 END) AS current
          FROM invitetracker_joins
          WHERE guild_id = ? AND inviter_id IS NOT NULL
          GROUP BY inviter_id
          ORDER BY current DESC, total DESC
          LIMIT ?`,
    args: [guildId, limit],
  });
  return result.rows.map((row) => ({
    inviterId: row.inviter_id,
    total: Number(row.total),
    current: Number(row.current),
  }));
}

async function getUserStats(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: `SELECT COUNT(*) AS total,
                 SUM(CASE WHEN left_at IS NULL THEN 1 ELSE 0 END) AS current
          FROM invitetracker_joins
          WHERE guild_id = ? AND inviter_id = ?`,
    args: [guildId, userId],
  });
  const row = result.rows[0];
  return { total: Number(row?.total ?? 0), current: Number(row?.current ?? 0) };
}

module.exports = { isEnabled, setEnabled, recordJoin, recordLeave, getLeaderboard, getUserStats };

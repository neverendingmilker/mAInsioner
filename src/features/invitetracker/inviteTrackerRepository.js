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

// --- Ad-hoc invites assigned to a specific user via `/invites create` ---
// Discord's own `invite.inviter` is whoever's token actually called the create-invite
// API — for these it's always the bot, not the person the invite is "for". This table
// is the source of truth for who a given code is credited to; resolveUsedInvite in the
// manager checks it before falling back to Discord's native inviter.

// Upsert: also used to re-assign a code that was already assigned to someone else (e.g.
// fixing a mistake), or to hand out a code manually via `/invites create code:<...>`.
async function assignInviteCode(guildId, code, assignedUserId, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO invitetracker_assigned_invites (guild_id, code, assigned_user_id, created_by, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, code) DO UPDATE SET
            assigned_user_id = excluded.assigned_user_id,
            created_by = excluded.created_by,
            created_at = excluded.created_at`,
    args: [guildId, code, assignedUserId, createdBy ?? null, Date.now()],
  });
}

async function getAssignedUser(guildId, code) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT assigned_user_id FROM invitetracker_assigned_invites WHERE guild_id = ? AND code = ?',
    args: [guildId, code],
  });
  return result.rows[0]?.assigned_user_id ?? null;
}

async function removeAssignedInvite(guildId, code) {
  await db.ready;
  await db.client.execute({
    sql: 'DELETE FROM invitetracker_assigned_invites WHERE guild_id = ? AND code = ?',
    args: [guildId, code],
  });
}

async function getAssignedInvites(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT code FROM invitetracker_assigned_invites WHERE guild_id = ? AND assigned_user_id = ?',
    args: [guildId, userId],
  });
  return result.rows.map((row) => row.code);
}

// The invite (if any) a user made/assigned for themselves — created_by = assigned_user_id
// distinguishes "I made this for me" from "a Mod made this for me", since only the
// former counts against the self-service one-at-a-time limit in /invites create.
async function getOwnAssignedInvite(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT code FROM invitetracker_assigned_invites WHERE guild_id = ? AND assigned_user_id = ? AND created_by = ? LIMIT 1',
    args: [guildId, userId, userId],
  });
  return result.rows[0]?.code ?? null;
}

async function getAllAssignedInvites(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT code, assigned_user_id FROM invitetracker_assigned_invites WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map((row) => ({ code: row.code, assignedUserId: row.assigned_user_id }));
}

module.exports = {
  isEnabled,
  setEnabled,
  recordJoin,
  recordLeave,
  getLeaderboard,
  getUserStats,
  assignInviteCode,
  getAssignedUser,
  removeAssignedInvite,
  getAssignedInvites,
  getOwnAssignedInvite,
  getAllAssignedInvites,
};

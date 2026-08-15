const db = require('../../database/db');

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM serverbackup_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO serverbackup_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// `data` is the full snapshot (roles/categories/channels), pre-serialized to a JSON string
// by the manager — this layer just stores/retrieves it, no knowledge of its shape.
// Snapshots aren't guild-scoped on read: this bot only ever runs for whoever owns it, and
// the whole point of a backup is being able to restore it onto a *different* (e.g. empty
// test) server than the one it was taken from — so `sourceGuildId`/`sourceGuildName` are
// kept only for display, never used to filter list/get.
async function saveSnapshot(sourceGuildId, sourceGuildName, label, data, createdBy) {
  await db.ready;
  const result = await db.client.execute({
    sql: `INSERT INTO serverbackup_snapshots (guild_id, guild_name, label, data, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [sourceGuildId, sourceGuildName ?? null, label ?? null, data, createdBy ?? null, Date.now()],
  });
  return Number(result.lastInsertRowid);
}

async function listSnapshots() {
  await db.ready;
  const result = await db.client.execute('SELECT id, guild_id, guild_name, label, created_by, created_at FROM serverbackup_snapshots ORDER BY created_at DESC');
  return result.rows.map((row) => ({
    id: Number(row.id),
    sourceGuildId: row.guild_id,
    sourceGuildName: row.guild_name,
    label: row.label,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
  }));
}

async function getSnapshot(id) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT id, guild_id, guild_name, label, data, created_by, created_at FROM serverbackup_snapshots WHERE id = ?',
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    sourceGuildId: row.guild_id,
    sourceGuildName: row.guild_name,
    label: row.label,
    data: row.data,
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
  };
}

module.exports = { isEnabled, setEnabled, saveSnapshot, listSnapshots, getSnapshot };

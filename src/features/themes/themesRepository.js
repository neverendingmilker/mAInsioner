const db = require('../../database/db');

// Straight copy of qotdRepository.js's shape — see that file for the reasoning behind the
// design (single config row per guild, ordered queue with a position column, cursor-based
// "next to post" tracking). Only the table/column names differ (theme instead of question).

// --- Config (one row per guild: channel/role, schedule, queue cursor, sheet URL) ---

function mapConfigRow(row) {
  return {
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    role_id: row.role_id,
    schedule_mode: row.schedule_mode,
    daily_time: row.daily_time,
    interval_hours: row.interval_hours === null || row.interval_hours === undefined ? null : Number(row.interval_hours),
    next_position: Number(row.next_position ?? 0),
    last_posted_at: row.last_posted_at === null || row.last_posted_at === undefined ? null : Number(row.last_posted_at),
    sheet_url: row.sheet_url,
  };
}

async function getConfig(guildId) {
  await db.ready;
  const result = await db.client.execute({ sql: 'SELECT * FROM themes_config WHERE guild_id = ?', args: [guildId] });
  const row = result.rows[0];
  return row
    ? mapConfigRow(row)
    : {
        guild_id: guildId,
        channel_id: null,
        role_id: null,
        schedule_mode: 'daily',
        daily_time: null,
        interval_hours: null,
        next_position: 0,
        last_posted_at: null,
        sheet_url: null,
      };
}

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({ sql: 'SELECT enabled FROM themes_config WHERE guild_id = ?', args: [guildId] });
  const row = result.rows[0];
  // Like QOTD (and unlike most features, enabled by default), Themes needs a
  // channel/schedule configured before it does anything useful — off until turned on.
  return row ? Number(row.enabled) === 1 : false;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO themes_config (guild_id, enabled) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

async function setChannel(guildId, channelId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO themes_config (guild_id, channel_id) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
    args: [guildId, channelId],
  });
}

async function setRole(guildId, roleId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO themes_config (guild_id, role_id) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET role_id = excluded.role_id`,
    args: [guildId, roleId],
  });
}

async function setSchedule(guildId, { scheduleMode, dailyTime, intervalHours }) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO themes_config (guild_id, schedule_mode, daily_time, interval_hours) VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET
            schedule_mode = excluded.schedule_mode,
            daily_time = excluded.daily_time,
            interval_hours = excluded.interval_hours`,
    args: [guildId, scheduleMode, dailyTime ?? null, intervalHours ?? null],
  });
}

async function setSheetUrl(guildId, url) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO themes_config (guild_id, sheet_url) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET sheet_url = excluded.sheet_url`,
    args: [guildId, url],
  });
}

// Advances the queue cursor and stamps the post time — called right after a successful post.
async function markPosted(guildId, nextPosition) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO themes_config (guild_id, next_position, last_posted_at) VALUES (?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET next_position = excluded.next_position, last_posted_at = excluded.last_posted_at`,
    args: [guildId, nextPosition, Date.now()],
  });
}

async function getAllConfiguredGuildIds() {
  await db.ready;
  const result = await db.client.execute("SELECT guild_id FROM themes_config WHERE enabled = 1 AND channel_id IS NOT NULL");
  return result.rows.map((row) => row.guild_id);
}

// --- Themes (ordered per guild) ---

function mapThemeRow(row) {
  return {
    id: Number(row.id),
    guild_id: row.guild_id,
    theme: row.theme,
    position: Number(row.position),
    source: row.source,
    created_at: Number(row.created_at),
  };
}

async function listThemes(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM themes_items WHERE guild_id = ? ORDER BY position ASC',
    args: [guildId],
  });
  return result.rows.map(mapThemeRow);
}

async function addTheme(guildId, theme, source) {
  await db.ready;
  const countResult = await db.client.execute({
    sql: 'SELECT COUNT(*) AS c FROM themes_items WHERE guild_id = ?',
    args: [guildId],
  });
  const nextPos = Number(countResult.rows[0]?.c ?? 0);
  await db.client.execute({
    sql: `INSERT INTO themes_items (guild_id, theme, position, source, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [guildId, theme, nextPos, source, Date.now()],
  });
}

async function updateThemeText(guildId, id, theme) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'UPDATE themes_items SET theme = ? WHERE guild_id = ? AND id = ?',
    args: [theme, guildId, id],
  });
  return result.rowsAffected ?? 0;
}

// Deletes one theme and compacts the remaining positions to stay contiguous (0..N-1) —
// keeps the queue cursor's meaning ("index into the ordered list") stable.
async function removeTheme(guildId, id) {
  await db.ready;
  await db.client.execute({ sql: 'DELETE FROM themes_items WHERE guild_id = ? AND id = ?', args: [guildId, id] });
  await compactPositions(guildId);
}

// Applies a brand-new order (array of theme IDs, in the desired order) — used by the
// dashboard's drag-and-drop reordering. IDs not belonging to this guild are ignored.
async function reorderThemes(guildId, orderedIds) {
  await db.ready;
  const existing = await listThemes(guildId);
  const existingIds = new Set(existing.map((t) => t.id));
  const filteredOrder = orderedIds.filter((id) => existingIds.has(id));
  // Any theme missing from the submitted order (shouldn't normally happen) keeps its
  // relative place at the end, so nothing silently disappears from the queue.
  const missing = existing.map((t) => t.id).filter((id) => !filteredOrder.includes(id));
  const finalOrder = [...filteredOrder, ...missing];

  for (let i = 0; i < finalOrder.length; i++) {
    await db.client.execute({
      sql: 'UPDATE themes_items SET position = ? WHERE guild_id = ? AND id = ?',
      args: [i, guildId, finalOrder[i]],
    });
  }
}

async function compactPositions(guildId) {
  const rows = await listThemes(guildId);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].position !== i) {
      await db.client.execute({
        sql: 'UPDATE themes_items SET position = ? WHERE guild_id = ? AND id = ?',
        args: [i, guildId, rows[i].id],
      });
    }
  }
}

module.exports = {
  getConfig,
  isEnabled,
  setEnabled,
  setChannel,
  setRole,
  setSchedule,
  setSheetUrl,
  markPosted,
  getAllConfiguredGuildIds,
  listThemes,
  addTheme,
  updateThemeText,
  removeTheme,
  reorderThemes,
};

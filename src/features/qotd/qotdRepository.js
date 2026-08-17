const db = require('../../database/db');

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
    sheet_column: row.sheet_column,
  };
}

async function getConfig(guildId) {
  await db.ready;
  const result = await db.client.execute({ sql: 'SELECT * FROM qotd_config WHERE guild_id = ?', args: [guildId] });
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
        sheet_column: null,
      };
}

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({ sql: 'SELECT enabled FROM qotd_config WHERE guild_id = ?', args: [guildId] });
  const row = result.rows[0];
  // Unlike most features (enabled by default), QOTD needs a channel/schedule configured
  // before it does anything useful — defaults to off until an admin turns it on.
  return row ? Number(row.enabled) === 1 : false;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO qotd_config (guild_id, enabled) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

async function setChannel(guildId, channelId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO qotd_config (guild_id, channel_id) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
    args: [guildId, channelId],
  });
}

async function setRole(guildId, roleId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO qotd_config (guild_id, role_id) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET role_id = excluded.role_id`,
    args: [guildId, roleId],
  });
}

async function setSchedule(guildId, { scheduleMode, dailyTime, intervalHours }) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO qotd_config (guild_id, schedule_mode, daily_time, interval_hours) VALUES (?, ?, ?, ?)
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
    sql: `INSERT INTO qotd_config (guild_id, sheet_url) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET sheet_url = excluded.sheet_url`,
    args: [guildId, url],
  });
}

async function setSheetColumn(guildId, columnName) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO qotd_config (guild_id, sheet_column) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET sheet_column = excluded.sheet_column`,
    args: [guildId, columnName],
  });
}

// Advances the queue cursor and stamps the post time — called right after a successful post.
async function markPosted(guildId, nextPosition) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO qotd_config (guild_id, next_position, last_posted_at) VALUES (?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET next_position = excluded.next_position, last_posted_at = excluded.last_posted_at`,
    args: [guildId, nextPosition, Date.now()],
  });
}

async function getAllConfiguredGuildIds() {
  await db.ready;
  const result = await db.client.execute("SELECT guild_id FROM qotd_config WHERE enabled = 1 AND channel_id IS NOT NULL");
  return result.rows.map((row) => row.guild_id);
}

// --- Questions (ordered per guild) ---

function mapQuestionRow(row) {
  return {
    id: Number(row.id),
    guild_id: row.guild_id,
    question: row.question,
    position: Number(row.position),
    source: row.source,
    created_at: Number(row.created_at),
  };
}

async function listQuestions(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM qotd_questions WHERE guild_id = ? ORDER BY position ASC',
    args: [guildId],
  });
  return result.rows.map(mapQuestionRow);
}

async function addQuestion(guildId, question, source) {
  await db.ready;
  const countResult = await db.client.execute({
    sql: 'SELECT COUNT(*) AS c FROM qotd_questions WHERE guild_id = ?',
    args: [guildId],
  });
  const nextPos = Number(countResult.rows[0]?.c ?? 0);
  await db.client.execute({
    sql: `INSERT INTO qotd_questions (guild_id, question, position, source, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [guildId, question, nextPos, source, Date.now()],
  });
}

async function updateQuestionText(guildId, id, question) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'UPDATE qotd_questions SET question = ? WHERE guild_id = ? AND id = ?',
    args: [question, guildId, id],
  });
  return result.rowsAffected ?? 0;
}

// Deletes one question and compacts the remaining positions to stay contiguous
// (0..N-1) — keeps the queue cursor's meaning ("index into the ordered list") stable.
async function removeQuestion(guildId, id) {
  await db.ready;
  await db.client.execute({ sql: 'DELETE FROM qotd_questions WHERE guild_id = ? AND id = ?', args: [guildId, id] });
  await compactPositions(guildId);
}

// Empties the whole queue for a guild in one go and resets the cursor back to 0, so a
// freshly-refilled queue (manual add or a new sheet sync) starts posting from the top
// instead of resuming from wherever the old, now-gone queue had gotten to.
async function clearQuestions(guildId) {
  await db.ready;
  await db.client.execute({ sql: 'DELETE FROM qotd_questions WHERE guild_id = ?', args: [guildId] });
  await db.client.execute({
    sql: `INSERT INTO qotd_config (guild_id, next_position) VALUES (?, 0)
          ON CONFLICT(guild_id) DO UPDATE SET next_position = 0`,
    args: [guildId],
  });
}

// Applies a brand-new order (array of question IDs, in the desired order) — used by the
// dashboard's drag-and-drop reordering. IDs not belonging to this guild are ignored.
async function reorderQuestions(guildId, orderedIds) {
  await db.ready;
  const existing = await listQuestions(guildId);
  const existingIds = new Set(existing.map((q) => q.id));
  const filteredOrder = orderedIds.filter((id) => existingIds.has(id));
  // Any question missing from the submitted order (shouldn't normally happen) keeps its
  // relative place at the end, so nothing silently disappears from the queue.
  const missing = existing.map((q) => q.id).filter((id) => !filteredOrder.includes(id));
  const finalOrder = [...filteredOrder, ...missing];

  for (let i = 0; i < finalOrder.length; i++) {
    await db.client.execute({
      sql: 'UPDATE qotd_questions SET position = ? WHERE guild_id = ? AND id = ?',
      args: [i, guildId, finalOrder[i]],
    });
  }
}

async function compactPositions(guildId) {
  const rows = await listQuestions(guildId);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].position !== i) {
      await db.client.execute({
        sql: 'UPDATE qotd_questions SET position = ? WHERE guild_id = ? AND id = ?',
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
  setSheetColumn,
  markPosted,
  getAllConfiguredGuildIds,
  listQuestions,
  addQuestion,
  updateQuestionText,
  removeQuestion,
  clearQuestions,
  reorderQuestions,
};

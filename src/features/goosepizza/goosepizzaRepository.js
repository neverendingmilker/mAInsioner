const db = require('../../database/db');

const DEFAULT_TRIGGER = 'pizza';
const DEFAULT_EMOJI = '<:pizza01:902913234959495188>';
const DEFAULT_RESPONSE_MODE = 'message';

// --- Feature on/off toggle (per guild, applies to every trigger configured in it) ---

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM goosepizza_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO goosepizza_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Triggers (a guild can have several, independent from each other) ---

function mapTriggerRow(row) {
  return {
    id: row.id,
    guild_id: row.guild_id,
    name: row.name,
    channel_id: row.channel_id,
    trigger_text: row.trigger_text,
    emoji: row.emoji,
    response_mode: row.response_mode,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

async function createTrigger(guildId, name, channelId, triggerText, emoji, responseMode, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO goosepizza_triggers (guild_id, name, channel_id, trigger_text, emoji, response_mode, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [guildId, name, channelId, triggerText, emoji, responseMode, createdBy, Date.now()],
  });
}

// Partial update: only columns present in `fields` are touched.
async function updateTrigger(guildId, name, fields) {
  await db.ready;
  const columns = Object.keys(fields);
  if (columns.length === 0) return 0;

  const setClause = columns.map((col) => `${col} = ?`).join(', ');
  const args = [...columns.map((col) => fields[col]), guildId, name];

  const result = await db.client.execute({
    sql: `UPDATE goosepizza_triggers SET ${setClause} WHERE guild_id = ? AND name = ?`,
    args,
  });
  return result.rowsAffected ?? 0;
}

async function removeTrigger(guildId, name) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM goosepizza_triggers WHERE guild_id = ? AND name = ?',
    args: [guildId, name],
  });
  return result.rowsAffected ?? 0;
}

async function getByName(guildId, name) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM goosepizza_triggers WHERE guild_id = ? AND name = ?',
    args: [guildId, name],
  });
  return result.rows[0] ? mapTriggerRow(result.rows[0]) : null;
}

async function getAllInGuild(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM goosepizza_triggers WHERE guild_id = ? ORDER BY name COLLATE NOCASE',
    args: [guildId],
  });
  return result.rows.map(mapTriggerRow);
}

// Triggers configured to watch a given channel — a channel can have more than one
// independent trigger (different words/emojis/modes) at once.
async function getTriggersForChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM goosepizza_triggers WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rows.map(mapTriggerRow);
}

module.exports = {
  DEFAULT_TRIGGER,
  DEFAULT_EMOJI,
  DEFAULT_RESPONSE_MODE,
  isEnabled,
  setEnabled,
  createTrigger,
  updateTrigger,
  removeTrigger,
  getByName,
  getAllInGuild,
  getTriggersForChannel,
};

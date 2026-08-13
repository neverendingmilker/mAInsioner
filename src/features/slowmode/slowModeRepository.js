const db = require('../../database/db');

// --- Feature on/off toggle ---

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM slowmode_guild_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO slowmode_guild_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Per-channel limits ---

async function setLimit(guildId, channelId, cooldownSeconds, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO slowmode_channels (guild_id, channel_id, cooldown_seconds, created_by, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            cooldown_seconds = excluded.cooldown_seconds,
            created_by = excluded.created_by,
            created_at = excluded.created_at`,
    args: [guildId, channelId, cooldownSeconds, createdBy, Date.now()],
  });
}

async function removeLimit(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM slowmode_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rowsAffected ?? 0;
}

async function getLimitForChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM slowmode_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rows[0] ?? null;
}

async function getAllLimits(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM slowmode_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows;
}

// --- Per-user last-allowed-message tracking ---

async function getLastMessageAt(guildId, channelId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT last_message_at FROM slowmode_last_message WHERE guild_id = ? AND channel_id = ? AND user_id = ?',
    args: [guildId, channelId, userId],
  });
  return result.rows[0] ? Number(result.rows[0].last_message_at) : null;
}

async function setLastMessageAt(guildId, channelId, userId, timestamp) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO slowmode_last_message (guild_id, channel_id, user_id, last_message_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id, user_id) DO UPDATE SET last_message_at = excluded.last_message_at`,
    args: [guildId, channelId, userId, timestamp],
  });
}

module.exports = {
  isEnabled,
  setEnabled,
  setLimit,
  removeLimit,
  getLimitForChannel,
  getAllLimits,
  getLastMessageAt,
  setLastMessageAt,
};

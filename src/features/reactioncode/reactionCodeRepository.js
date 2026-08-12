const db = require('../../database/db');

// --- Feature on/off toggle ---

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM reactioncode_guild_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO reactioncode_guild_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Per-channel setup ---

async function addChannel(guildId, channelId, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO reactioncode_channels (guild_id, channel_id, created_by, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO NOTHING`,
    args: [guildId, channelId, createdBy, Date.now()],
  });
}

async function removeChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM reactioncode_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  await db.client.execute({
    sql: 'DELETE FROM reactioncode_digits WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rowsAffected ?? 0;
}

async function hasChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT 1 FROM reactioncode_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rows.length > 0;
}

async function getAllChannels(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT channel_id FROM reactioncode_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map((row) => row.channel_id);
}

// --- Per-channel digit -> emoji mapping ---

async function setDigit(guildId, channelId, digit, emoji) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO reactioncode_digits (guild_id, channel_id, digit, emoji)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id, digit) DO UPDATE SET emoji = excluded.emoji`,
    args: [guildId, channelId, digit, emoji],
  });
}

async function removeDigit(guildId, channelId, digit) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM reactioncode_digits WHERE guild_id = ? AND channel_id = ? AND digit = ?',
    args: [guildId, channelId, digit],
  });
  return result.rowsAffected ?? 0;
}

async function getDigitMap(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT digit, emoji FROM reactioncode_digits WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  const map = new Map();
  for (const row of result.rows) map.set(row.digit, row.emoji);
  return map;
}

module.exports = {
  isEnabled,
  setEnabled,
  addChannel,
  removeChannel,
  hasChannel,
  getAllChannels,
  setDigit,
  removeDigit,
  getDigitMap,
};

const db = require('../../database/db');

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM honeypot_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO honeypot_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

async function addChannel(guildId, channelId, messageId, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO honeypot_channels (guild_id, channel_id, message_id, created_by, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            message_id = excluded.message_id,
            created_by = excluded.created_by,
            created_at = excluded.created_at`,
    args: [guildId, channelId, messageId, createdBy, Date.now()],
  });
}

async function removeChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM honeypot_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rowsAffected ?? 0;
}

async function getChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM honeypot_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  const row = result.rows[0];
  return row ? { channelId: row.channel_id, messageId: row.message_id } : null;
}

async function getAllChannels(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM honeypot_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map((row) => ({ channelId: row.channel_id, messageId: row.message_id }));
}

module.exports = {
  isEnabled,
  setEnabled,
  addChannel,
  removeChannel,
  getChannel,
  getAllChannels,
};

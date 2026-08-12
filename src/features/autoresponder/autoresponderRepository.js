const db = require('../../database/db');

// --- Feature on/off toggle ---

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM autoresponder_guild_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO autoresponder_guild_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Per-channel emoji configuration ---

async function setChannel(guildId, channelId, emojis, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO autoresponder_channels (guild_id, channel_id, emojis, created_by, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            emojis = excluded.emojis,
            created_by = excluded.created_by,
            created_at = excluded.created_at`,
    args: [guildId, channelId, JSON.stringify(emojis), createdBy, Date.now()],
  });
}

async function removeChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM autoresponder_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rowsAffected ?? 0;
}

function mapRow(row) {
  return { channelId: row.channel_id, emojis: JSON.parse(row.emojis) };
}

async function getChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM autoresponder_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function getAllChannels(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM autoresponder_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map(mapRow);
}

module.exports = {
  isEnabled,
  setEnabled,
  setChannel,
  removeChannel,
  getChannel,
  getAllChannels,
};

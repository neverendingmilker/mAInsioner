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

async function addChannel(guildId, channelId, messageId, createdBy, emoji) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO honeypot_channels (guild_id, channel_id, message_id, created_by, created_at, emoji)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            message_id = excluded.message_id,
            created_by = excluded.created_by,
            created_at = excluded.created_at,
            emoji = excluded.emoji`,
    args: [guildId, channelId, messageId, createdBy, Date.now(), emoji || null],
  });
}

// Updates just the reaction emoji for an in-place trap edit (see honeypotManager.editChannel)
// — unlike addChannel, doesn't touch message_id/created_by/created_at, since the message
// itself hasn't changed, only its bait reaction.
async function updateEmoji(guildId, channelId, emoji) {
  await db.ready;
  await db.client.execute({
    sql: 'UPDATE honeypot_channels SET emoji = ? WHERE guild_id = ? AND channel_id = ?',
    args: [emoji || null, guildId, channelId],
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
  return row ? { channelId: row.channel_id, messageId: row.message_id, emoji: row.emoji || null } : null;
}

async function getAllChannels(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM honeypot_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map((row) => ({ channelId: row.channel_id, messageId: row.message_id, emoji: row.emoji || null }));
}

async function logKick(guildId, userId, userTag, channelId, triggerType) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO honeypot_kicks (guild_id, user_id, user_tag, channel_id, trigger_type, kicked_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [guildId, userId, userTag ?? null, channelId, triggerType, Date.now()],
  });
}

async function getKickCount(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT COUNT(*) AS count FROM honeypot_kicks WHERE guild_id = ?',
    args: [guildId],
  });
  return Number(result.rows[0]?.count ?? 0);
}

async function getRecentKicks(guildId, limit) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM honeypot_kicks WHERE guild_id = ? ORDER BY kicked_at DESC LIMIT ?',
    args: [guildId, limit],
  });
  return result.rows.map((row) => ({
    userId: row.user_id,
    userTag: row.user_tag,
    channelId: row.channel_id,
    trigger: row.trigger_type,
    kickedAt: Number(row.kicked_at),
  }));
}

module.exports = {
  isEnabled,
  setEnabled,
  addChannel,
  updateEmoji,
  removeChannel,
  getChannel,
  getAllChannels,
  logKick,
  getKickCount,
  getRecentKicks,
};

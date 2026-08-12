const db = require('../../database/db');

// --- Feature on/off toggle ---

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM reactionlimit_guild_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO reactionlimit_guild_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Per-channel configuration ---

async function setChannel(guildId, channelId, ignoreFirstPost, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO reactionlimit_channels (guild_id, channel_id, ignore_first_post, created_by, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            ignore_first_post = excluded.ignore_first_post,
            created_by = excluded.created_by,
            created_at = excluded.created_at`,
    args: [guildId, channelId, ignoreFirstPost ? 1 : 0, createdBy, Date.now()],
  });
}

async function removeChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM reactionlimit_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rowsAffected ?? 0;
}

function mapChannelRow(row) {
  return { channelId: row.channel_id, ignoreFirstPost: Number(row.ignore_first_post) === 1 };
}

async function getChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM reactionlimit_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rows[0] ? mapChannelRow(result.rows[0]) : null;
}

async function getAllChannels(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM reactionlimit_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map(mapChannelRow);
}

// --- Per-user, per-thread running reaction count ---

async function getCount(guildId, threadId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT count FROM reactionlimit_thread_counts WHERE guild_id = ? AND thread_id = ? AND user_id = ?',
    args: [guildId, threadId, userId],
  });
  return result.rows[0] ? Number(result.rows[0].count) : 0;
}

async function incrementCount(guildId, threadId, userId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO reactionlimit_thread_counts (guild_id, thread_id, user_id, count)
          VALUES (?, ?, ?, 1)
          ON CONFLICT(guild_id, thread_id, user_id) DO UPDATE SET count = count + 1`,
    args: [guildId, threadId, userId],
  });
}

async function decrementCount(guildId, threadId, userId) {
  await db.ready;
  await db.client.execute({
    sql: `UPDATE reactionlimit_thread_counts SET count = MAX(0, count - 1)
          WHERE guild_id = ? AND thread_id = ? AND user_id = ?`,
    args: [guildId, threadId, userId],
  });
}

module.exports = {
  isEnabled,
  setEnabled,
  setChannel,
  removeChannel,
  getChannel,
  getAllChannels,
  getCount,
  incrementCount,
  decrementCount,
};

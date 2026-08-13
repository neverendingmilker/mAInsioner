const db = require('../../database/db');

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM highlight_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true; // enabled by default until explicitly toggled off
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO highlight_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Words ---

async function addWord(guildId, userId, word) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO highlight_words (guild_id, user_id, word, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id, user_id, word) DO NOTHING`,
    args: [guildId, userId, word, Date.now()],
  });
}

async function removeWord(guildId, userId, word) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM highlight_words WHERE guild_id = ? AND user_id = ? AND word = ?',
    args: [guildId, userId, word],
  });
  return result.rowsAffected ?? 0;
}

async function getWordsForUser(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT word FROM highlight_words WHERE guild_id = ? AND user_id = ? ORDER BY word COLLATE NOCASE',
    args: [guildId, userId],
  });
  return result.rows.map((r) => r.word);
}

async function getAllWordsInGuild(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT user_id, word FROM highlight_words WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows;
}

// --- Ignored channels (per user) ---

async function toggleIgnoredChannel(guildId, userId, channelId) {
  await db.ready;
  const existing = await db.client.execute({
    sql: 'SELECT 1 FROM highlight_ignored_channels WHERE guild_id = ? AND user_id = ? AND channel_id = ?',
    args: [guildId, userId, channelId],
  });
  if (existing.rows.length > 0) {
    await db.client.execute({
      sql: 'DELETE FROM highlight_ignored_channels WHERE guild_id = ? AND user_id = ? AND channel_id = ?',
      args: [guildId, userId, channelId],
    });
    return 'removed';
  }
  await db.client.execute({
    sql: 'INSERT INTO highlight_ignored_channels (guild_id, user_id, channel_id) VALUES (?, ?, ?)',
    args: [guildId, userId, channelId],
  });
  return 'added';
}

async function getIgnoredChannels(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT channel_id FROM highlight_ignored_channels WHERE guild_id = ? AND user_id = ?',
    args: [guildId, userId],
  });
  return result.rows.map((r) => r.channel_id);
}

// --- Channel mode (per user): 'exclude' (default) treats the list above as an ignore
// list — highlighted everywhere except those channels. 'include' flips it into an
// allowlist — highlighted ONLY in those channels. ---

async function getChannelMode(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT mode FROM highlight_channel_mode WHERE guild_id = ? AND user_id = ?',
    args: [guildId, userId],
  });
  return result.rows[0]?.mode ?? 'exclude';
}

async function setChannelMode(guildId, userId, mode) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO highlight_channel_mode (guild_id, user_id, mode)
          VALUES (?, ?, ?)
          ON CONFLICT(guild_id, user_id) DO UPDATE SET mode = excluded.mode`,
    args: [guildId, userId, mode],
  });
}

// --- Ignored users (per user) ---

async function toggleIgnoredUser(guildId, userId, ignoredUserId) {
  await db.ready;
  const existing = await db.client.execute({
    sql: 'SELECT 1 FROM highlight_ignored_users WHERE guild_id = ? AND user_id = ? AND ignored_user_id = ?',
    args: [guildId, userId, ignoredUserId],
  });
  if (existing.rows.length > 0) {
    await db.client.execute({
      sql: 'DELETE FROM highlight_ignored_users WHERE guild_id = ? AND user_id = ? AND ignored_user_id = ?',
      args: [guildId, userId, ignoredUserId],
    });
    return 'removed';
  }
  await db.client.execute({
    sql: 'INSERT INTO highlight_ignored_users (guild_id, user_id, ignored_user_id) VALUES (?, ?, ?)',
    args: [guildId, userId, ignoredUserId],
  });
  return 'added';
}

async function getIgnoredUsers(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT ignored_user_id FROM highlight_ignored_users WHERE guild_id = ? AND user_id = ?',
    args: [guildId, userId],
  });
  return result.rows.map((r) => r.ignored_user_id);
}

// --- Notification cooldown (per user per channel) ---

async function getLastNotified(guildId, userId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT notified_at FROM highlight_last_notified WHERE guild_id = ? AND user_id = ? AND channel_id = ?',
    args: [guildId, userId, channelId],
  });
  return result.rows[0] ? Number(result.rows[0].notified_at) : null;
}

async function setLastNotified(guildId, userId, channelId, timestamp) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO highlight_last_notified (guild_id, user_id, channel_id, notified_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id, user_id, channel_id) DO UPDATE SET notified_at = excluded.notified_at`,
    args: [guildId, userId, channelId, timestamp],
  });
}

module.exports = {
  isEnabled,
  setEnabled,
  addWord,
  removeWord,
  getWordsForUser,
  getAllWordsInGuild,
  toggleIgnoredChannel,
  getIgnoredChannels,
  getChannelMode,
  setChannelMode,
  toggleIgnoredUser,
  getIgnoredUsers,
  getLastNotified,
  setLastNotified,
};

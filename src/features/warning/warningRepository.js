const db = require('../../database/db');

// --- Feature on/off toggle ---

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM warning_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO warning_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Guild config: channel, the two assignable roles, and the tracked embed message ---

async function getConfig(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM warning_config WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows[0] ?? null;
}

async function setRoles(guildId, role1Id, role2Id) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO warning_config (guild_id, role_1_id, role_2_id)
          VALUES (?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET role_1_id = excluded.role_1_id, role_2_id = excluded.role_2_id`,
    args: [guildId, role1Id, role2Id],
  });
}

async function setChannel(guildId, channelId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO warning_config (guild_id, channel_id)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, embed_message_id = NULL`,
    args: [guildId, channelId],
  });
}

async function setEmbedMessageId(guildId, messageId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO warning_config (guild_id, embed_message_id)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET embed_message_id = excluded.embed_message_id`,
    args: [guildId, messageId],
  });
}

// --- Warning entries ---

async function addWarning(guildId, userId, type, reason, roleId, issuedBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO warnings (guild_id, user_id, type, reason, role_id, issued_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [guildId, userId, type, reason, roleId ?? null, issuedBy, Date.now()],
  });
}

// All warnings for a guild, oldest first — the manager groups these by user and decides
// display order (most recently warned user first).
async function getAllWarnings(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at ASC',
    args: [guildId],
  });
  return result.rows;
}

async function getWarningsForUser(guildId, userId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at ASC',
    args: [guildId, userId],
  });
  return result.rows;
}

module.exports = {
  isEnabled,
  setEnabled,
  getConfig,
  setRoles,
  setChannel,
  setEmbedMessageId,
  addWarning,
  getAllWarnings,
  getWarningsForUser,
};

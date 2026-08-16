const db = require('../database/db');

async function getModRoleId(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT mod_role_id FROM bot_guild_config WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows[0]?.mod_role_id ?? null;
}

async function setModRoleId(guildId, roleId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO bot_guild_config (guild_id, mod_role_id)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET mod_role_id = excluded.mod_role_id`,
    args: [guildId, roleId],
  });
}

module.exports = { getModRoleId, setModRoleId };

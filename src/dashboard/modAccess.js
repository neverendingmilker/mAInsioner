const db = require('../database/db');

// Per-guild, per-feature opt-in: does this server's Mod role also get to use a given
// dashboard feature page (in addition to Admins, who always can)? A row's presence means
// "allowed" — there's no separate enabled/disabled column, since absence already means
// "not allowed" (the safe default). See requireDashboardAccess (middleware/requireAdmin.js)
// for where this is actually enforced, and routes/modAccessRoutes.js for the Admin-only
// toggle that writes here.

async function isFeatureModAccessible(guildId, featureKey) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT 1 FROM dashboard_mod_access WHERE guild_id = ? AND feature_key = ?',
    args: [guildId, featureKey],
  });
  return result.rows.length > 0;
}

async function listModAccessibleFeatureKeys(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT feature_key FROM dashboard_mod_access WHERE guild_id = ?',
    args: [guildId],
  });
  return new Set(result.rows.map((row) => row.feature_key));
}

async function setFeatureModAccess(guildId, featureKey, allowed) {
  await db.ready;
  if (allowed) {
    await db.client.execute({
      sql: `INSERT INTO dashboard_mod_access (guild_id, feature_key) VALUES (?, ?)
            ON CONFLICT(guild_id, feature_key) DO NOTHING`,
      args: [guildId, featureKey],
    });
  } else {
    await db.client.execute({
      sql: 'DELETE FROM dashboard_mod_access WHERE guild_id = ? AND feature_key = ?',
      args: [guildId, featureKey],
    });
  }
}

module.exports = { isFeatureModAccessible, listModAccessibleFeatureKeys, setFeatureModAccess };

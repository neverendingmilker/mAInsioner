const db = require('../database/db');

// Per-guild, per-feature "locked" flag — freezes that feature's own add/edit/remove/
// reorder forms (its list of items) without touching its on/off state or its base config
// (channel/role/schedule). A row's presence means "locked", same convention as
// modAccess.js's dashboard_mod_access. Admin-only to toggle (see
// routes/featureLockRoutes.js); enforced for both Admin and Mod sessions in
// middleware/requireAdmin.js.

async function isFeatureLocked(guildId, featureKey) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT 1 FROM dashboard_feature_lock WHERE guild_id = ? AND feature_key = ?',
    args: [guildId, featureKey],
  });
  return result.rows.length > 0;
}

async function setFeatureLocked(guildId, featureKey, locked) {
  await db.ready;
  if (locked) {
    await db.client.execute({
      sql: `INSERT INTO dashboard_feature_lock (guild_id, feature_key) VALUES (?, ?)
            ON CONFLICT(guild_id, feature_key) DO NOTHING`,
      args: [guildId, featureKey],
    });
  } else {
    await db.client.execute({
      sql: 'DELETE FROM dashboard_feature_lock WHERE guild_id = ? AND feature_key = ?',
      args: [guildId, featureKey],
    });
  }
}

module.exports = { isFeatureLocked, setFeatureLocked };

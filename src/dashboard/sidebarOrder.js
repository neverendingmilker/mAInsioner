const db = require('../database/db');

// Per-guild custom drag-and-drop order for the sidebar's Feature list — Admin-only to
// change (see routes/sidebarOrderRoutes.js), applied for everyone who can see that
// sidebar (Admin and Mod alike, see middleware/requireAdmin.js). One row per guild,
// `order_json` a JSON array of feature keys in the order an Admin last saved. See
// sidebarData.js's getSidebarFeatures for how a key missing from the array falls back
// to its default alphabetical position.

async function getOrder(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT order_json FROM dashboard_sidebar_order WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.order_json);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

async function setOrder(guildId, orderedKeys) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO dashboard_sidebar_order (guild_id, order_json) VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET order_json = excluded.order_json`,
    args: [guildId, JSON.stringify(orderedKeys)],
  });
}

module.exports = { getOrder, setOrder };

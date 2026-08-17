const db = require('../database/db');

// Per-guild, per-feature custom drag-and-drop order for the "cards" (panel sections)
// inside a single feature page — Admin-only to change (see routes/cardOrderRoutes.js),
// applied for everyone who can open that feature page (Admin and Mod alike, see
// middleware/requireAdmin.js). One row per guild+feature, `order_json` a JSON array of
// that page's card ids in the order an Admin last saved. See each view's `data-card-id`
// attributes and public/cardReorder.js for how a card id missing from the array falls
// back to its default position.

async function getOrder(guildId, featureKey) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT order_json FROM dashboard_card_order WHERE guild_id = ? AND feature_key = ?',
    args: [guildId, featureKey],
  });
  const row = result.rows[0];
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.order_json);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function setOrder(guildId, featureKey, orderedIds) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO dashboard_card_order (guild_id, feature_key, order_json) VALUES (?, ?, ?)
          ON CONFLICT(guild_id, feature_key) DO UPDATE SET order_json = excluded.order_json`,
    args: [guildId, featureKey, JSON.stringify(orderedIds)],
  });
}

module.exports = { getOrder, setOrder };

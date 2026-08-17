const db = require('../database/db');

// Per-guild, per-feature saved grid position size for each card on a feature page — Admin-
// only to change (see routes/cardOrderRoutes.js, which saves this alongside card order in
// the same request), applied for everyone who can open that feature page (Admin and Mod
// alike, see middleware/requireAdmin.js). One row per guild+feature, `sizes` a plain object
// keyed by that page's `data-card-id` values, each a CSS Grid span, e.g.
// { sessioni: { colSpan: 1, rowSpan: 2 } } — colSpan out of the grid's fixed 3 columns,
// rowSpan in row units (see public/style.css's `.card-list` and public/cardReorder.js's
// COLS/ROW_UNIT/MAX_ROW_SPAN, which this clamps against). Standard for every feature page's
// card list, current and future — see public/cardReorder.js and any view's
// `#card-list`/`.panel[data-card-id]` markup.

const MAX_COL_SPAN = 3;
const MAX_ROW_SPAN = 6;

function sanitizeSizes(sizes) {
  if (!sizes || typeof sizes !== 'object') return {};
  const clean = {};
  for (const [cardId, size] of Object.entries(sizes)) {
    if (typeof cardId !== 'string' || !cardId) continue;
    if (!size || typeof size !== 'object') continue;
    const colSpan = Math.round(Number(size.colSpan));
    const rowSpan = Math.round(Number(size.rowSpan));
    if (!Number.isFinite(colSpan) || !Number.isFinite(rowSpan)) continue;
    clean[cardId] = { colSpan: Math.min(MAX_COL_SPAN, Math.max(1, colSpan)), rowSpan: Math.min(MAX_ROW_SPAN, Math.max(1, rowSpan)) };
  }
  return clean;
}

async function getSizes(guildId, featureKey) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT sizes_json FROM dashboard_card_size WHERE guild_id = ? AND feature_key = ?',
    args: [guildId, featureKey],
  });
  const row = result.rows[0];
  if (!row) return {};
  try {
    return sanitizeSizes(JSON.parse(row.sizes_json));
  } catch {
    return {};
  }
}

async function setSizes(guildId, featureKey, sizes) {
  await db.ready;
  const clean = sanitizeSizes(sizes);
  await db.client.execute({
    sql: `INSERT INTO dashboard_card_size (guild_id, feature_key, sizes_json) VALUES (?, ?, ?)
          ON CONFLICT(guild_id, feature_key) DO UPDATE SET sizes_json = excluded.sizes_json`,
    args: [guildId, featureKey, JSON.stringify(clean)],
  });
  return clean;
}

module.exports = { getSizes, setSizes };

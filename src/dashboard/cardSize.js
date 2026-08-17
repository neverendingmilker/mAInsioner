const db = require('../database/db');

// Per-guild, per-feature saved width/height for each card's native browser resize on a
// two-column feature page — Admin-only to change (see routes/cardOrderRoutes.js, which
// saves this alongside card order in the same request), applied for everyone who can open
// that feature page (Admin and Mod alike, see middleware/requireAdmin.js). One row per
// guild+feature, `sizes` a plain object keyed by that page's `data-card-id` values, e.g.
// { sessioni: { width: 281, height: 368 } }. Piloted on Anime Night only for now — see
// public/cardReorder.js and animenight.ejs.

function sanitizeSizes(sizes) {
  if (!sizes || typeof sizes !== 'object') return {};
  const clean = {};
  for (const [cardId, size] of Object.entries(sizes)) {
    if (typeof cardId !== 'string' || !cardId) continue;
    if (!size || typeof size !== 'object') continue;
    const width = Number(size.width);
    const height = Number(size.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    // Sane floor so a stray 0/negative value (or a wildly huge one from a bad client)
    // never produces an unusable or absurd card.
    clean[cardId] = { width: Math.min(4000, Math.max(120, width)), height: Math.min(4000, Math.max(80, height)) };
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

const db = require('../database/db');

// Per-guild, per-feature saved width split for a two-column card layout — Admin-only to
// change (see routes/cardLayoutRoutes.js), applied for everyone who can open that feature
// page (Admin and Mod alike, see middleware/requireAdmin.js). One row per guild+feature,
// `col1_fraction` the left column's share of the row; the right column gets the rest.
// Piloted on Anime Night only for now — see public/cardResize.js and animenight.ejs.

const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.8;
const DEFAULT_FRACTION = 0.5;

function clamp(fraction) {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return DEFAULT_FRACTION;
  return Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, fraction));
}

async function getColumnFraction(guildId, featureKey) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT col1_fraction FROM dashboard_card_layout WHERE guild_id = ? AND feature_key = ?',
    args: [guildId, featureKey],
  });
  const row = result.rows[0];
  if (!row) return DEFAULT_FRACTION;
  return clamp(row.col1_fraction);
}

async function setColumnFraction(guildId, featureKey, fraction) {
  await db.ready;
  const clamped = clamp(fraction);
  await db.client.execute({
    sql: `INSERT INTO dashboard_card_layout (guild_id, feature_key, col1_fraction) VALUES (?, ?, ?)
          ON CONFLICT(guild_id, feature_key) DO UPDATE SET col1_fraction = excluded.col1_fraction`,
    args: [guildId, featureKey, clamped],
  });
  return clamped;
}

module.exports = { getColumnFraction, setColumnFraction, MIN_FRACTION, MAX_FRACTION, DEFAULT_FRACTION };

const { FEATURES } = require('../commands/disablefeature');

// Dashboard route for each feature that already has its own config page — add one entry
// here the same day a page ships, nothing else needs to change. Every other feature from
// FEATURES just shows up in the sidebar as "coming soon" automatically.
const FEATURE_PAGES = {
  animenight: '/animenight',
  autoresponder: '/autoresponder',
  birthday: '/birthday',
  boosterlink: '/boosterlinks',
  bumpreminder: '/bumpreminder',
  comboroles: '/comboroles',
  goosepizza: '/goosepizza',
  honeypot: '/honeypot',
  incident: '/incident',
  invitetracker: '/invitetracker',
  qotd: '/qotd',
  reactionlimit: '/reactionlimit',
  rolelink: '/rolelink',
  serverbackup: '/serverbackup',
  slowmode: '/slowmode',
  sticky: '/sticky',
  suggestion: '/suggestion',
  themes: '/themes',
  waifuwarlr: '/waifuwarlr',
  warning: '/warning',
};

// FEATURES is already alphabetical by key at the source — reused as-is so the sidebar can
// never drift out of sync with /disablefeature's own list.
// `allowedKeys` is only meaningful for Mod sessions: a Set of feature keys an Admin has
// explicitly shared with Mods (see modAccess.js). Admins pass nothing (unrestricted, and
// features without a page yet still show as "coming soon"); for a Mod, anything without a
// page OR not in `allowedKeys` is left out of their sidebar entirely rather than shown
// disabled — no point advertising features they can't open anyway.
function getSidebarFeatures(activeKey, allowedKeys) {
  return Object.entries(FEATURES)
    .filter(([key]) => !allowedKeys || (Boolean(FEATURE_PAGES[key]) && allowedKeys.has(key)))
    .map(([key, f]) => ({
      key,
      label: f.label,
      href: FEATURE_PAGES[key] || null,
      active: key === activeKey,
    }));
}

// First path segment ("/qotd/items/42/edit" -> "/qotd") — every dashboard route lives
// under its feature's own top-level path, so this is enough to identify which feature (or
// tool page) a request belongs to without each route having to declare it explicitly.
function topLevelPath(path) {
  return `/${(path || '').split('/')[1] || ''}`;
}

// Reverse of FEATURE_PAGES: which feature key (if any) a request path belongs to. Used by
// requireDashboardAccess to decide whether a Mod is allowed onto this page at all.
function getFeatureKeyForPath(path) {
  const seg = topLevelPath(path);
  return Object.keys(FEATURE_PAGES).find((key) => FEATURE_PAGES[key] === seg) || null;
}

// Live diagnostic pages, distinct from FEATURES: no enable/disable state, no manager —
// each is a one-shot query computed straight from the guild's live Discord cache (same
// logic as their slash-command equivalents, e.g. /2faroles, /modroles). Shown in the
// sidebar as their own "Strumenti" section, separate from the toggleable feature list.
const TOOL_PAGES = [
  { key: 'channelpermissions', label: 'Permessi per canale', href: '/channelpermissions' },
  { key: 'roleaudit', label: 'Ruoli & Permessi', href: '/roleaudit' },
];

function getSidebarTools(activeKey) {
  return TOOL_PAGES.map((t) => ({ ...t, active: t.key === activeKey }));
}

// Unlike getSidebarFeatures (which every route already calls explicitly with its own key),
// this is meant to be set once in server.js's global locals middleware from req.path, so
// every page — not just /roleaudit itself — shows the "Strumenti" nav section and
// highlights the right entry, without having to touch every existing route file.
function getSidebarToolsForPath(path) {
  const match = TOOL_PAGES.find((t) => t.href === path);
  return getSidebarTools(match ? match.key : null);
}

// Same idea as getFeatureKeyForPath, for TOOL_PAGES — matches by top-level path segment
// (not exact equality like getSidebarToolsForPath above) so it also catches a tool's own
// sub-routes (e.g. "/channelpermissions/:channelId/:overwriteId/save"). Tools are never
// shared with Mods (no per-feature checkbox for them — see requireDashboardAccess).
function getToolKeyForPath(path) {
  const seg = topLevelPath(path);
  const match = TOOL_PAGES.find((t) => t.href === seg);
  return match ? match.key : null;
}

module.exports = {
  FEATURE_PAGES,
  getSidebarFeatures,
  getSidebarTools,
  getSidebarToolsForPath,
  getFeatureKeyForPath,
  getToolKeyForPath,
};

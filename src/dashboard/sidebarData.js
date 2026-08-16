const { FEATURES } = require('../commands/disablefeature');

// Dashboard route for each feature that already has its own config page — add one entry
// here the same day a page ships, nothing else needs to change. Every other feature from
// FEATURES just shows up in the sidebar as "coming soon" automatically.
const FEATURE_PAGES = {
  animenight: '/animenight',
  autoresponder: '/autoresponder',
  birthday: '/birthday',
  boosterlink: '/boosterlinks',
  comboroles: '/comboroles',
  goosepizza: '/goosepizza',
  honeypot: '/honeypot',
  incident: '/incident',
  invitetracker: '/invitetracker',
  reactionlimit: '/reactionlimit',
  rolelink: '/rolelink',
  serverbackup: '/serverbackup',
  slowmode: '/slowmode',
  sticky: '/sticky',
  suggestion: '/suggestion',
  waifuwarlr: '/waifuwarlr',
  warning: '/warning',
};

// FEATURES is already alphabetical by key at the source — reused as-is so the sidebar can
// never drift out of sync with /disablefeature's own list.
function getSidebarFeatures(activeKey) {
  return Object.entries(FEATURES).map(([key, f]) => ({
    key,
    label: f.label,
    href: FEATURE_PAGES[key] || null,
    active: key === activeKey,
  }));
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

module.exports = { FEATURE_PAGES, getSidebarFeatures, getSidebarTools, getSidebarToolsForPath };

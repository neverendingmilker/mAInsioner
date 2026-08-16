const { FEATURES } = require('../commands/disablefeature');

// Dashboard route for each feature that already has its own config page — add one entry
// here the same day a page ships, nothing else needs to change. Every other feature from
// FEATURES just shows up in the sidebar as "coming soon" automatically.
const FEATURE_PAGES = {
  birthday: '/birthday',
  comboroles: '/comboroles',
  honeypot: '/honeypot',
  incident: '/incident',
  reactionlimit: '/reactionlimit',
  rolelink: '/rolelink',
  slowmode: '/slowmode',
  sticky: '/sticky',
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

module.exports = { FEATURE_PAGES, getSidebarFeatures };

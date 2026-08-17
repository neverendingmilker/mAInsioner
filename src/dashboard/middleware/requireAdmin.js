const { getSidebarFeatures, getSidebarToolsForPath, getFeatureKeyForPath, getToolKeyForPath, FEATURE_PAGES } = require('../sidebarData');
const modAccess = require('../modAccess');
const cardOrder = require('../cardOrder');
const featureLock = require('../featureLock');

// Gates every dashboard page behind: Discord login, being an Administrator OR the
// configured Mod role in at least one server the bot is in (both checked once at login,
// cached in the session as `guildAccess` — see routes/auth.js), and having picked WHICH of
// those servers to manage (also session-backed, set by the /select-server picker). Someone
// logged in with Discord but with neither role anywhere sees a 403; someone who hasn't
// picked a server yet (or whose picked server they've since lost access to) gets sent to
// pick one, not a redirect loop to login.
//
// For a Mod session this also enforces WHICH pages they may reach: tool pages
// (roleaudit/channelpermissions) are always Admin-only (not covered by the per-feature
// Mod-access checkbox), a feature page needs an explicit opt-in row in
// dashboard_mod_access (see modAccess.js), and even on an allowed feature page the
// on/off toggle and base config (channel/role/schedule — any POST ending in /toggle,
// /config or /channel) stay Admin-only, matching /disablefeature being Admin-only on
// Discord. Everything else on an allowed feature page (add/edit/remove/etc.) works exactly
// like it does for an Admin — the restriction is about WHICH features a Mod can open, not
// what they can do once inside one.
//
// Separately (and regardless of role, see featureLock.js), a feature can be "locked" —
// its list of items can't be added/edited/removed/reordered by anyone, Admin or Mod,
// until an Admin unlocks it again from the feature's own page. This is deliberately NOT
// the same as the feature's on/off toggle: a locked feature keeps doing whatever it
// already does (QOTD keeps posting, Honeypot keeps trapping) — locking only freezes the
// dashboard's own add/edit/remove/reorder forms for that feature's list, same
// toggle/config/channel exclusion as the Mod restriction above (so base config and the
// feature's own on/off switch always stay reachable, locked or not).
async function requireDashboardAccess(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  const guildAccess = req.session.guildAccess || [];
  if (guildAccess.length === 0) {
    return res.status(403).render('403', { title: 'Accesso negato' });
  }

  const current = guildAccess.find((g) => g.id === req.session.guildId);
  if (!current) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/select-server');
  }

  req.dashboardRole = current.role; // 'admin' | 'mod'
  res.locals.role = current.role;

  const featureKey = getFeatureKeyForPath(req.path);

  let locked;
  try {
    locked = featureKey ? await featureLock.isFeatureLocked(req.session.guildId, featureKey) : false;
  } catch (err) {
    return next(err);
  }

  if (featureKey && locked && req.method === 'POST' && !/\/(toggle|config|channel)$/.test(req.path)) {
    req.session.flash = {
      type: 'error',
      message: 'Questa feature è bloccata — le modifiche alla lista sono disattivate. Un Admin può sbloccarla dalla pagina della feature.',
    };
    return res.redirect(req.get('Referer') || FEATURE_PAGES[featureKey] || '/');
  }

  if (current.role === 'admin') {
    res.locals.tools = getSidebarToolsForPath(req.path);
    res.locals.features = getSidebarFeatures(featureKey);
    res.locals.currentFeatureKey = featureKey;
    res.locals.featureLocked = locked;
    try {
      res.locals.modAccessEnabled = featureKey ? await modAccess.isFeatureModAccessible(req.session.guildId, featureKey) : false;
      res.locals.cardOrder = featureKey ? await cardOrder.getOrder(req.session.guildId, featureKey) : [];
    } catch (err) {
      return next(err);
    }
    return next();
  }

  // Mod: no "Strumenti" section at all, and only whichever features an Admin has
  // explicitly shared show up in the sidebar or are reachable directly by URL.
  res.locals.tools = [];
  res.locals.currentFeatureKey = null;
  res.locals.modAccessEnabled = false;
  res.locals.featureLocked = locked;
  res.locals.cardOrder = [];

  try {
    const allowedKeys = await modAccess.listModAccessibleFeatureKeys(req.session.guildId);
    req.modAccessibleKeys = allowedKeys;
    res.locals.features = getSidebarFeatures(featureKey, allowedKeys);

    if (getToolKeyForPath(req.path)) {
      return res.status(403).render('403', { title: 'Accesso negato', message: 'Questa sezione è riservata agli Admin.' });
    }

    if (featureKey) {
      if (!allowedKeys.has(featureKey)) {
        return res
          .status(403)
          .render('403', { title: 'Accesso negato', message: 'Non hai accesso a questa feature — chiedi a un Admin di abilitarlo dalla pagina della feature.' });
      }
      if (req.method === 'POST' && /\/(toggle|config|channel)$/.test(req.path)) {
        return res.status(403).render('403', {
          title: 'Accesso negato',
          message: "Solo un Admin può accendere/spegnere una feature o cambiarne la configurazione di base (canale/ruolo/programma).",
        });
      }
      res.locals.cardOrder = await cardOrder.getOrder(req.session.guildId, featureKey);
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireDashboardAccess };

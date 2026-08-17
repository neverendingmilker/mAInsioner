const express = require('express');
const modAccess = require('../modAccess');
const { FEATURE_PAGES } = require('../sidebarData');

const router = express.Router();

// The Admin-only switch labeled "Solo Admin" on each feature page (partials/
// featureToggle.ejs). Not reachable through the sidebar — it's a plain form POST from
// whichever feature page the switch lives on, and redirects back there. The switch's
// checked state is the INVERSE of `allowed` (checked = solo admin = mods NOT allowed), so
// an unchecked box (which a browser omits from the POST body entirely) correctly means
// "not solo admin" i.e. allowed = true, with no hidden fallback field needed.
router.post('/mod-access/:featureKey/toggle', async (req, res, next) => {
  try {
    if (req.dashboardRole !== 'admin') {
      return res.status(403).render('403', { title: 'Accesso negato', message: 'Solo un Admin può gestire l\'accesso Mod alle feature.' });
    }

    const { featureKey } = req.params;
    if (!FEATURE_PAGES[featureKey]) {
      return res.status(404).render('error', { title: 'Feature sconosciuta', message: 'Feature non valida.' });
    }

    const allowed = req.body.soloAdmin !== 'true';
    await modAccess.setFeatureModAccess(req.session.guildId, featureKey, allowed);
    req.session.flash = {
      type: 'success',
      message: allowed ? 'I Mod possono ora accedere a questa feature dalla dashboard.' : 'I Mod non possono più accedere a questa feature dalla dashboard.',
    };
    // Referer is just this same feature page's own form (same-origin, no user-controlled
    // link) — falling back to the feature's canonical path if it's ever missing/stripped.
    res.redirect(req.get('Referer') || FEATURE_PAGES[featureKey]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

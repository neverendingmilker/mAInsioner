const express = require('express');
const featureLock = require('../featureLock');
const { FEATURE_PAGES } = require('../sidebarData');

const router = express.Router();

// The Admin-only switch labeled "Modificabile" on each feature page (partials/
// featureToggle.ejs) — not the same as the feature's own on/off switch. Locking only
// freezes that feature's add/edit/remove/reorder forms (its list of items); the feature
// keeps running, and base config (channel/role/schedule) stays editable. Actual
// enforcement lives in middleware/requireAdmin.js, checked on every POST for the feature.
// The switch's checked state is the INVERSE of `locked` (checked = modificabile = NOT
// locked), so an unchecked box (omitted from the POST body by the browser) correctly means
// "not editable" i.e. locked = true, with no hidden fallback field needed.
router.post('/feature-lock/:featureKey/toggle', async (req, res, next) => {
  try {
    if (req.dashboardRole !== 'admin') {
      return res.status(403).render('403', { title: 'Accesso negato', message: 'Solo un Admin può bloccare/sbloccare le modifiche di una feature.' });
    }

    const { featureKey } = req.params;
    if (!FEATURE_PAGES[featureKey]) {
      return res.status(404).render('error', { title: 'Feature sconosciuta', message: 'Feature non valida.' });
    }

    const locked = req.body.editable !== 'true';
    await featureLock.setFeatureLocked(req.session.guildId, featureKey, locked);
    req.session.flash = {
      type: 'success',
      message: locked
        ? 'Modifiche bloccate — la lista di questa feature non può più essere modificata finché non la sblocchi.'
        : 'Modifiche sbloccate — la lista di questa feature può di nuovo essere modificata.',
    };
    res.redirect(req.get('Referer') || FEATURE_PAGES[featureKey]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

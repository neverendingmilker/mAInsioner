const express = require('express');
const featureLock = require('../featureLock');
const { FEATURE_PAGES } = require('../sidebarData');

const router = express.Router();

// The Admin-only switch labeled "Edit" on each feature page (partials/
// featureToggle.ejs) — not the same as the feature's own on/off switch. Locking only
// freezes that feature's add/edit/remove/reorder forms (its list of items); the feature
// keeps running, and base config (channel/role/schedule) stays editable. Actual
// enforcement lives in middleware/requireAdmin.js, checked on every POST for the feature.
// The switch's checked state is the INVERSE of `locked` (checked = editable = NOT
// locked), so an unchecked box (omitted from the POST body by the browser) correctly means
// "not editable" i.e. locked = true, with no hidden fallback field needed.
router.post('/feature-lock/:featureKey/toggle', async (req, res, next) => {
  try {
    if (req.dashboardRole !== 'admin') {
      return res.status(403).render('403', { title: 'Access denied', message: 'Only an Admin can lock/unlock changes to a feature.' });
    }

    const { featureKey } = req.params;
    if (!FEATURE_PAGES[featureKey]) {
      return res.status(404).render('error', { title: 'Unknown feature', message: 'Invalid feature.' });
    }

    const locked = req.body.editable !== 'true';
    await featureLock.setFeatureLocked(req.session.guildId, featureKey, locked);
    req.session.flash = {
      type: 'success',
      message: locked
        ? "Changes locked — this feature's list can't be modified until you unlock it."
        : "Changes unlocked — this feature's list can be modified again.",
    };
    res.redirect(req.get('Referer') || FEATURE_PAGES[featureKey]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

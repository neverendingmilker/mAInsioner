const express = require('express');
const cardLayout = require('../cardLayout');
const { FEATURE_PAGES } = require('../sidebarData');

const router = express.Router();

// The Admin-only save behind a feature page's two-column resize handle
// (public/cardResize.js). Generic across every feature page — `featureKey` comes from the
// URL — even though only Anime Night renders the two-column markup for now. `fraction` is
// the left column's share of the row (0-1) at the moment the handle was released; clamped
// again server-side regardless of what the client sent.
router.post('/card-layout/:featureKey/resize', async (req, res, next) => {
  try {
    if (req.dashboardRole !== 'admin') {
      return res.status(403).render('403', { title: 'Accesso negato', message: 'Solo un Admin può ridimensionare le colonne di una feature.' });
    }

    const { featureKey } = req.params;
    if (!FEATURE_PAGES[featureKey]) {
      return res.status(404).render('error', { title: 'Feature sconosciuta', message: 'Feature non valida.' });
    }

    const fraction = parseFloat(req.body.fraction);
    await cardLayout.setColumnFraction(req.session.guildId, featureKey, fraction);
    res.redirect(req.get('Referer') || FEATURE_PAGES[featureKey]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

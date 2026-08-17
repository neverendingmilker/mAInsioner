const express = require('express');
const cardOrder = require('../cardOrder');
const { FEATURE_PAGES } = require('../sidebarData');

const router = express.Router();

// The Admin-only save behind a feature page's card-reorder lock button
// (public/cardReorder.js, rendered from partials/featureToggle.ejs). Generic across every
// feature page — `featureKey` comes from the URL, not the request path's own top-level
// segment, so one route covers all of them instead of needing a copy per feature.
// `order` is every card id currently on that page, comma-separated, in the order they
// ended up in after dragging.
router.post('/card-order/:featureKey/reorder', async (req, res, next) => {
  try {
    if (req.dashboardRole !== 'admin') {
      return res.status(403).render('403', { title: 'Accesso negato', message: 'Solo un Admin può riordinare le card di una feature.' });
    }

    const { featureKey } = req.params;
    if (!FEATURE_PAGES[featureKey]) {
      return res.status(404).render('error', { title: 'Feature sconosciuta', message: 'Feature non valida.' });
    }

    const orderedIds = (req.body.order || '').split(',').map((s) => s.trim()).filter(Boolean);
    await cardOrder.setOrder(req.session.guildId, featureKey, orderedIds);
    res.redirect(req.get('Referer') || FEATURE_PAGES[featureKey]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

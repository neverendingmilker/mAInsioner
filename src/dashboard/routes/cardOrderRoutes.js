const express = require('express');
const cardOrder = require('../cardOrder');
const cardSize = require('../cardSize');
const { FEATURE_PAGES } = require('../sidebarData');

const router = express.Router();

// The Admin-only save behind a feature page's card-reorder switch
// (public/cardReorder.js, rendered from partials/featureToggle.ejs). Generic across every
// feature page — `featureKey` comes from the URL, not the request path's own top-level
// segment, so one route covers all of them instead of needing a copy per feature.
// `order` is every card id currently on that page, comma-separated, in the order they
// ended up in after dragging. `sizes` is optional — only two-column pages (Anime Night for
// now) ever send it, a JSON object of per-card width/height set via the native browser
// resize grip (see freezeSizesForResize in cardReorder.js); both share this one route/one
// POST so re-locking the switch never fires two separate saves-and-reloads back to back.
router.post('/card-order/:featureKey/reorder', async (req, res, next) => {
  try {
    if (req.dashboardRole !== 'admin') {
      return res.status(403).render('403', { title: 'Accesso negato', message: 'Solo un Admin può riordinare o ridimensionare le card di una feature.' });
    }

    const { featureKey } = req.params;
    if (!FEATURE_PAGES[featureKey]) {
      return res.status(404).render('error', { title: 'Feature sconosciuta', message: 'Feature non valida.' });
    }

    const orderedIds = (req.body.order || '').split(',').map((s) => s.trim()).filter(Boolean);
    await cardOrder.setOrder(req.session.guildId, featureKey, orderedIds);

    if (req.body.sizes) {
      try {
        const parsedSizes = JSON.parse(req.body.sizes);
        await cardSize.setSizes(req.session.guildId, featureKey, parsedSizes);
      } catch {
        // Malformed JSON from the client (shouldn't happen — cardReorder.js always
        // JSON.stringifies it) — just skip saving sizes rather than failing the whole
        // request, the order above is still saved.
      }
    }

    res.redirect(req.get('Referer') || FEATURE_PAGES[featureKey]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

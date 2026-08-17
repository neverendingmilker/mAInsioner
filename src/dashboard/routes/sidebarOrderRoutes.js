const express = require('express');
const { FEATURES } = require('../../commands/disablefeature');
const sidebarOrder = require('../sidebarOrder');

const router = express.Router();

// The Admin-only save behind the sidebar's drag-and-drop reorder (public/sidebarReorder.js)
// and its lock button (partials/sidebar.ejs). Not a feature page itself, so it's not gated
// by requireDashboardAccess's per-feature Mod checks — enforced here instead, same pattern
// as modAccessRoutes.js's toggle. `order` is every feature key currently in the sidebar,
// comma-separated, in the order they ended up in after dragging.
router.post('/sidebar-order/reorder', async (req, res, next) => {
  try {
    if (req.dashboardRole !== 'admin') {
      return res.status(403).render('403', { title: 'Accesso negato', message: "Solo un Admin può riordinare la sidebar." });
    }

    const submitted = (req.body.order || '').split(',').map((s) => s.trim()).filter(Boolean);
    const orderedKeys = submitted.filter((key) => Object.prototype.hasOwnProperty.call(FEATURES, key));

    await sidebarOrder.setOrder(req.session.guildId, orderedKeys);
    res.redirect(req.get('Referer') || '/');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

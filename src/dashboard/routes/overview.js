const express = require('express');
const { resolveDashboardGuild } = require('../guild');
const { FEATURES } = require('../../commands/disablefeature');
const honeypotManager = require('../../features/honeypot/honeypotManager');
const { formatSeconds } = require('../../utils/duration');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const guild = resolveDashboardGuild(req.client, req.session.guildId);
    if (!guild) {
      res.status(500).render('error', {
        title: 'Server non trovato',
        message: 'Il server selezionato non è più disponibile — esci e accedi di nuovo per sceglierne un altro.',
      });
      return;
    }

    // FEATURES is already alphabetical by key at the source (src/commands/disablefeature) —
    // reused as-is here so the sidebar and /disablefeature never drift out of sync.
    const featureEntries = Object.entries(FEATURES);
    const statuses = await Promise.all(featureEntries.map(([, f]) => f.manager.isEnabled(guild.id)));
    const enabledCount = statuses.filter(Boolean).length;

    const { total: honeypotTotal } = await honeypotManager.getKickLog(guild.id, 0);

    res.render('overview', {
      title: 'Overview',
      activePage: 'overview',
      guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }), memberCount: guild.memberCount },
      enabledCount,
      totalFeatures: featureEntries.length,
      honeypotTotal,
      uptime: formatSeconds(Math.floor(req.client.uptime / 1000)),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

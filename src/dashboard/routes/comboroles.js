const express = require('express');
const { resolveDashboardGuild } = require('../guild');
const comboRolesManager = require('../../features/comboroles/comboRolesManager');

const router = express.Router();

const REQUIRED_SLOTS = 3; // Discord's /comboroles search allows up to 5 — kept smaller here for a compact form
const EXCLUDED_SLOTS = 2; // Discord's /comboroles search allows up to 3
const MAX_RESULTS_SHOWN = 200;

// Mirrors honeypot.js's requireGuild — same fallback error page.
function requireGuild(req, res) {
  const guild = resolveDashboardGuild(req.client, req.session.guildId);
  if (!guild) {
    res.status(500).render('error', {
      title: 'Server non trovato',
      message: 'Il server selezionato non è più disponibile — esci e accedi di nuovo per sceglierne un altro.',
    });
    return null;
  }
  return guild;
}

function assignableRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));
}

router.get('/comboroles', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = await comboRolesManager.isEnabled(guild.id);
    const roles = assignableRoles(guild);

    const selectedRequired = Array.from({ length: REQUIRED_SLOTS }, (_, i) => req.query[`role${i + 1}`] || '');
    const selectedExcluded = Array.from({ length: EXCLUDED_SLOTS }, (_, i) => req.query[`but${i + 1}`] || '');

    const requiredRoleIds = selectedRequired.filter(Boolean);
    const excludedRoleIds = selectedExcluded.filter(Boolean);

    let results = null;
    if (requiredRoleIds.length > 0) {
      const members = await comboRolesManager.findMembersWithRoles(guild, requiredRoleIds, excludedRoleIds);
      const sorted = [...members.values()].sort((a, b) => a.user.tag.localeCompare(b.user.tag));
      results = {
        total: sorted.length,
        shown: sorted.slice(0, MAX_RESULTS_SHOWN).map((m) => ({ id: m.id, tag: m.user.tag })),
        truncated: sorted.length > MAX_RESULTS_SHOWN,
      };
    }

    res.render('comboroles', {
      title: 'Combined Role Search',
      guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
      enabled,
      roles,
      selectedRequired,
      selectedExcluded,
      results,
      maxResultsShown: MAX_RESULTS_SHOWN,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/comboroles/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await comboRolesManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Combined Role Search attivato.' : 'Combined Role Search disattivato.' };
    res.redirect('/comboroles');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

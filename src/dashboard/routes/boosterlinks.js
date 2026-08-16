const express = require('express');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const boosterLinkManager = require('../../features/boosterlinks/boosterLinkManager');

const router = express.Router();

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

function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(utente non più nel server: ${userId})`;
}

function roleLabel(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `(ruolo eliminato: ${roleId})`;
}

async function renderBoosterlinksPage(req, res, guild) {
  const [enabled, links, exemptRoleIds] = await Promise.all([
    boosterLinkManager.isEnabled(guild.id),
    boosterLinkManager.listAll(guild.id),
    boosterLinkManager.listExemptRoles(guild.id),
  ]);

  const linkCards = links
    .map((l) => ({
      userId: l.user_id,
      roleId: l.role_id,
      userLabel: memberLabel(guild, l.user_id),
      roleLabel: roleLabel(guild, l.role_id),
      isBooster: Boolean(guild.members.cache.get(l.user_id)?.roles.premiumSubscriberRole),
    }))
    .sort((a, b) => a.userLabel.localeCompare(b.userLabel));

  const exemptRoles = exemptRoleIds.map((id) => ({ id, name: roleLabel(guild, id) })).sort((a, b) => a.name.localeCompare(b.name));

  // Custom perk roles are assigned/removed by the bot, so — same reasoning as Role
  // Links' picker — @everyone and integration-managed roles (booster, other bots) don't
  // make sense to offer here.
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  // Exempt roles have no such restriction — any real role can be used as an exemption
  // criterion, same as /boosterlink exempt add on Discord.
  const allRoles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  const members = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .sort((a, b) => a.user.tag.localeCompare(b.user.tag))
    .map((m) => ({ id: m.id, label: m.user.tag, isBooster: Boolean(m.roles.premiumSubscriberRole) }));

  res.render('boosterlinks', {
    title: 'Booster Links',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    features: getSidebarFeatures('boosterlink'),
    enabled,
    links: linkCards,
    exemptRoles,
    roles,
    allRoles,
    members,
  });
}

router.get('/boosterlinks', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderBoosterlinksPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/boosterlinks/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await boosterLinkManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Booster Links attivato.' : 'Booster Links disattivato.' };
    res.redirect('/boosterlinks');
  } catch (err) {
    next(err);
  }
});

router.post('/boosterlinks/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const member = guild.members.cache.get(req.body.userId);
    const role = guild.roles.cache.get(req.body.roleId);
    if (!member || !role) {
      req.session.flash = { type: 'error', message: 'Utente o ruolo non valido — riprova.' };
      res.redirect('/boosterlinks');
      return;
    }

    try {
      await boosterLinkManager.link(guild, member.id, role, req.session.user.id);
      req.session.flash = { type: 'success', message: `${role.name} collegato a ${member.user.tag}.` };
    } catch (err) {
      if (err instanceof boosterLinkManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/boosterlinks');
  } catch (err) {
    next(err);
  }
});

// Re-points an existing link to a different role, mirroring /boosterlink edit's own
// unlink-old + link-new approach (there's no single-step "rename" at the DB level since
// the role is part of the row's key, same tradeoff as Role Links).
router.post('/boosterlinks/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const userId = req.body.userId;
    const oldRoleId = req.body.oldRoleId;
    const newRole = guild.roles.cache.get(req.body.newRoleId);
    if (!newRole) {
      req.session.flash = { type: 'error', message: 'Ruolo non valido — riprova.' };
      res.redirect('/boosterlinks');
      return;
    }

    try {
      await boosterLinkManager.unlink(guild.id, userId, oldRoleId);
      await boosterLinkManager.link(guild, userId, newRole, req.session.user.id);
      req.session.flash = { type: 'success', message: 'Collegamento aggiornato.' };
    } catch (err) {
      if (err instanceof boosterLinkManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/boosterlinks');
  } catch (err) {
    next(err);
  }
});

router.post('/boosterlinks/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await boosterLinkManager.unlink(guild.id, req.body.userId, req.body.roleId);
    req.session.flash = { type: 'success', message: 'Collegamento rimosso.' };
    res.redirect('/boosterlinks');
  } catch (err) {
    next(err);
  }
});

router.post('/boosterlinks/exempt/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const role = guild.roles.cache.get(req.body.roleId);
    if (!role) {
      req.session.flash = { type: 'error', message: 'Ruolo non valido — riprova.' };
      res.redirect('/boosterlinks');
      return;
    }

    await boosterLinkManager.addExemptRole(guild.id, role.id, req.session.user.id);
    req.session.flash = { type: 'success', message: `${role.name} è ora esente dalla rimozione automatica.` };
    res.redirect('/boosterlinks');
  } catch (err) {
    next(err);
  }
});

router.post('/boosterlinks/exempt/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await boosterLinkManager.removeExemptRole(guild.id, req.body.roleId);
    req.session.flash = { type: 'success', message: 'Ruolo esente rimosso.' };
    res.redirect('/boosterlinks');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

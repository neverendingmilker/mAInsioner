const express = require('express');
const { requireGuild } = require('../guild');
const boosterLinkManager = require('../../features/boosterlinks/boosterLinkManager');
const { getModRoleId } = require('../../utils/modRole');

const router = express.Router();

function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(utente non più nel server: ${userId})`;
}

function roleLabel(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `(ruolo eliminato: ${roleId})`;
}

async function renderBoosterlinksPage(req, res, guild) {
  const [enabled, links, exemptRoleIds, ogFrenRoleId, modRoleId] = await Promise.all([
    boosterLinkManager.isEnabled(guild.id),
    boosterLinkManager.listAll(guild.id),
    boosterLinkManager.listExemptRoles(guild.id),
    boosterLinkManager.getOgFrenRoleId(guild.id),
    getModRoleId(guild.id),
  ]);

  const linkCards = links
    .map((l) => {
      const member = guild.members.cache.get(l.user_id);
      return {
        userId: l.user_id,
        roleId: l.role_id,
        userLabel: memberLabel(guild, l.user_id),
        roleLabel: roleLabel(guild, l.role_id),
        isBooster: Boolean(member?.roles.premiumSubscriberRole),
        // Set while the member isn't boosting — the role itself has been removed, but the
        // link is kept (not deleted) so it comes back automatically the moment they boost
        // again (see boosterLinkManager's pauseActiveLinks/restorePausedLinks).
        isPaused: Number(l.paused) === 1,
        // Both badges reflect the member's CURRENT roles, not anything tracked by this
        // feature — a Mod who's demoted, or whose OG/Fren role is later revoked, simply
        // stops showing the badge on next page load, no cleanup needed anywhere.
        isMod: Boolean(modRoleId && member?.roles.cache.has(modRoleId)),
        isOgFren: Boolean(ogFrenRoleId && member?.roles.cache.has(ogFrenRoleId)),
      };
    })
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

  res.render('boosterlinks', {
    title: 'Booster Links',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    links: linkCards,
    exemptRoles,
    roles,
    allRoles,
    ogFrenRoleId,
    ogFrenRoleName: ogFrenRoleId ? roleLabel(guild, ogFrenRoleId) : null,
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

// Admin-only (the trailing /config matches requireDashboardAccess's Mod-blocklist regex,
// same as every other feature's base config route) — picks which of the server's own roles
// counts as "OG/Fren" for the badge shown next to a linked booster's name below. An empty
// selection clears it, hiding the badge everywhere until it's set again.
router.post('/boosterlinks/og-fren-role/config', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const roleId = req.body.ogFrenRoleId || null;
    if (roleId && !guild.roles.cache.has(roleId)) {
      req.session.flash = { type: 'error', message: 'Ruolo non valido — riprova.' };
      res.redirect('/boosterlinks');
      return;
    }

    await boosterLinkManager.setOgFrenRoleId(guild.id, roleId);
    req.session.flash = {
      type: 'success',
      message: roleId ? `Ruolo OG/Fren impostato su ${roleLabel(guild, roleId)}.` : 'Ruolo OG/Fren rimosso — il badge non comparirà più.',
    };
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

    // The picker is a multi-select (see boosterlinks.ejs) so more than one role can be
    // exempted in a single submit. A single selection still posts as one plain string
    // rather than a 1-item array — same normalization every other multi-value form field
    // in this codebase needs from Express's urlencoded body parser.
    const rawIds = req.body.roleIds;
    const ids = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];
    const roles = ids.map((id) => guild.roles.cache.get(id)).filter(Boolean);

    if (roles.length === 0) {
      req.session.flash = { type: 'error', message: 'Nessun ruolo valido selezionato — riprova.' };
      res.redirect('/boosterlinks');
      return;
    }

    await Promise.all(roles.map((role) => boosterLinkManager.addExemptRole(guild.id, role.id, req.session.user.id)));
    req.session.flash = {
      type: 'success',
      message: roles.length === 1 ? `${roles[0].name} è ora esente dalla rimozione automatica.` : `${roles.length} ruoli sono ora esenti dalla rimozione automatica.`,
    };
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

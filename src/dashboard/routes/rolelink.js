const express = require('express');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const roleLinkManager = require('../../features/rolelinks/roleLinkManager');

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

function roleLabel(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `(ruolo eliminato: ${roleId})`;
}

// Same restriction as the slash command's /rolelink add: no @everyone, no
// bot/integration-managed roles (booster perks, other bots' own roles, etc).
function assignableRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));
}

async function renderRoleLinkPage(req, res, guild) {
  const [enabled, linkRows] = await Promise.all([
    roleLinkManager.isEnabled(guild.id),
    roleLinkManager.listAll(guild.id),
  ]);

  const links = linkRows
    .map((l) => ({
      roleAId: l.role_a_id,
      roleBId: l.role_b_id,
      roleAName: roleLabel(guild, l.role_a_id),
      roleBName: roleLabel(guild, l.role_b_id),
      bidirectional: l.bidirectional,
    }))
    .sort((a, b) => a.roleAName.localeCompare(b.roleAName) || a.roleBName.localeCompare(b.roleBName));

  res.render('rolelink', {
    title: 'Role Links',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    features: getSidebarFeatures('rolelink'),
    enabled,
    links,
    roles: assignableRoles(guild),
  });
}

router.get('/rolelink', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderRoleLinkPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/rolelink/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await roleLinkManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Role Links attivato.' : 'Role Links disattivato.' };
    res.redirect('/rolelink');
  } catch (err) {
    next(err);
  }
});

function parseLinkForm(guild, body) {
  const roleA = guild.roles.cache.get(body.roleAId);
  const roleB = guild.roles.cache.get(body.roleBId);
  if (!roleA || !roleB) return { error: 'Ruolo non valido — riprova.' };
  if (roleA.id === roleB.id) return { error: 'Ruolo 1 e Ruolo 2 non possono essere lo stesso ruolo.' };
  if (roleA.managed || roleA.id === guild.id || roleB.managed || roleB.id === guild.id) {
    return { error: 'Uno dei ruoli scelti non può essere usato qui (@everyone o ruolo gestito da un\'integrazione).' };
  }
  return { roleA, roleB, bidirectional: body.bidirectional === 'on' };
}

router.post('/rolelink/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const parsed = parseLinkForm(guild, req.body);
    if (parsed.error) {
      req.session.flash = { type: 'error', message: parsed.error };
      res.redirect('/rolelink');
      return;
    }

    try {
      await roleLinkManager.link(guild, parsed.roleA, parsed.roleB, parsed.bidirectional, req.session.user.id);
      req.session.flash = { type: 'success', message: `Collegamento creato: ${parsed.roleA.name} → ${parsed.roleB.name}.` };
    } catch (err) {
      if (err instanceof roleLinkManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/rolelink');
  } catch (err) {
    next(err);
  }
});

// Unlike Slowmode/Reaction Limit's single-column upsert, a role link's key is the
// (role_a, role_b) PAIR — changing either role means a different key, not an update
// of the same row. So editing removes the old pair first, then re-creates it with the
// new values (same two-step approach as /rolelink edit on Discord — see
// commands/rolelinks/handlers/edit.js). If the create step fails after the remove
// already succeeded, the old link is gone; same known tradeoff as the slash command.
router.post('/rolelink/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const currentRoleAId = req.body.currentRoleAId;
    const currentRoleBId = req.body.currentRoleBId;

    const parsed = parseLinkForm(guild, req.body);
    if (parsed.error) {
      req.session.flash = { type: 'error', message: parsed.error };
      res.redirect('/rolelink');
      return;
    }

    try {
      await roleLinkManager.unlink(guild.id, currentRoleAId, currentRoleBId);
      await roleLinkManager.link(guild, parsed.roleA, parsed.roleB, parsed.bidirectional, req.session.user.id);
      req.session.flash = { type: 'success', message: `Collegamento aggiornato: ${parsed.roleA.name} → ${parsed.roleB.name}.` };
    } catch (err) {
      if (err instanceof roleLinkManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/rolelink');
  } catch (err) {
    next(err);
  }
});

router.post('/rolelink/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await roleLinkManager.unlink(guild.id, req.body.roleAId, req.body.roleBId);
    req.session.flash = { type: 'success', message: 'Collegamento rimosso.' };
    res.redirect('/rolelink');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

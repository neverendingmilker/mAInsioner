const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const verifyManager = require('../../features/verify/verifyManager');
const { pickedValues } = require('../../utils/multiSelect');

const router = express.Router();

// Matches /verify config's own `channel` option (`.addChannelTypes(ChannelType.GuildText)`
// in src/commands/verify/index.js) — deliberately narrower than most other feature pages,
// which also allow GuildAnnouncement, so the picker here stays in sync with what the
// Discord command actually accepts.
const REPORT_CHANNEL_TYPES = [ChannelType.GuildText];

function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(utente non più nel server: ${userId})`;
}

function roleLabel(guild, roleId) {
  if (!roleId) return null;
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `(ruolo eliminato: ${roleId})`;
}

function channelLabel(guild, channelId) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(canale eliminato: ${channelId})`;
}

async function renderVerifyPage(req, res, guild) {
  const [enabled, config, subRoleIds, reports] = await Promise.all([
    verifyManager.isEnabled(guild.id),
    verifyManager.getGuildConfig(guild.id),
    verifyManager.getSubRoles(guild.id),
    verifyManager.getAllReportsInGuild(guild.id, 100),
  ]);

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => REPORT_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const members = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .sort((a, b) => a.user.tag.localeCompare(b.user.tag))
    .map((m) => ({ id: m.id, label: m.user.tag }));

  const typeChoices = verifyManager.TYPES.map((type) => ({ value: type, label: verifyManager.TYPE_LABELS[type] }));

  const recentReports = reports.slice(0, 100).map((r) => ({
    id: r.id,
    typeLabel: verifyManager.TYPE_LABELS[r.type],
    userLabel: memberLabel(guild, r.user_id),
    verification: r.verification,
    social: r.social,
    dateLabel: new Date(Number(r.verified_at) * 1000).toLocaleDateString('it-IT'),
    moderatorLabel: r.moderator_id ? memberLabel(guild, r.moderator_id) : '—',
  }));

  res.render('verify', {
    title: 'Verification',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    config: {
      subGiveRoleId: config.sub_give_role_id,
      dommeGiveRoleId: config.domme_give_role_id,
      maledomGiveRoleId: config.maledom_give_role_id,
      removeRoleId: config.remove_role_id,
      reportChannelId: config.report_channel_id,
      allowedRoleId: config.allowed_role_id,
      defaultSubRoleId: config.default_sub_role_id,
    },
    roles,
    textChannels,
    members,
    typeChoices,
    subRoleIds,
    recentReports,
    recentReportsTruncated: reports.length > 100,
  });
}

router.get('/verify', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderVerifyPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/verify/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await verifyManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Verification attivata.' : 'Verification disattivata.' };
    res.redirect('/verify');
  } catch (err) {
    next(err);
  }
});

// Full replace, unlike /verify config's Discord side (which only touches the options you
// actually pass) — same UX tradeoff as every other feature's dashboard config form (e.g.
// Bump Reminder): an empty select here means "clear", not "leave alone".
router.post('/verify/config', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const errors = [];
    const updates = {};

    const roleFields = [
      ['subGiveRoleId', 'subGive', 'Sub'],
      ['dommeGiveRoleId', 'dommeGive', 'Domme'],
      ['maledomGiveRoleId', 'maledomGive', 'Maledom'],
      ['removeRoleId', 'remove', 'Rimozione'],
      ['allowedRoleId', 'allowedRole', 'Ruolo abilitato'],
    ];
    for (const [bodyKey, updateKey, label] of roleFields) {
      const roleId = req.body[bodyKey] || null;
      if (roleId && !guild.roles.cache.has(roleId)) {
        errors.push(`Ruolo non valido per "${label}".`);
      } else {
        updates[updateKey] = roleId;
      }
    }

    const channelId = req.body.reportChannelId || null;
    if (channelId && !guild.channels.cache.has(channelId)) {
      errors.push('Canale non valido.');
    } else {
      updates.channel = channelId;
    }

    if (errors.length === 0) {
      await verifyManager.setConfig(guild.id, updates);
    }

    req.session.flash = errors.length > 0 ? { type: 'error', message: errors.join(' ') } : { type: 'success', message: 'Configurazione aggiornata.' };
    res.redirect('/verify');
  } catch (err) {
    next(err);
  }
});

// Ends in /config so requireDashboardAccess treats it as base config (Admin-only), same
// as /verify subroles being Administrator-only on Discord.
router.post('/verify/subroles/config', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const roleIds = [...new Set(pickedValues(req.body.subRoleIds))].filter((id) => guild.roles.cache.has(id));
    const defaultSubRoleId = req.body.defaultSubRoleId || null;

    if (defaultSubRoleId && !guild.roles.cache.has(defaultSubRoleId)) {
      req.session.flash = { type: 'error', message: 'Ruolo di default non valido.' };
      res.redirect('/verify');
      return;
    }

    await verifyManager.setSubRoles(guild.id, roleIds);
    await verifyManager.setConfig(guild.id, { defaultSubRole: defaultSubRoleId });

    req.session.flash = { type: 'success', message: 'Ruoli sub aggiornati.' };
    res.redirect('/verify');
  } catch (err) {
    next(err);
  }
});

// Mirrors /verify sub|domme|maledom: same pre-flight checks (role configured/exists/
// hierarchy) as verifyAction.js, then the actual work goes through the same
// verifyManager.performVerification() the Discord command uses.
router.post('/verify/issue', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const type = req.body.type;
    if (!verifyManager.TYPES.includes(type)) {
      req.session.flash = { type: 'error', message: 'Tipo di verifica non valido.' };
      res.redirect('/verify');
      return;
    }

    const label = verifyManager.TYPE_LABELS[type];
    const member = guild.members.cache.get(req.body.userId);
    if (!member) {
      req.session.flash = { type: 'error', message: 'Utente non valido — deve essere ancora nel server.' };
      res.redirect('/verify');
      return;
    }

    const verification = req.body.verification?.trim();
    if (!verification) {
      req.session.flash = { type: 'error', message: 'Il campo "Verification" è obbligatorio.' };
      res.redirect('/verify');
      return;
    }
    const social = req.body.social?.trim() || '';

    const config = await verifyManager.getGuildConfig(guild.id);
    const { giveRoleId } = verifyManager.getRoleIdsForType(config, type);

    if (!giveRoleId) {
      req.session.flash = { type: 'error', message: `Nessun ruolo configurato per ${label} — impostalo prima in Configurazione.` };
      res.redirect('/verify');
      return;
    }

    const giveRole = guild.roles.cache.get(giveRoleId);
    if (!giveRole) {
      req.session.flash = { type: 'error', message: `Il ruolo configurato per ${label} non esiste più — impostane uno nuovo in Configurazione.` };
      res.redirect('/verify');
      return;
    }

    const botMember = guild.members.me;
    if (!botMember || botMember.roles.highest.position <= giveRole.position) {
      req.session.flash = { type: 'error', message: `Non posso assegnare ${giveRole.name}: il mio ruolo deve essere più in alto nella lista dei ruoli del server.` };
      res.redirect('/verify');
      return;
    }

    const result = await verifyManager.performVerification(guild, type, {
      member,
      giveRole,
      config,
      verification,
      social,
      moderatorMention: `<@${req.session.user.id}>`,
      moderatorId: req.session.user.id,
      verifiedAtSeconds: Math.floor(Date.now() / 1000),
    });

    const notes = [];
    notes.push(result.alreadyHadRole ? `aveva già ${giveRole.name}` : `assegnato ${giveRole.name}`);
    if (result.removeRole?.removed) notes.push(`rimosso ${result.removeRole.role.name}`);
    else if (result.removeRole?.blocked) notes.push(`impossibile rimuovere ${result.removeRole.role.name} (gerarchia ruoli)`);
    for (const cr of result.crossRemovals) {
      notes.push(cr.removed ? `rimosso ${cr.role.name} (${verifyManager.TYPE_LABELS[cr.type]})` : `impossibile rimuovere ${cr.role.name} (${verifyManager.TYPE_LABELS[cr.type]})`);
    }
    if (result.subRole?.status === 'assigned') {
      notes.push(`assegnato il ruolo sub di default${result.subRole.defaultRole ? ` (${result.subRole.defaultRole.name})` : ''}`);
    }
    if (result.report?.posted) notes.push(`report pubblicato in #${result.report.channel.name}`);
    else if (result.report?.noPermission) notes.push(`⚠️ impossibile pubblicare il report in #${result.report.channel.name} (permessi mancanti)`);
    else if (result.report?.channelMissing) notes.push('⚠️ il canale report configurato non esiste più');

    req.session.flash = { type: 'success', message: `${member.user.tag} verificato come ${label}: ${notes.join(', ')}.` };
    res.redirect('/verify');
  } catch (err) {
    next(err);
  }
});

// No ownership restriction, matching /verify edit on Discord (any admin/mod who can
// reach this page can edit any report).
router.post('/verify/:id/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const id = Number(req.params.id);
    const field = req.body.field;
    const value = req.body.value?.trim();

    if (!verifyManager.EDITABLE_FIELDS.includes(field) || !value) {
      req.session.flash = { type: 'error', message: 'Dati non validi.' };
      res.redirect('/verify');
      return;
    }

    const result = await verifyManager.updateReportAndSync(guild, id, field, value);
    if (!result.found) {
      req.session.flash = { type: 'error', message: 'Questo report non esiste più.' };
    } else if (!result.messageUpdated) {
      req.session.flash = {
        type: 'success',
        message: 'Salvato, ma non ho trovato il messaggio del report originale per aggiornarlo (potrebbe essere stato eliminato).',
      };
    } else {
      req.session.flash = { type: 'success', message: 'Report aggiornato.' };
    }
    res.redirect('/verify');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

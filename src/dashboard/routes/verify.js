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
  return member ? member.user.tag : `(user no longer in the server: ${userId})`;
}

function roleLabel(guild, roleId) {
  if (!roleId) return null;
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `(deleted role: ${roleId})`;
}

function channelLabel(guild, channelId) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(deleted channel: ${channelId})`;
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
    dateLabel: new Date(Number(r.verified_at) * 1000).toLocaleDateString('en-GB'),
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
    req.session.flash = { type: 'success', message: enabled ? 'Verification enabled.' : 'Verification disabled.' };
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
      ['removeRoleId', 'remove', 'Removal'],
      ['allowedRoleId', 'allowedRole', 'Allowed role'],
    ];
    for (const [bodyKey, updateKey, label] of roleFields) {
      const roleId = req.body[bodyKey] || null;
      if (roleId && !guild.roles.cache.has(roleId)) {
        errors.push(`Invalid role for "${label}".`);
      } else {
        updates[updateKey] = roleId;
      }
    }

    const channelId = req.body.reportChannelId || null;
    if (channelId && !guild.channels.cache.has(channelId)) {
      errors.push('Invalid channel.');
    } else {
      updates.channel = channelId;
    }

    if (errors.length === 0) {
      await verifyManager.setConfig(guild.id, updates);
    }

    req.session.flash = errors.length > 0 ? { type: 'error', message: errors.join(' ') } : { type: 'success', message: 'Configuration updated.' };
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
      req.session.flash = { type: 'error', message: 'Invalid default role.' };
      res.redirect('/verify');
      return;
    }

    await verifyManager.setSubRoles(guild.id, roleIds);
    await verifyManager.setConfig(guild.id, { defaultSubRole: defaultSubRoleId });

    req.session.flash = { type: 'success', message: 'Sub roles updated.' };
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
      req.session.flash = { type: 'error', message: 'Invalid verification type.' };
      res.redirect('/verify');
      return;
    }

    const label = verifyManager.TYPE_LABELS[type];
    const member = guild.members.cache.get(req.body.userId);
    if (!member) {
      req.session.flash = { type: 'error', message: 'Invalid user — they must still be in the server.' };
      res.redirect('/verify');
      return;
    }

    const verification = req.body.verification?.trim();
    if (!verification) {
      req.session.flash = { type: 'error', message: 'The "Verification" field is required.' };
      res.redirect('/verify');
      return;
    }
    const social = req.body.social?.trim() || '';

    const config = await verifyManager.getGuildConfig(guild.id);
    const { giveRoleId } = verifyManager.getRoleIdsForType(config, type);

    if (!giveRoleId) {
      req.session.flash = { type: 'error', message: `No role configured for ${label} — set one in Configuration first.` };
      res.redirect('/verify');
      return;
    }

    const giveRole = guild.roles.cache.get(giveRoleId);
    if (!giveRole) {
      req.session.flash = { type: 'error', message: `The role configured for ${label} no longer exists — set a new one in Configuration.` };
      res.redirect('/verify');
      return;
    }

    const botMember = guild.members.me;
    if (!botMember || botMember.roles.highest.position <= giveRole.position) {
      req.session.flash = { type: 'error', message: `I can't assign ${giveRole.name}: my role needs to be higher in the server's role list.` };
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
    notes.push(result.alreadyHadRole ? `already had ${giveRole.name}` : `assigned ${giveRole.name}`);
    if (result.removeRole?.removed) notes.push(`removed ${result.removeRole.role.name}`);
    else if (result.removeRole?.blocked) notes.push(`couldn't remove ${result.removeRole.role.name} (role hierarchy)`);
    for (const cr of result.crossRemovals) {
      notes.push(cr.removed ? `removed ${cr.role.name} (${verifyManager.TYPE_LABELS[cr.type]})` : `couldn't remove ${cr.role.name} (${verifyManager.TYPE_LABELS[cr.type]})`);
    }
    if (result.subRole?.status === 'assigned') {
      notes.push(`assigned the default sub role${result.subRole.defaultRole ? ` (${result.subRole.defaultRole.name})` : ''}`);
    }
    if (result.report?.posted) notes.push(`report posted in #${result.report.channel.name}`);
    else if (result.report?.noPermission) notes.push(`⚠️ couldn't post the report in #${result.report.channel.name} (missing permissions)`);
    else if (result.report?.channelMissing) notes.push('⚠️ the configured report channel no longer exists');

    req.session.flash = { type: 'success', message: `${member.user.tag} verified as ${label}: ${notes.join(', ')}.` };
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
      req.session.flash = { type: 'error', message: 'Invalid data.' };
      res.redirect('/verify');
      return;
    }

    const result = await verifyManager.updateReportAndSync(guild, id, field, value);
    if (!result.found) {
      req.session.flash = { type: 'error', message: 'This report no longer exists.' };
    } else if (!result.messageUpdated) {
      req.session.flash = {
        type: 'success',
        message: "Saved, but I couldn't find the original report message to update it (it may have been deleted).",
      };
    } else {
      req.session.flash = { type: 'success', message: 'Report updated.' };
    }
    res.redirect('/verify');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

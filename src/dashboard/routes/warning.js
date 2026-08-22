const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const warningManager = require('../../features/warning/warningManager');
const { isoToDMY } = require('../../utils/dateFormat');

const router = express.Router();

const WARNING_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const USER_ID_RE = /^\d{17,20}$/;

function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `<@${userId}>`;
}

function roleLabel(guild, roleId) {
  if (!roleId) return null;
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `(deleted role: ${roleId})`;
}

// The DB/parseWarningDate side speaks "DD/MM/YYYY", an <input type="date"> speaks ISO —
// see utils/dateFormat.js's isoToDMY (shared with animenight.js).

function formatDate(ts) {
  return new Date(Number(ts)).toLocaleDateString('en-GB');
}

async function renderWarningPage(req, res, guild) {
  const [enabled, config, ownWarnings, allWarnings] = await Promise.all([
    warningManager.isEnabled(guild.id),
    warningManager.getConfig(guild.id),
    warningManager.getOwnWarningsList(guild.id, req.session.user.id),
    warningManager.getAllWarnings(guild.id),
  ]);

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => WARNING_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const members = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .sort((a, b) => a.user.tag.localeCompare(b.user.tag))
    .map((m) => ({ id: m.id, label: m.user.tag }));

  // Own-editable entries, pre-fetched with their current reason so the "Edit" form
  // can be pre-filled without a second lookup per row.
  const editableRows = await Promise.all(
    ownWarnings.map(async (w) => {
      const full = allWarnings.find((row) => Number(row.id) === w.id);
      return {
        id: w.id,
        label: w.label,
        reason: full?.reason ?? '',
        dateIso: full ? new Date(Number(full.created_at)).toISOString().slice(0, 10) : '',
      };
    })
  );

  // Most recent first — matches the tracked embed's own ordering logic, just flat
  // instead of grouped by user (the embed groups by user; this is a simple audit list).
  const recentWarnings = [...allWarnings]
    .sort((a, b) => Number(b.created_at) - Number(a.created_at))
    .slice(0, 100)
    .map((w) => ({
      userLabel: memberLabel(guild, w.user_id),
      typeLabel: w.type === 'verbal' ? 'Verbal' : 'Warning',
      reason: w.reason,
      roleLabel: roleLabel(guild, w.role_id),
      dateLabel: formatDate(w.created_at),
      issuedByLabel: memberLabel(guild, w.issued_by),
    }));

  res.render('warning', {
    title: 'Warnings',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    config: {
      role1Id: config?.role_1_id ?? null,
      role2Id: config?.role_2_id ?? null,
      channelId: config?.channel_id ?? null,
    },
    roles,
    textChannels,
    members,
    editableRows,
    recentWarnings,
    recentWarningsTruncated: allWarnings.length > 100,
  });
}

router.get('/warning', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderWarningPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/warning/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await warningManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Warnings enabled.' : 'Warnings disabled.' };
    res.redirect('/warning');
  } catch (err) {
    next(err);
  }
});

// Mirrors /warning config: role_1/role_2 must be given together or not at all, channel is
// independent — each piece applied separately so one failing (e.g. role hierarchy) doesn't
// block the other.
router.post('/warning/config', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const role1Id = req.body.role1Id || null;
    const role2Id = req.body.role2Id || null;
    const channelId = req.body.channelId || null;

    if ((role1Id && !role2Id) || (!role1Id && role2Id)) {
      req.session.flash = { type: 'error', message: 'Specify both roles, or neither.' };
      res.redirect('/warning');
      return;
    }

    const errors = [];

    if (role1Id && role2Id) {
      const role1 = guild.roles.cache.get(role1Id);
      const role2 = guild.roles.cache.get(role2Id);
      if (!role1 || !role2) {
        errors.push('Invalid role.');
      } else {
        try {
          await warningManager.setRoles(guild, role1, role2);
        } catch (err) {
          if (err instanceof warningManager.ValidationError) errors.push(err.message);
          else throw err;
        }
      }
    }

    if (channelId) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        errors.push('Invalid channel.');
      } else {
        try {
          await warningManager.setChannel(guild, channel);
        } catch (err) {
          if (err instanceof warningManager.ValidationError) errors.push(err.message);
          else throw err;
        }
      }
    }

    req.session.flash = errors.length > 0 ? { type: 'error', message: errors.join(' ') } : { type: 'success', message: 'Configuration updated.' };
    res.redirect('/warning');
  } catch (err) {
    next(err);
  }
});

// One form, one endpoint, for both "assegna warning" and "assegna verbale" — `type` picks
// which of warningManager's two entry points to call. The ID field doubles as a search box
// via the <datalist> the view renders from `members` (typing a name filters the browser's
// own suggestion list; picking one fills the field with that member's ID) but still accepts
// any freely-typed ID, which matters for `warning` (targets who've left the server are still
// valid — see warnUser) even though `verbal` requires a live member below.
router.post('/warning/assign', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const type = req.body.type === 'verbal' ? 'verbal' : 'warning';
    const targetUserId = req.body.targetUserId?.trim();
    if (!targetUserId || !USER_ID_RE.test(targetUserId)) {
      req.session.flash = { type: 'error', message: 'Invalid user — type the name to search the list, or paste a Discord ID.' };
      res.redirect('/warning');
      return;
    }

    const dateInput = req.body.date ? isoToDMY(req.body.date) : undefined;

    try {
      if (type === 'verbal') {
        const member = guild.members.cache.get(targetUserId);
        if (!member) {
          req.session.flash = { type: 'error', message: 'Invalid user for a verbal — they must still be in the server (a regular warning also works with the ID of someone who has left).' };
          res.redirect('/warning');
          return;
        }
        await warningManager.giveVerbal(guild, member.id, req.body.reason, req.session.user.id, dateInput);
        req.session.flash = { type: 'success', message: `Verbal logged for ${member.user.tag}.` };
      } else {
        const result = await warningManager.warnUser(guild, targetUserId, req.body.reason, req.session.user.id, dateInput);
        const outcomeLabel =
          result.outcome === 'assigned'
            ? `assigned the role ${result.assignedRole?.name}.`
            : result.outcome === 'alreadyMaxed'
              ? 'already has both roles — consider a ban.'
              : 'is no longer in the server — the warning was logged anyway.';
        req.session.flash = { type: 'success', message: `Warning logged — ${outcomeLabel}` };
      }
    } catch (err) {
      if (err instanceof warningManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/warning');
  } catch (err) {
    next(err);
  }
});

// Only the original issuer can edit — enforced inside the manager itself
// (editWarning throws if warning.issued_by !== editorId), same as /warning edit.
router.post('/warning/:id/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const id = Number(req.params.id);
    const reason = req.body.reason?.trim();
    const dateInput = req.body.date ? isoToDMY(req.body.date) : undefined;

    try {
      await warningManager.editWarning(guild, id, req.session.user.id, {
        reason: reason || undefined,
        dateInput,
      });
      req.session.flash = { type: 'success', message: 'Warning updated.' };
    } catch (err) {
      if (err instanceof warningManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/warning');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

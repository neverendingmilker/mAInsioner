const express = require('express');
const { ChannelType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const birthdayManager = require('../../features/birthday/birthdayManager');
const { celebrateBirthdayIfDue, celebrateDueTodayForGuild } = require('../../features/birthday/birthdayScheduler');
const { formatSeconds } = require('../../utils/duration');

const router = express.Router();

const BIRTHDAY_CHANNEL_TYPES = [ChannelType.GuildText];

// Mirrors overview.js/honeypot.js's own copy — see resolveDashboardGuild for when this
// can happen.
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

// Best-effort display name for a saved birthday's user id — the member cache is warmed
// at startup and kept in sync live (see comboroles/memberCacheWarmer.js), so this only
// misses someone who's left the server since their birthday was saved.
function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(utente non più nel server: ${userId})`;
}

// Mirrors /birthday list's own formatDaysLeft.
function daysUntilLabel(daysUntil) {
  if (daysUntil === 0) return 'oggi! 🎉';
  if (daysUntil === 1) return 'domani';
  return `tra ${daysUntil} giorni`;
}

async function renderBirthdayPage(req, res, guild) {
  const [enabled, config, groups] = await Promise.all([
    birthdayManager.isEnabled(guild.id),
    birthdayManager.getGuildConfig(guild.id),
    birthdayManager.getBirthdaysGroupedByMonth(guild.id),
  ]);

  const monthGroups = groups.map((g) => ({
    monthLabel: g.monthLabel,
    entries: g.entries.map((e) => ({
      userId: e.userId,
      userLabel: memberLabel(guild, e.userId),
      // The edit form re-posts to /birthday/add, which (like /birthday add itself)
      // only accepts a userId still in the member cache — hide it for someone who's
      // left the server instead of offering a form that'll just error out; removing
      // the entry still works regardless (see /birthday/remove).
      memberPresent: guild.members.cache.has(e.userId),
      day: e.day,
      month: e.month,
      year: e.year,
      daysUntilLabel: daysUntilLabel(e.daysUntil),
    })),
  }));

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id) // skip @everyone
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => BIRTHDAY_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const members = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .sort((a, b) => a.user.tag.localeCompare(b.user.tag))
    .map((m) => ({ id: m.id, label: m.user.tag }));

  res.render('birthday', {
    title: 'Birthday',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    features: getSidebarFeatures('birthday'),
    enabled,
    config: {
      roleId: config.birthday_role_id,
      removeAfterLabel: formatSeconds(config.remove_after_seconds),
      channelId: config.birthday_channel_id,
    },
    roles,
    textChannels,
    members,
    monthGroups,
  });
}

router.get('/birthday', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderBirthdayPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/birthday/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await birthdayManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Birthday attivato.' : 'Birthday disattivato.' };
    res.redirect('/birthday');
  } catch (err) {
    next(err);
  }
});

router.post('/birthday/config', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const roleId = req.body.roleId || null;
    const removeAfter = req.body.removeAfter?.trim() || null;
    const channelId = req.body.channelId || null;

    if (removeAfter) {
      try {
        await birthdayManager.setRemoveAfterDuration(guild.id, removeAfter);
      } catch (err) {
        if (err instanceof birthdayManager.ValidationError) {
          req.session.flash = { type: 'error', message: err.message };
          res.redirect('/birthday');
          return;
        }
        throw err;
      }
    }

    let needCelebrateCheck = false;

    if (roleId) {
      await birthdayManager.setBirthdayRole(guild.id, roleId);
      needCelebrateCheck = true;
    }
    if (channelId) {
      await birthdayManager.setBirthdayChannel(guild.id, channelId);
      needCelebrateCheck = true;
    }

    if (needCelebrateCheck) {
      // Catches up anyone already celebrating today whose role/greeting was missed
      // because the setting wasn't there yet this morning — same as /birthday config.
      await celebrateDueTodayForGuild(req.client, guild.id);
    }

    req.session.flash = { type: 'success', message: 'Configurazione Birthday aggiornata.' };
    res.redirect('/birthday');
  } catch (err) {
    next(err);
  }
});

router.post('/birthday/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const userId = req.body.userId;
    const member = guild.members.cache.get(userId);
    if (!member) {
      req.session.flash = { type: 'error', message: 'Utente non valido — riprova.' };
      res.redirect('/birthday');
      return;
    }

    const day = parseInt(req.body.day, 10);
    const month = parseInt(req.body.month, 10);
    const year = req.body.year?.trim() ? parseInt(req.body.year, 10) : null;

    try {
      await birthdayManager.addBirthday(guild.id, userId, day, month, year);
      await celebrateBirthdayIfDue(req.client, guild.id, userId, day, month);
      req.session.flash = { type: 'success', message: `Compleanno salvato per ${member.user.tag}.` };
    } catch (err) {
      if (err instanceof birthdayManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/birthday');
  } catch (err) {
    next(err);
  }
});

router.post('/birthday/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await birthdayManager.removeBirthday(guild.id, req.body.userId);
    req.session.flash = { type: 'success', message: 'Compleanno rimosso.' };
    res.redirect('/birthday');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

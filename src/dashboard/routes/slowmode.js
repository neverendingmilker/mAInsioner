const express = require('express');
const { ChannelType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const slowModeManager = require('../../features/slowmode/slowModeManager');
const { formatSeconds } = require('../../utils/duration');

const router = express.Router();

// Threads (public/private) are also valid targets via the slash command, but they
// aren't practical to list in a static dropdown — the dashboard only offers the
// channel types that show up reliably in the guild's channel cache.
const SLOWMODE_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(canale eliminato: ${channelId})`;
}

async function renderSlowmodePage(req, res, guild) {
  const [enabled, limits] = await Promise.all([
    slowModeManager.isEnabled(guild.id),
    slowModeManager.listLimits(guild.id),
  ]);

  const channels = limits
    .map((l) => ({
      channelId: l.channelId,
      channelName: channelLabel(guild, l.channelId),
      cooldownSeconds: l.cooldownSeconds,
      cooldownLabel: l.cooldownLabel,
    }))
    .sort((a, b) => a.channelName.localeCompare(b.channelName));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => SLOWMODE_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('slowmode', {
    title: 'Slowmode',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    channels,
    textChannels,
  });
}

router.get('/slowmode', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderSlowmodePage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/slowmode/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await slowModeManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Slowmode attivato.' : 'Slowmode disattivato.' };
    res.redirect('/slowmode');
  } catch (err) {
    next(err);
  }
});

// Upsert — used both to add a brand-new limit and to edit an existing one from the
// inline "Modifica" form (setLimit is ON CONFLICT DO UPDATE, so both cases are the
// same call).
router.post('/slowmode/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Canale non valido — riprova.' };
      res.redirect('/slowmode');
      return;
    }

    try {
      const { cooldownSeconds } = await slowModeManager.setLimit(guild.id, channel, req.body.duration?.trim(), req.session.user.id);
      req.session.flash = {
        type: 'success',
        message: `#${channel.name}: un messaggio ogni ${formatSeconds(cooldownSeconds)}.`,
      };
    } catch (err) {
      if (err instanceof slowModeManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/slowmode');
  } catch (err) {
    next(err);
  }
});

router.post('/slowmode/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await slowModeManager.removeLimit(guild.id, req.body.channelId);
    req.session.flash = { type: 'success', message: 'Limite rimosso.' };
    res.redirect('/slowmode');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

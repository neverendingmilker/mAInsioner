const express = require('express');
const { ChannelType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const honeypotManager = require('../../features/honeypot/honeypotManager');

const router = express.Router();

const RECENT_KICKS_LIMIT = 20;
const HONEYPOT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Every route below needs the guild; bail out the same way if it isn't resolvable
// (mirrors overview.js's check — see resolveDashboardGuild for when this can happen).
function requireGuild(req, res) {
  const guild = resolveDashboardGuild(req.client);
  if (!guild) {
    res.status(500).render('error', {
      title: 'Server non configurato',
      message: 'Il bot è in più server e non so quale gestire — imposta la variabile d\'ambiente GUILD_ID.',
    });
    return null;
  }
  return guild;
}

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(canale eliminato: ${channelId})`;
}

async function renderHoneypotPage(req, res, guild) {
  const [enabled, channelRows, { total: kickTotal, recent }] = await Promise.all([
    honeypotManager.isEnabled(guild.id),
    honeypotManager.listChannels(guild.id),
    honeypotManager.getKickLog(guild.id, RECENT_KICKS_LIMIT),
  ]);

  // Bait text and button label live only on the Discord message itself (see
  // getChannelDetails) — fetched fresh per channel so the edit form always starts from
  // what's actually posted right now, not a possibly-stale copy.
  const channels = await Promise.all(
    channelRows.map(async (c) => {
      const details = await honeypotManager.getChannelDetails(guild, c.channelId);
      return {
        channelId: c.channelId,
        channelName: channelLabel(guild, c.channelId),
        emoji: c.emoji,
        messageMissing: details?.messageMissing ?? true,
        messageText: details?.messageText ?? '',
        buttonLabel: details?.buttonLabel || honeypotManager.DEFAULT_BUTTON_LABEL,
      };
    })
  );

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => HONEYPOT_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('honeypot', {
    title: 'Honeypot',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    features: getSidebarFeatures('honeypot'),
    enabled,
    channels,
    textChannels,
    defaultMessage: honeypotManager.DEFAULT_MESSAGE,
    defaultButtonLabel: honeypotManager.DEFAULT_BUTTON_LABEL,
    kickTotal,
    recentKicks: recent.map((k) => ({
      userTag: k.userTag || k.userId,
      channelName: channelLabel(guild, k.channelId),
      trigger: k.trigger,
      when: new Date(k.kickedAt).toLocaleString('it-IT'),
    })),
  });
}

router.get('/honeypot', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderHoneypotPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await honeypotManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Honeypot attivato.' : 'Honeypot disattivato.' };
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Canale non valido — riprova.' };
      res.redirect('/honeypot');
      return;
    }

    try {
      await honeypotManager.addChannel(
        guild,
        channel,
        req.body.message?.trim() || null,
        req.body.buttonLabel?.trim() || null,
        req.session.user.id,
        req.body.emoji?.trim() || null
      );
      req.session.flash = { type: 'success', message: `Trappola creata in #${channel.name}.` };
    } catch (err) {
      if (err instanceof honeypotManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await honeypotManager.editChannel(guild, req.body.channelId, req.body.message?.trim() || null, req.body.buttonLabel?.trim() || null);
      req.session.flash = { type: 'success', message: 'Trappola aggiornata — il messaggio nel canale è già cambiato.' };
    } catch (err) {
      if (err instanceof honeypotManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await honeypotManager.removeChannel(guild, req.body.channelId);
      req.session.flash = { type: 'success', message: 'Trappola rimossa.' };
    } catch (err) {
      if (err instanceof honeypotManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

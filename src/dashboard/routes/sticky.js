const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const stickyManager = require('../../features/sticky/stickyManager');
const { parseDurationToSeconds, formatSeconds } = require('../../utils/duration');

const router = express.Router();

// Threads are also valid sticky targets via the slash command, but same tradeoff as
// Slowmode/Reaction Limit: not practical to list in a static dropdown, so the
// dashboard only offers plain channel types here.
const STICKY_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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

async function renderStickyPage(req, res, guild) {
  const enabled = stickyManager.isEnabled(guild.id);
  const stickies = stickyManager
    .listByGuild(guild.id)
    .map((s) => ({
      channelId: s.channelId,
      channelName: channelLabel(guild, s.channelId),
      content: s.content,
      repostDelaySeconds: s.repostDelaySeconds,
      repostDelayLabel: formatSeconds(s.repostDelaySeconds),
    }))
    .sort((a, b) => a.channelName.localeCompare(b.channelName));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => STICKY_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('sticky', {
    title: 'Sticky Messages',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    stickies,
    textChannels,
    defaultDelaySeconds: stickyManager.DEFAULT_REPOST_DELAY_SECONDS,
  });
}

router.get('/sticky', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderStickyPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/sticky/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await stickyManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Sticky Messages attivato.' : 'Sticky Messages disattivato.' };
    res.redirect('/sticky');
  } catch (err) {
    next(err);
  }
});

// Upsert — used both to create a new sticky and to edit an existing one from the
// inline "Modifica" form (setSticky always replaces content/delay for the channel).
// Note: if the channel already had a sticky, this deletes the old message, waits a
// ~10s gap, then posts the new one — same behavior (and same wait) as /sticky add on
// Discord, so this request can take a few seconds to complete.
router.post('/sticky/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    const content = req.body.content?.trim();
    if (!channel || !content) {
      req.session.flash = { type: 'error', message: 'Canale o messaggio non validi — riprova.' };
      res.redirect('/sticky');
      return;
    }

    let delaySeconds = stickyManager.DEFAULT_REPOST_DELAY_SECONDS;
    if (req.body.delay?.trim()) {
      try {
        delaySeconds = parseDurationToSeconds(req.body.delay.trim());
      } catch (err) {
        req.session.flash = { type: 'error', message: err.message };
        res.redirect('/sticky');
        return;
      }
    }

    const botMember = guild.members.me;
    const canPost = botMember && channel.permissionsFor?.(botMember)?.has?.([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
    if (canPost === false) {
      req.session.flash = { type: 'error', message: `Non ho i permessi per vedere/scrivere in #${channel.name}.` };
      res.redirect('/sticky');
      return;
    }

    await stickyManager.setSticky(channel, content, req.session.user.id, delaySeconds);
    req.session.flash = { type: 'success', message: `Messaggio persistente salvato in #${channel.name}.` };
    res.redirect('/sticky');
  } catch (err) {
    next(err);
  }
});

router.post('/sticky/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await stickyManager.removeSticky(guild, req.body.channelId);
    req.session.flash = { type: 'success', message: 'Messaggio persistente rimosso.' };
    res.redirect('/sticky');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

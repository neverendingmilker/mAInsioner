const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const autoresponderManager = require('../../features/autoresponder/autoresponderManager');

const router = express.Router();

// Threads/forums are also valid targets via the slash command, but same tradeoff as
// Slowmode/Reaction Limit/Sticky: not practical to list in a static dropdown.
const AUTORESPONDER_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum];

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(deleted channel: ${channelId})`;
}

async function renderAutoresponderPage(req, res, guild) {
  const [enabled, channelRows] = await Promise.all([
    autoresponderManager.isEnabled(guild.id),
    autoresponderManager.listChannels(guild.id),
  ]);

  const channels = channelRows
    .map((c) => ({
      channelId: c.channelId,
      channelName: channelLabel(guild, c.channelId),
      emojisText: c.emojis.join(' '),
      contentFilter: c.contentFilter,
      redirectBotId: c.redirectBotId,
      redirectWindowSeconds: c.redirectWindowSeconds,
    }))
    .sort((a, b) => a.channelName.localeCompare(b.channelName));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => AUTORESPONDER_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('autoresponder', {
    title: 'Autoresponder',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    channels,
    textChannels,
    maxRedirectWindowSeconds: autoresponderManager.MAX_REDIRECT_WINDOW_SECONDS,
  });
}

router.get('/autoresponder', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderAutoresponderPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/autoresponder/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await autoresponderManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Autoresponder enabled.' : 'Autoresponder disabled.' };
    res.redirect('/autoresponder');
  } catch (err) {
    next(err);
  }
});

// Upsert — used both to add a brand-new channel config and to edit an existing one
// from the inline "Edit" form (setChannel is ON CONFLICT DO UPDATE).
router.post('/autoresponder/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Invalid channel — try again.' };
      res.redirect('/autoresponder');
      return;
    }

    const contentFilter = {
      attachment: req.body.attachment === 'on',
      videoLink: req.body.videoLink === 'on',
      xLink: req.body.xLink === 'on',
    };

    const redirectBotId = req.body.redirectBotId?.trim() || null;
    const redirectWindowRaw = req.body.redirectWindowSeconds?.trim();
    const redirectWindowSeconds = redirectWindowRaw ? parseInt(redirectWindowRaw, 10) : null;

    try {
      await autoresponderManager.setChannel(
        guild,
        channel,
        req.body.emojis || '',
        contentFilter,
        redirectBotId,
        Number.isNaN(redirectWindowSeconds) ? null : redirectWindowSeconds,
        req.session.user.id
      );
      req.session.flash = { type: 'success', message: `Autoresponder saved for #${channel.name}.` };
    } catch (err) {
      if (err instanceof autoresponderManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/autoresponder');
  } catch (err) {
    next(err);
  }
});

router.post('/autoresponder/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await autoresponderManager.removeChannel(guild.id, req.body.channelId);
    req.session.flash = { type: 'success', message: 'Autoresponder removed.' };
    res.redirect('/autoresponder');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

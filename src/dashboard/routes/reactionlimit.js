const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const reactionLimitManager = require('../../features/reactionlimit/reactionLimitManager');

const router = express.Router();

const REACTIONLIMIT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement];

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(deleted channel: ${channelId})`;
}

async function renderReactionLimitPage(req, res, guild) {
  const [enabled, channelRows] = await Promise.all([
    reactionLimitManager.isEnabled(guild.id),
    reactionLimitManager.listChannels(guild.id),
  ]);

  const channels = channelRows
    .map((c) => ({
      channelId: c.channelId,
      channelName: channelLabel(guild, c.channelId),
      reactionLimit: c.reactionLimit,
      ignoreFirstPost: c.ignoreFirstPost,
    }))
    .sort((a, b) => a.channelName.localeCompare(b.channelName));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => REACTIONLIMIT_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('reactionlimit', {
    title: 'Reaction Limit',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    channels,
    textChannels,
    defaultLimit: reactionLimitManager.DEFAULT_REACTION_LIMIT,
  });
}

router.get('/reactionlimit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderReactionLimitPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/reactionlimit/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await reactionLimitManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Reaction Limit enabled.' : 'Reaction Limit disabled.' };
    res.redirect('/reactionlimit');
  } catch (err) {
    next(err);
  }
});

// Upsert — used both to add a brand-new channel config and to edit an existing one
// from the inline "Edit" form (setChannel is ON CONFLICT DO UPDATE).
router.post('/reactionlimit/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Invalid channel — try again.' };
      res.redirect('/reactionlimit');
      return;
    }

    const reactionLimit = parseInt(req.body.reactionLimit, 10);
    const ignoreFirstPost = req.body.ignoreFirstPost === 'on';

    try {
      await reactionLimitManager.setChannel(
        guild,
        channel,
        Number.isNaN(reactionLimit) ? reactionLimitManager.DEFAULT_REACTION_LIMIT : reactionLimit,
        ignoreFirstPost,
        req.session.user.id
      );
      req.session.flash = { type: 'success', message: `#${channel.name}: reaction limit saved.` };
    } catch (err) {
      if (err instanceof reactionLimitManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/reactionlimit');
  } catch (err) {
    next(err);
  }
});

router.post('/reactionlimit/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await reactionLimitManager.removeChannel(guild.id, req.body.channelId);
    req.session.flash = { type: 'success', message: 'Limit removed.' };
    res.redirect('/reactionlimit');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

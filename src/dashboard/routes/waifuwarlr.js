const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const waifuWarLRManager = require('../../features/waifuwarlr/waifuWarLRManager');

const router = express.Router();

const REACTIONCODE_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(canale eliminato: ${channelId})`;
}

async function renderWaifuwarlrPage(req, res, guild) {
  const [enabled, channelIds] = await Promise.all([waifuWarLRManager.isEnabled(guild.id), waifuWarLRManager.listChannels(guild.id)]);

  const channelCards = await Promise.all(
    channelIds.map(async (channelId) => {
      const digitMap = await waifuWarLRManager.getDigitMap(guild.id, channelId);
      return {
        channelId,
        channelName: channelLabel(guild, channelId),
        mappings: [...digitMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([digit, emoji]) => ({ digit, emoji })),
      };
    })
  );
  channelCards.sort((a, b) => a.channelName.localeCompare(b.channelName));

  const configuredIds = new Set(channelIds);
  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => REACTIONCODE_CHANNEL_TYPES.includes(c.type) && !configuredIds.has(c.id))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('waifuwarlr', {
    title: 'WaifuWar LR',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    channels: channelCards,
    textChannels,
  });
}

router.get('/waifuwarlr', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderWaifuwarlrPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/waifuwarlr/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await waifuWarLRManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'WaifuWar LR attivato.' : 'WaifuWar LR disattivato.' };
    res.redirect('/waifuwarlr');
  } catch (err) {
    next(err);
  }
});

router.post('/waifuwarlr/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Canale non valido — riprova.' };
      res.redirect('/waifuwarlr');
      return;
    }

    try {
      await waifuWarLRManager.addChannel(guild, channel, req.session.user.id);
      req.session.flash = { type: 'success', message: `#${channel.name} impostato per i codici a reazione.` };
    } catch (err) {
      if (err instanceof waifuWarLRManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/waifuwarlr');
  } catch (err) {
    next(err);
  }
});

router.post('/waifuwarlr/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await waifuWarLRManager.removeChannel(guild.id, req.body.channelId);
    req.session.flash = { type: 'success', message: 'Canale rimosso (comprese le mappature digit).' };
    res.redirect('/waifuwarlr');
  } catch (err) {
    next(err);
  }
});

// `digit`/`emoji` each accept comma-separated lists paired up by position, same as
// /waifuwarlr setdigit — used both to add new mappings and to overwrite existing ones
// (setDigit is an upsert per digit).
router.post('/waifuwarlr/setdigit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channelId = req.body.channelId;

    try {
      const mappings = await waifuWarLRManager.setDigit(guild.id, channelId, req.body.digit || '', req.body.emoji || '');
      req.session.flash = { type: 'success', message: `${mappings.length} mappatura/e salvata/e.` };
    } catch (err) {
      if (err instanceof waifuWarLRManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/waifuwarlr');
  } catch (err) {
    next(err);
  }
});

router.post('/waifuwarlr/removedigit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await waifuWarLRManager.removeDigit(guild.id, req.body.channelId, req.body.digit);
    req.session.flash = { type: 'success', message: 'Mappatura rimossa.' };
    res.redirect('/waifuwarlr');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

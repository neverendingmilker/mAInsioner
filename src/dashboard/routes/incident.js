const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const incidentManager = require('../../features/incident/incidentManager');

const router = express.Router();

const INCIDENT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

async function renderIncidentPage(req, res, guild) {
  const [enabled, config] = await Promise.all([
    incidentManager.isEnabled(guild.id),
    incidentManager.getGuildConfig(guild.id),
  ]);

  const channel = config.channel_id ? guild.channels.cache.get(config.channel_id) : null;

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => INCIDENT_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('incident', {
    title: 'Incident Counter',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    count: config.count,
    channelId: config.channel_id,
    channelName: config.channel_id ? (channel ? `#${channel.name}` : `(canale eliminato: ${config.channel_id})`) : null,
    textChannels,
  });
}

router.get('/incident', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderIncidentPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/incident/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await incidentManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Incident Counter attivato.' : 'Incident Counter disattivato.' };
    res.redirect('/incident');
  } catch (err) {
    next(err);
  }
});

router.post('/incident/channel', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Canale non valido — riprova.' };
      res.redirect('/incident');
      return;
    }

    await incidentManager.setChannel(guild.id, channel.id);
    const result = await incidentManager.postUpdate(req.client, guild.id);
    req.session.flash = result.posted
      ? { type: 'success', message: `Canale impostato su #${channel.name}. Cartello pubblicato.` }
      : { type: 'error', message: `Canale impostato su #${channel.name}, ma non sono riuscito a pubblicare il cartello (${result.reason}).` };
    res.redirect('/incident');
  } catch (err) {
    next(err);
  }
});

router.post('/incident/set', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const count = parseInt(req.body.count, 10);
    try {
      const result = await incidentManager.setCount(req.client, guild.id, count);
      req.session.flash = result.posted
        ? { type: 'success', message: `Contatore impostato a ${count}. Cartello aggiornato.` }
        : { type: 'error', message: `Contatore impostato a ${count}, ma il cartello non è stato pubblicato (${result.reason}) — imposta prima un canale.` };
    } catch (err) {
      if (err instanceof incidentManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/incident');
  } catch (err) {
    next(err);
  }
});

router.post('/incident/reset', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const result = await incidentManager.reset(req.client, guild.id);
    req.session.flash = result.posted
      ? { type: 'success', message: 'Contatore azzerato. Cartello aggiornato.' }
      : { type: 'error', message: `Contatore azzerato, ma il cartello non è stato pubblicato (${result.reason}) — imposta prima un canale.` };
    res.redirect('/incident');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const suggestionManager = require('../../features/suggestion/suggestionManager');

const router = express.Router();

const SUGGESTION_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const MAX_CONTENT_LENGTH = 1000;

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

function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(utente non più nel server: ${userId})`;
}

function formatDate(ts) {
  return new Date(Number(ts)).toLocaleString('it-IT');
}

async function renderSuggestionPage(req, res, guild) {
  const [enabled, channelId, pending] = await Promise.all([
    suggestionManager.isEnabled(guild.id),
    suggestionManager.getChannelId(guild.id),
    suggestionManager.listPending(guild.id),
  ]);

  const suggestions = pending.map((s) => ({
    number: s.number,
    content: s.content,
    authorLabel: memberLabel(guild, s.user_id),
    createdAtLabel: formatDate(s.created_at),
  }));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => SUGGESTION_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('suggestion', {
    title: 'Suggestions',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    features: getSidebarFeatures('suggestion'),
    enabled,
    channelId,
    textChannels,
    suggestions,
    maxContentLength: MAX_CONTENT_LENGTH,
  });
}

router.get('/suggestion', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderSuggestionPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/suggestion/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await suggestionManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Suggestions attivato.' : 'Suggestions disattivato.' };
    res.redirect('/suggestion');
  } catch (err) {
    next(err);
  }
});

// Single endpoint for both set and remove, same as /suggestion channel on Discord —
// an empty selection clears the config instead of erroring.
router.post('/suggestion/channel', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channelId = req.body.channelId || null;
    if (!channelId) {
      await suggestionManager.removeChannel(guild.id);
      req.session.flash = { type: 'success', message: 'Canale suggerimenti rimosso.' };
      res.redirect('/suggestion');
      return;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Canale non valido — riprova.' };
      res.redirect('/suggestion');
      return;
    }

    const botMember = guild.members.me;
    const canPost = botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
    if (!canPost) {
      req.session.flash = { type: 'error', message: `Non ho i permessi per vedere/scrivere in #${channel.name}.` };
      res.redirect('/suggestion');
      return;
    }

    await suggestionManager.setChannel(guild.id, channel.id);
    req.session.flash = { type: 'success', message: `I suggerimenti verranno postati in #${channel.name}.` };
    res.redirect('/suggestion');
  } catch (err) {
    next(err);
  }
});

// Editing is restricted to pending suggestions here too — same rule as /suggestion edit,
// just without the "own suggestion only" part since the dashboard is Admin-only anyway
// (there's no non-admin dashboard user who could submit someone else's suggestion here).
router.post('/suggestion/:number/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const number = Number(req.params.number);
    const existing = await suggestionManager.getSuggestion(guild.id, number);
    if (!existing) {
      req.session.flash = { type: 'error', message: 'Suggerimento non trovato.' };
      res.redirect('/suggestion');
      return;
    }
    if (existing.status !== 'pending') {
      req.session.flash = { type: 'error', message: 'Questo suggerimento è già stato deciso e non può più essere modificato.' };
      res.redirect('/suggestion');
      return;
    }

    const content = req.body.content?.trim().slice(0, MAX_CONTENT_LENGTH);
    if (!content) {
      req.session.flash = { type: 'error', message: 'Il testo non può essere vuoto.' };
      res.redirect('/suggestion');
      return;
    }

    await suggestionManager.editContent(guild, number, content);
    req.session.flash = { type: 'success', message: `Suggerimento #${number} aggiornato.` };
    res.redirect('/suggestion');
  } catch (err) {
    next(err);
  }
});

// Approve/reject post a NEW message with the updated color/title — the original pending
// message is left as-is in the channel, same behavior as /suggestion approve|reject.
async function decide(req, res, next, status, verbLabel) {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const number = Number(req.params.number);
    const existing = await suggestionManager.getSuggestion(guild.id, number);
    if (!existing) {
      req.session.flash = { type: 'error', message: 'Suggerimento non trovato.' };
      res.redirect('/suggestion');
      return;
    }
    if (existing.status !== 'pending') {
      req.session.flash = { type: 'error', message: 'Questo suggerimento è già stato deciso.' };
      res.redirect('/suggestion');
      return;
    }

    await suggestionManager.setStatus(guild, number, status, req.session.user.id);
    req.session.flash = { type: 'success', message: `Suggerimento #${number} ${verbLabel}.` };
    res.redirect('/suggestion');
  } catch (err) {
    next(err);
  }
}

router.post('/suggestion/:number/approve', (req, res, next) => decide(req, res, next, 'approved', 'approvato'));
router.post('/suggestion/:number/reject', (req, res, next) => decide(req, res, next, 'denied', 'rifiutato'));

router.post('/suggestion/:number/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const number = Number(req.params.number);
    await suggestionManager.removeSuggestion(guild, number);
    req.session.flash = { type: 'success', message: `Suggerimento #${number} rimosso.` };
    res.redirect('/suggestion');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { requireGuild } = require('../guild');
const suggestionManager = require('../../features/suggestion/suggestionManager');

const router = express.Router();

const SUGGESTION_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const MAX_CONTENT_LENGTH = 1000;

function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(user no longer in the server: ${userId})`;
}

function formatDate(ts) {
  return new Date(Number(ts)).toLocaleString('en-GB');
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
    req.session.flash = { type: 'success', message: enabled ? 'Suggestions enabled.' : 'Suggestions disabled.' };
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
      req.session.flash = { type: 'success', message: 'Suggestions channel removed.' };
      res.redirect('/suggestion');
      return;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Invalid channel — try again.' };
      res.redirect('/suggestion');
      return;
    }

    const botMember = guild.members.me;
    const canPost = botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
    if (!canPost) {
      req.session.flash = { type: 'error', message: `I don't have permission to view/send messages in #${channel.name}.` };
      res.redirect('/suggestion');
      return;
    }

    await suggestionManager.setChannel(guild.id, channel.id);
    req.session.flash = { type: 'success', message: `Suggestions will be posted in #${channel.name}.` };
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
      req.session.flash = { type: 'error', message: 'Suggestion not found.' };
      res.redirect('/suggestion');
      return;
    }
    if (existing.status !== 'pending') {
      req.session.flash = { type: 'error', message: 'This suggestion has already been decided and can no longer be edited.' };
      res.redirect('/suggestion');
      return;
    }

    const content = req.body.content?.trim().slice(0, MAX_CONTENT_LENGTH);
    if (!content) {
      req.session.flash = { type: 'error', message: 'Text can\'t be empty.' };
      res.redirect('/suggestion');
      return;
    }

    await suggestionManager.editContent(guild, number, content);
    req.session.flash = { type: 'success', message: `Suggestion #${number} updated.` };
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
      req.session.flash = { type: 'error', message: 'Suggestion not found.' };
      res.redirect('/suggestion');
      return;
    }
    if (existing.status !== 'pending') {
      req.session.flash = { type: 'error', message: 'This suggestion has already been decided.' };
      res.redirect('/suggestion');
      return;
    }

    await suggestionManager.setStatus(guild, number, status, req.session.user.id);
    req.session.flash = { type: 'success', message: `Suggestion #${number} ${verbLabel}.` };
    res.redirect('/suggestion');
  } catch (err) {
    next(err);
  }
}

router.post('/suggestion/:number/approve', (req, res, next) => decide(req, res, next, 'approved', 'approved'));
router.post('/suggestion/:number/reject', (req, res, next) => decide(req, res, next, 'denied', 'rejected'));

router.post('/suggestion/:number/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const number = Number(req.params.number);
    await suggestionManager.removeSuggestion(guild, number);
    req.session.flash = { type: 'success', message: `Suggestion #${number} removed.` };
    res.redirect('/suggestion');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const starboardManager = require('../../features/starboard/starboardManager');

const router = express.Router();

// Same tradeoff as GoosePizza/etc: threads are valid watch/post targets via the slash
// command's channel option, but not practical to list in a static dropdown — text/
// announcement channels only here too.
const STARBOARD_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(canale eliminato: ${channelId})`;
}

async function renderStarboardPage(req, res, guild) {
  const [enabled, boards] = await Promise.all([starboardManager.isEnabled(guild.id), starboardManager.listAll(guild.id)]);

  const boardCards = boards
    .map((b) => {
      const emojis = JSON.parse(b.emojis);
      return {
        name: b.name,
        watchChannelId: b.watch_channel_ids[0],
        watchChannelLabel: channelLabel(guild, b.watch_channel_ids[0]),
        postChannelId: b.post_channel_id,
        postChannelLabel: channelLabel(guild, b.post_channel_id),
        threshold: b.threshold,
        // Raw, space-separated tokens — re-parseable as-is by the edit form, unlike
        // formatEmojisForDisplay() which turns ["any"] into the human-readable "Any emoji".
        emojisRaw: emojis.join(' '),
        emojisDisplay: starboardManager.formatEmojisForDisplay(emojis),
        contentType: b.content_type,
        contentTypeLabel: starboardManager.CONTENT_TYPES[b.content_type],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => STARBOARD_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('starboard', {
    title: 'Starboard',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    boards: boardCards,
    textChannels,
    contentTypes: starboardManager.CONTENT_TYPES,
    minThreshold: starboardManager.MIN_THRESHOLD,
    maxThreshold: starboardManager.MAX_THRESHOLD,
    maxEmojis: starboardManager.MAX_EMOJIS,
  });
}

router.get('/starboard', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderStarboardPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/starboard/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await starboardManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Starboard attivato.' : 'Starboard disattivato.' };
    res.redirect('/starboard');
  } catch (err) {
    next(err);
  }
});

router.post('/starboard/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      const watchChannel = guild.channels.cache.get(req.body.watchChannelId);
      const postChannel = guild.channels.cache.get(req.body.postChannelId);
      if (!watchChannel || !postChannel) {
        throw new starboardManager.ValidationError('Scegli un canale osservato e un canale di destinazione validi.');
      }

      const threshold = parseInt(req.body.threshold, 10);
      const result = await starboardManager.create(
        guild,
        req.body.name,
        watchChannel,
        postChannel,
        threshold,
        req.body.emojis,
        req.body.contentType,
        req.session.user.id
      );
      req.session.flash = { type: 'success', message: `Starboard "${result.name}" creata.` };
    } catch (err) {
      if (err instanceof starboardManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/starboard');
  } catch (err) {
    next(err);
  }
});

// Every field is always sent from the pre-filled "Modifica" form, so this always does a
// full replace — same UX as the other feature pages' inline edit, even though the manager
// itself supports partial updates.
router.post('/starboard/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const name = req.body.name;
    try {
      const watchChannel = guild.channels.cache.get(req.body.watchChannelId);
      const postChannel = guild.channels.cache.get(req.body.postChannelId);
      if (!watchChannel || !postChannel) {
        throw new starboardManager.ValidationError('Scegli un canale osservato e un canale di destinazione validi.');
      }

      await starboardManager.edit(guild, name, {
        watchChannel,
        postChannel,
        threshold: parseInt(req.body.threshold, 10),
        contentType: req.body.contentType,
        emojisInput: req.body.emojis,
      });
      req.session.flash = { type: 'success', message: `Starboard "${name}" aggiornata.` };
    } catch (err) {
      if (err instanceof starboardManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/starboard');
  } catch (err) {
    next(err);
  }
});

router.post('/starboard/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await starboardManager.remove(guild.id, req.body.name);
    req.session.flash = { type: 'success', message: 'Starboard rimossa.' };
    res.redirect('/starboard');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

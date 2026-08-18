const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const starboardManager = require('../../features/starboard/starboardManager');
const { pickedValues } = require('../../utils/multiSelect');

const router = express.Router();

// Same tradeoff as GoosePizza/etc: threads are valid watch/post targets via the slash
// command's channel option, but not practical to list in a static dropdown — text/
// announcement channels only here too.
const STARBOARD_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// In-memory tracking of lookback scans kicked off from the dashboard, keyed by
// "<guildId>::<boardName>". Dashboard and bot share one process (see idee-future.md),
// so a route handler can start a scan and return immediately without awaiting it — the
// `stats` object handed back by starboardManager.startLookback() is mutated in place as
// each ~100-message page gets processed, so polling it here is genuinely live progress,
// not a simulated one. Lost on a bot restart, same as any other in-memory state — that's
// fine, a restart would have killed the in-flight scan anyway.
const runningLookbacks = new Map();
// How long a finished/failed result stays visible to a poll before being cleaned up.
const LOOKBACK_RESULT_RETENTION_MS = 10 * 60 * 1000;

function lookbackKey(guildId, name) {
  return `${guildId}::${name}`;
}

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(canale eliminato: ${channelId})`;
}

async function renderStarboardPage(req, res, guild) {
  const [enabled, boards] = await Promise.all([starboardManager.isEnabled(guild.id), starboardManager.listAll(guild.id)]);

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => STARBOARD_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const boardCards = boards
    .map((b) => {
      const emojis = JSON.parse(b.emojis);
      const entry = runningLookbacks.get(lookbackKey(guild.id, b.name));
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
        // Extra channels a lookback can additionally cover — everything except the
        // board's own watch channel, which is always included automatically.
        extraChannelChoices: textChannels.filter((c) => c.id !== b.watch_channel_ids[0]),
        lookback: entry ? entry.stats : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

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
    lookbackDefaultLimit: starboardManager.LOOKBACK_DEFAULT_LIMIT,
    lookbackMaxLimit: starboardManager.LOOKBACK_MAX_LIMIT,
    maxLookbackChannels: starboardManager.MAX_LOOKBACK_CHANNELS,
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

// Kicks off a lookback scan WITHOUT awaiting it — the request returns as soon as
// starboardManager.startLookback() has finished validating options and resolving
// channels (fast), well before any message scanning happens. The scan itself keeps
// running in the background of this same process; progress is exposed via the `stats`
// object stored in `runningLookbacks` and polled by /starboard/lookback/status.
router.post('/starboard/lookback', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const name = req.body.name;
    const key = lookbackKey(guild.id, name);
    const existing = runningLookbacks.get(key);
    if (existing && existing.stats.status === 'running') {
      req.session.flash = { type: 'error', message: `Una scansione per "${name}" è già in corso.` };
      res.redirect('/starboard');
      return;
    }

    try {
      const extraChannelIds = pickedValues(req.body.extraChannelIds);
      const extraChannels = extraChannelIds.map((id) => guild.channels.cache.get(id)).filter(Boolean);

      const sinceMode = req.body.sinceMode; // 'none' | 'year_start' | 'date'
      const options = {
        limit: req.body.limit ? parseInt(req.body.limit, 10) : undefined,
        sinceYearStart: sinceMode === 'year_start',
        sinceDateInput: sinceMode === 'date' && req.body.sinceDate ? req.body.sinceDate : undefined,
        untilDateInput: req.body.untilDate || undefined,
        contentType: req.body.contentType || undefined,
        emojisInput: req.body.emojis || undefined,
        threshold: req.body.threshold ? parseInt(req.body.threshold, 10) : undefined,
        extraChannels,
      };

      const { stats, promise } = await starboardManager.startLookback(guild, name, options);
      runningLookbacks.set(key, { stats, startedAt: Date.now() });

      // Swallow the rejection here (a failed scan is surfaced via stats.status/
      // errorMessage for anyone polling, not via an unhandled rejection) and clean up
      // the entry a while after it's done, so a result stays visible if the admin
      // reloads the page shortly after, without leaking memory over a long uptime.
      promise.catch(() => null).finally(() => {
        setTimeout(() => {
          const entry = runningLookbacks.get(key);
          if (entry && entry.stats === stats) runningLookbacks.delete(key);
        }, LOOKBACK_RESULT_RETENTION_MS);
      });

      req.session.flash = { type: 'success', message: `Scansione avviata per "${name}" — l'avanzamento compare sulla card qui sotto.` };
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

// Polled by starboardLookback.js while a scan is running, to update its progress badge
// live without a full page reload. Scoped to the current dashboard guild only.
router.get('/starboard/lookback/status', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const prefix = `${guild.id}::`;
    const result = {};
    for (const [key, entry] of runningLookbacks.entries()) {
      if (!key.startsWith(prefix)) continue;
      result[key.slice(prefix.length)] = entry.stats;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

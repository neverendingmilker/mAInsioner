const express = require('express');
const { ChannelType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const goosepizzaManager = require('../../features/goosepizza/goosepizzaManager');

const router = express.Router();

// Same tradeoff as every other channel-picking page here: threads are valid watch
// targets via the slash command's ChannelSelectMenu, but not practical to list
// individually in a static checkbox list — text/announcement channels only.
const GOOSEPIZZA_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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

// req.body.channelIds is undefined (nothing checked), a string (one checkbox checked)
// or an array (several) depending on how many checkboxes were ticked — express doesn't
// normalize this on its own.
function pickedChannelIds(body) {
  return [].concat(body.channelIds || []);
}

async function renderGoosepizzaPage(req, res, guild) {
  const [enabled, triggers] = await Promise.all([goosepizzaManager.isEnabled(guild.id), goosepizzaManager.listAll(guild.id)]);

  const triggerCards = triggers
    .map((t) => ({
      name: t.name,
      triggerText: t.trigger_text,
      emoji: t.emoji,
      responseMode: t.response_mode,
      responseModeLabel: goosepizzaManager.RESPONSE_MODES[t.response_mode],
      enabled: t.enabled,
      channelIds: t.channel_ids,
      channelLabels: t.channel_ids.length > 0 ? t.channel_ids.map((id) => channelLabel(guild, id)).join(', ') : '(nessun canale)',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => GOOSEPIZZA_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  res.render('goosepizza', {
    title: 'GoosePizza',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    triggers: triggerCards,
    textChannels,
    responseModes: goosepizzaManager.RESPONSE_MODES,
    maxChannels: goosepizzaManager.MAX_CHANNELS_PER_TRIGGER,
  });
}

router.get('/goosepizza', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderGoosepizzaPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/goosepizza/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await goosepizzaManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'GoosePizza attivato.' : 'GoosePizza disattivato.' };
    res.redirect('/goosepizza');
  } catch (err) {
    next(err);
  }
});

router.post('/goosepizza/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channelIds = pickedChannelIds(req.body);
    if (channelIds.length > goosepizzaManager.MAX_CHANNELS_PER_TRIGGER) {
      req.session.flash = { type: 'error', message: `Puoi scegliere al massimo ${goosepizzaManager.MAX_CHANNELS_PER_TRIGGER} canali.` };
      res.redirect('/goosepizza');
      return;
    }

    try {
      const pending = await goosepizzaManager.validateNewTrigger(guild.id, req.body.name, req.body.triggerText, req.body.emoji, req.body.mode);
      pending.createdBy = req.session.user.id;

      const channels = channelIds.map((id) => guild.channels.cache.get(id)).filter(Boolean);
      await goosepizzaManager.finalizeCreate(guild, pending, channels);
      req.session.flash = { type: 'success', message: `Trigger "${pending.name}" creato.` };
    } catch (err) {
      if (err instanceof goosepizzaManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/goosepizza');
  } catch (err) {
    next(err);
  }
});

// Both the trigger's fields (trigger text/emoji/mode) and its channel list are always
// sent from the pre-filled "Modifica" form, so this always does a full replace of both —
// same UX as the other feature pages' inline edit, even though the manager itself
// supports partial updates for the text fields.
router.post('/goosepizza/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const name = req.body.name;
    const channelIds = pickedChannelIds(req.body);
    if (channelIds.length > goosepizzaManager.MAX_CHANNELS_PER_TRIGGER) {
      req.session.flash = { type: 'error', message: `Puoi scegliere al massimo ${goosepizzaManager.MAX_CHANNELS_PER_TRIGGER} canali.` };
      res.redirect('/goosepizza');
      return;
    }

    try {
      await goosepizzaManager.edit(guild, name, {
        triggerInput: req.body.triggerText,
        emojiInput: req.body.emoji,
        mode: req.body.mode,
      });

      const channels = channelIds.map((id) => guild.channels.cache.get(id)).filter(Boolean);
      await goosepizzaManager.setChannels(guild, name, channels);
      req.session.flash = { type: 'success', message: `Trigger "${name}" aggiornato.` };
    } catch (err) {
      if (err instanceof goosepizzaManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/goosepizza');
  } catch (err) {
    next(err);
  }
});

router.post('/goosepizza/trigger-toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      const enabled = req.body.enabled === 'true';
      await goosepizzaManager.setTriggerEnabled(guild.id, req.body.name, enabled);
      req.session.flash = { type: 'success', message: `Trigger "${req.body.name}" ${enabled ? 'attivato' : 'disattivato'}.` };
    } catch (err) {
      if (err instanceof goosepizzaManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
        res.redirect('/goosepizza');
        return;
      }
      throw err;
    }
    res.redirect('/goosepizza');
  } catch (err) {
    next(err);
  }
});

router.post('/goosepizza/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await goosepizzaManager.remove(guild.id, req.body.name);
    req.session.flash = { type: 'success', message: 'Trigger rimosso.' };
    res.redirect('/goosepizza');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

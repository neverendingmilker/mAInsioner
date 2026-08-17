const express = require('express');
const { ChannelType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const themesManager = require('../../features/themes/themesManager');

const router = express.Router();

const THEMES_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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

async function renderThemesPage(req, res, guild) {
  const [enabled, config, themes] = await Promise.all([
    themesManager.isEnabled(guild.id),
    themesManager.getConfig(guild.id),
    themesManager.listThemes(guild.id),
  ]);

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => THEMES_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  // The cursor is clamped the same way the poster itself clamps it, so what the banner
  // shows always matches what would actually happen on the next scheduled/forced post.
  const cursor = Math.min(config.next_position, themes.length);
  const exhausted = themes.length > 0 && cursor >= themes.length;
  const remaining = Math.max(0, themes.length - cursor);

  const themeRows = themes.map((t, index) => ({
    id: t.id,
    theme: t.theme,
    source: t.source,
    isNext: index === cursor && !exhausted,
  }));

  res.render('themes', {
    title: 'Themes',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    features: getSidebarFeatures('themes'),
    enabled,
    config: {
      channelId: config.channel_id,
      roleId: config.role_id,
      scheduleMode: config.schedule_mode || 'daily',
      dailyTime: config.daily_time || '',
      intervalHours: config.interval_hours || '',
      sheetUrl: config.sheet_url || '',
    },
    textChannels,
    roles,
    themeRows,
    exhausted,
    remaining,
    totalThemes: themes.length,
  });
}

router.get('/themes', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderThemesPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/themes/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await themesManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Themes attivato.' : 'Themes disattivato.' };
    res.redirect('/themes');
  } catch (err) {
    next(err);
  }
});

// Canale, ruolo e programmazione applicati ciascuno nel proprio try/catch — se uno fallisce
// (es. orario non valido) gli altri due vengono comunque salvati, stesso approccio già
// usato da /qotd config e /warning config.
router.post('/themes/config', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const errors = [];

    const channelId = req.body.channelId || null;
    if (channelId) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        errors.push('Canale non valido.');
      } else {
        try {
          await themesManager.setChannel(guild, channel);
        } catch (err) {
          if (err instanceof themesManager.ValidationError) errors.push(err.message);
          else throw err;
        }
      }
    }

    // Selezione vuota = rimuovi il ping (il ruolo è opzionale).
    const roleId = req.body.roleId || null;
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    if (roleId && !role) {
      errors.push('Ruolo non valido.');
    } else {
      await themesManager.setRole(guild.id, role);
    }

    const scheduleMode = req.body.scheduleMode === 'interval' ? 'interval' : 'daily';
    try {
      await themesManager.setSchedule(guild.id, {
        scheduleMode,
        dailyTime: req.body.dailyTime,
        intervalHours: req.body.intervalHours,
      });
    } catch (err) {
      if (err instanceof themesManager.ValidationError) errors.push(err.message);
      else throw err;
    }

    req.session.flash = errors.length > 0 ? { type: 'error', message: errors.join(' ') } : { type: 'success', message: 'Configurazione aggiornata.' };
    res.redirect('/themes');
  } catch (err) {
    next(err);
  }
});

// Salva il link CSV inviato (anche se identico a quello già salvato — riscriverlo è
// innocuo) e lo sincronizza subito, in un solo passaggio: lo stesso form serve sia per il
// primo collegamento del foglio sia per i "sincronizza di nuovo" successivi.
router.post('/themes/sync', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      const url = await themesManager.setSheetUrl(guild.id, req.body.sheetUrl);
      const result = await themesManager.syncFromSheet(guild.id, url);
      req.session.flash = {
        type: 'success',
        message: `Sincronizzato: ${result.imported} nuovo/i tema/i importato/i${result.skipped > 0 ? `, ${result.skipped} già presente/i ignorato/i` : ''}.`,
      };
    } catch (err) {
      if (err instanceof themesManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/themes');
  } catch (err) {
    next(err);
  }
});

router.post('/themes/items/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await themesManager.addTheme(guild.id, req.body.theme);
      req.session.flash = { type: 'success', message: 'Tema aggiunto.' };
    } catch (err) {
      if (err instanceof themesManager.ValidationError) req.session.flash = { type: 'error', message: err.message };
      else throw err;
    }
    res.redirect('/themes');
  } catch (err) {
    next(err);
  }
});

router.post('/themes/items/:id/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await themesManager.editTheme(guild.id, Number(req.params.id), req.body.theme);
      req.session.flash = { type: 'success', message: 'Tema aggiornato.' };
    } catch (err) {
      if (err instanceof themesManager.ValidationError) req.session.flash = { type: 'error', message: err.message };
      else throw err;
    }
    res.redirect('/themes');
  } catch (err) {
    next(err);
  }
});

router.post('/themes/items/:id/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await themesManager.removeTheme(guild.id, Number(req.params.id));
    req.session.flash = { type: 'success', message: 'Tema rimosso.' };
    res.redirect('/themes');
  } catch (err) {
    next(err);
  }
});

// `order` è una lista di ID separati da virgola, popolata dal trascinamento lato client
// (public/themesReorder.js) prima dell'invio automatico del form.
router.post('/themes/items/reorder', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const orderedIds = (req.body.order || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));

    await themesManager.reorderThemes(guild.id, orderedIds);
    res.redirect('/themes');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

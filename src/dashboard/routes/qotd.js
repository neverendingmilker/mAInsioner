const express = require('express');
const { ChannelType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const qotdManager = require('../../features/qotd/qotdManager');

const router = express.Router();

const QOTD_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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

async function renderQotdPage(req, res, guild) {
  const [enabled, config, questions] = await Promise.all([
    qotdManager.isEnabled(guild.id),
    qotdManager.getConfig(guild.id),
    qotdManager.listQuestions(guild.id),
  ]);

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => QOTD_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  // The cursor is clamped the same way the poster itself clamps it, so what the banner
  // shows always matches what would actually happen on the next scheduled/forced post.
  const cursor = Math.min(config.next_position, questions.length);
  const exhausted = questions.length > 0 && cursor >= questions.length;
  const remaining = Math.max(0, questions.length - cursor);

  const questionRows = questions.map((q, index) => ({
    id: q.id,
    question: q.question,
    source: q.source,
    isNext: index === cursor && !exhausted,
  }));

  res.render('qotd', {
    title: 'Question of the Day',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    features: getSidebarFeatures('qotd'),
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
    questionRows,
    exhausted,
    remaining,
    totalQuestions: questions.length,
  });
}

router.get('/qotd', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderQotdPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/qotd/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await qotdManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Question of the Day attivato.' : 'Question of the Day disattivato.' };
    res.redirect('/qotd');
  } catch (err) {
    next(err);
  }
});

// Canale, ruolo e programmazione applicati ciascuno nel proprio try/catch — se uno fallisce
// (es. orario non valido) gli altri due vengono comunque salvati, stesso approccio già
// usato da /warning config.
router.post('/qotd/config', async (req, res, next) => {
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
          await qotdManager.setChannel(guild, channel);
        } catch (err) {
          if (err instanceof qotdManager.ValidationError) errors.push(err.message);
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
      await qotdManager.setRole(guild.id, role);
    }

    const scheduleMode = req.body.scheduleMode === 'interval' ? 'interval' : 'daily';
    try {
      await qotdManager.setSchedule(guild.id, {
        scheduleMode,
        dailyTime: req.body.dailyTime,
        intervalHours: req.body.intervalHours,
      });
    } catch (err) {
      if (err instanceof qotdManager.ValidationError) errors.push(err.message);
      else throw err;
    }

    req.session.flash = errors.length > 0 ? { type: 'error', message: errors.join(' ') } : { type: 'success', message: 'Configurazione aggiornata.' };
    res.redirect('/qotd');
  } catch (err) {
    next(err);
  }
});

// Salva il link CSV inviato (anche se identico a quello già salvato — riscriverlo è
// innocuo) e lo sincronizza subito, in un solo passaggio: lo stesso form serve sia per il
// primo collegamento del foglio sia per i "sincronizza di nuovo" successivi.
router.post('/qotd/sync', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      const url = await qotdManager.setSheetUrl(guild.id, req.body.sheetUrl);
      const result = await qotdManager.syncFromSheet(guild.id, url);
      req.session.flash = {
        type: 'success',
        message: `Sincronizzato: ${result.imported} nuova/e domanda/e importata/e${result.skipped > 0 ? `, ${result.skipped} già presente/i ignorata/e` : ''}.`,
      };
    } catch (err) {
      if (err instanceof qotdManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/qotd');
  } catch (err) {
    next(err);
  }
});

router.post('/qotd/questions/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await qotdManager.addQuestion(guild.id, req.body.question);
      req.session.flash = { type: 'success', message: 'Domanda aggiunta.' };
    } catch (err) {
      if (err instanceof qotdManager.ValidationError) req.session.flash = { type: 'error', message: err.message };
      else throw err;
    }
    res.redirect('/qotd');
  } catch (err) {
    next(err);
  }
});

router.post('/qotd/questions/:id/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await qotdManager.editQuestion(guild.id, Number(req.params.id), req.body.question);
      req.session.flash = { type: 'success', message: 'Domanda aggiornata.' };
    } catch (err) {
      if (err instanceof qotdManager.ValidationError) req.session.flash = { type: 'error', message: err.message };
      else throw err;
    }
    res.redirect('/qotd');
  } catch (err) {
    next(err);
  }
});

router.post('/qotd/questions/:id/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await qotdManager.removeQuestion(guild.id, Number(req.params.id));
    req.session.flash = { type: 'success', message: 'Domanda rimossa.' };
    res.redirect('/qotd');
  } catch (err) {
    next(err);
  }
});

// `order` è una lista di ID separati da virgola, popolata dal trascinamento lato client
// (public/qotdReorder.js) prima dell'invio automatico del form.
router.post('/qotd/questions/reorder', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const orderedIds = (req.body.order || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));

    await qotdManager.reorderQuestions(guild.id, orderedIds);
    res.redirect('/qotd');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

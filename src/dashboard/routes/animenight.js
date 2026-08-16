const express = require('express');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');
const animeNightManager = require('../../features/animenight/animeNightManager');

const router = express.Router();

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

// Sessions are keyed/stored as ISO "YYYY-MM-DD" (see animeNightRepository), which is
// also exactly what an <input type="date"> reads and writes — no conversion needed for
// display or for identifying a session. animeNightManager.parseWatchedDate (used by
// addAnime/editSession) only accepts "DD/MM[/YYYY]" though, so a date coming FROM a
// form submission needs converting before being handed to the manager.
function isoToDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

router.get('/animenight', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const [enabled, sessions] = await Promise.all([
      animeNightManager.isEnabled(guild.id),
      animeNightManager.getSessionsList(guild.id),
    ]);

    res.render('animenight', {
      title: 'Anime Night',
      guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
      features: getSidebarFeatures('animenight'),
      enabled,
      sessions: [...sessions].reverse(), // most recent session first
    });
  } catch (err) {
    next(err);
  }
});

router.post('/animenight/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await animeNightManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Anime Night attivato.' : 'Anime Night disattivato.' };
    res.redirect('/animenight');
  } catch (err) {
    next(err);
  }
});

router.post('/animenight/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const titlesRaw = req.body.titles?.trim();
    if (!titlesRaw) {
      req.session.flash = { type: 'error', message: 'Inserisci almeno un titolo.' };
      res.redirect('/animenight');
      return;
    }
    // Empty date -> "today", same default as /animenight add on Discord.
    const dateInput = req.body.date ? isoToDMY(req.body.date) : '';

    try {
      const result = await animeNightManager.addAnime(guild.id, titlesRaw, dateInput, req.session.user.id);
      req.session.flash = { type: 'success', message: `Aggiunti ${result.titles.length} anime alla sessione del ${isoToDMY(result.watchedDate)}.` };
    } catch (err) {
      if (err instanceof animeNightManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/animenight');
  } catch (err) {
    next(err);
  }
});

// Always sends both the new title list and the new date (pre-filled with the current
// values), so this is effectively a full replace — same UX as Birthday's/Honeypot's
// "Modifica" forms, even though editSession itself supports a partial update too.
router.post('/animenight/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const sessionDate = req.body.sessionDate;
    const titlesRaw = req.body.titles?.trim();
    if (!sessionDate || !titlesRaw) {
      req.session.flash = { type: 'error', message: 'Dati mancanti — riprova.' };
      res.redirect('/animenight');
      return;
    }
    const newDateInput = req.body.date ? isoToDMY(req.body.date) : null;

    try {
      await animeNightManager.editSession(guild.id, sessionDate, titlesRaw, newDateInput, req.session.user.id);
      req.session.flash = { type: 'success', message: 'Sessione aggiornata.' };
    } catch (err) {
      if (err instanceof animeNightManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/animenight');
  } catch (err) {
    next(err);
  }
});

router.post('/animenight/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await animeNightManager.removeSession(guild.id, req.body.sessionDate);
      req.session.flash = { type: 'success', message: 'Sessione rimossa.' };
    } catch (err) {
      if (err instanceof animeNightManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/animenight');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

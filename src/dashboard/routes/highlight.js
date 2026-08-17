const express = require('express');
const { requireGuild } = require('../guild');
const highlightManager = require('../../features/highlight/highlightManager');

const router = express.Router();

// Highlight is per-user by design (each member manages their own word list, ignore
// lists and channel mode directly on Discord via `/highlight` — see the manager) — the
// dashboard deliberately does NOT expose any of that, only the guild-wide on/off
// switch that already lives in `/disablefeature`. There's nothing else server-wide to
// configure for this feature, so this page is just the toggle plus an explanatory
// panel — no card-list of items, no per-item edit/remove like every other feature page.
async function renderHighlightPage(req, res, guild) {
  const enabled = await highlightManager.isEnabled(guild.id);

  res.render('highlight', {
    title: 'Highlight',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    maxWordsPerUser: highlightManager.MAX_WORDS_PER_USER,
  });
}

router.get('/highlight', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderHighlightPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/highlight/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await highlightManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Highlight attivato.' : 'Highlight disattivato.' };
    res.redirect('/highlight');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

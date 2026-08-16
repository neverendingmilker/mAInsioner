const express = require('express');
const { PermissionFlagsBits } = require('discord.js');
const { buildAuthorizeUrl, getRedirectUri, exchangeCode, fetchDiscordUser } = require('../discordOAuth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Accedi' });
});

router.get('/auth/discord', (req, res) => {
  res.redirect(buildAuthorizeUrl(req));
});

router.get('/auth/discord/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    res.render('login', { title: 'Accedi', error: 'Accesso annullato.' });
    return;
  }

  try {
    const token = await exchangeCode(code, getRedirectUri(req));
    const discordUser = await fetchDiscordUser(token.access_token);

    // No "guilds" OAuth scope is requested (see discordOAuth.js) — instead, admin
    // status is computed directly against every server the BOT is currently in, using
    // the bot's own token, same as the single-guild version of this check used to do.
    // Cached in the session so it isn't re-checked on every request (cost: a permission
    // change elsewhere only takes effect after the next login, not immediately).
    const guilds = [...req.client.guilds.cache.values()];
    const memberships = await Promise.all(guilds.map((g) => g.members.fetch(discordUser.id).catch(() => null)));
    const adminGuilds = guilds
      .filter((g, i) => memberships[i]?.permissions.has(PermissionFlagsBits.Administrator))
      .map((g) => ({ id: g.id, name: g.name, iconURL: g.iconURL({ size: 64 }) }));

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatarURL: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`
        : null,
    };
    req.session.adminGuilds = adminGuilds;

    if (adminGuilds.length === 0) {
      res.status(403).render('403', { title: 'Accesso negato' });
      return;
    }

    if (adminGuilds.length === 1) {
      // Only one option — pick it automatically instead of making them click it, same
      // one-click experience as the original single-server dashboard had.
      req.session.guildId = adminGuilds[0].id;
      const returnTo = req.session.returnTo;
      delete req.session.returnTo;
      res.redirect(returnTo || '/');
      return;
    }

    // More than one — `returnTo` (if any) is left in the session; /select-server
    // consumes it once a choice is made, so a direct-link login still lands where it
    // was headed instead of always dropping onto the overview page.
    res.redirect('/select-server');
  } catch (err) {
    console.error('[dashboard] OAuth callback failed:', err.message);
    res.render('login', { title: 'Accedi', error: 'Errore durante il login — riprova.' });
  }
});

router.get('/select-server', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const adminGuilds = req.session.adminGuilds || [];
  if (adminGuilds.length === 0) {
    res.status(403).render('403', { title: 'Accesso negato' });
    return;
  }
  res.render('selectServer', { title: 'Scegli server', guilds: adminGuilds });
});

router.post('/select-server', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const adminGuilds = req.session.adminGuilds || [];
  const chosen = adminGuilds.find((g) => g.id === req.body.guildId);
  if (!chosen) {
    res.status(403).render('403', { title: 'Accesso negato' });
    return;
  }
  req.session.guildId = chosen.id;
  const returnTo = req.session.returnTo;
  delete req.session.returnTo;
  res.redirect(returnTo || '/');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

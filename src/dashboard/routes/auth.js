const express = require('express');
const { PermissionFlagsBits } = require('discord.js');
const { buildAuthorizeUrl, getRedirectUri, exchangeCode, fetchDiscordUser } = require('../discordOAuth');
const { resolveDashboardGuild } = require('../guild');

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

    const guild = resolveDashboardGuild(req.client);
    let isAdmin = false;
    if (guild) {
      const member = await guild.members.fetch(discordUser.id).catch(() => null);
      isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
    }

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatarURL: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`
        : null,
      isAdmin,
    };

    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    res.redirect(isAdmin && returnTo ? returnTo : '/');
  } catch (err) {
    console.error('[dashboard] OAuth callback failed:', err.message);
    res.render('login', { title: 'Accedi', error: 'Errore durante il login — riprova.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

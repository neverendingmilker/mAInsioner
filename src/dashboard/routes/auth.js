const express = require('express');
const { PermissionFlagsBits } = require('discord.js');
const { buildAuthorizeUrl, getRedirectUri, exchangeCode, fetchDiscordUser } = require('../discordOAuth');
const { isMod } = require('../../utils/modRole');

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

    // No "guilds" OAuth scope is requested (see discordOAuth.js) — instead, access is
    // computed directly against every server the BOT is currently in, using the bot's own
    // token, same as the original Admin-only check used to do. Cached in the session so
    // it isn't re-checked on every request (cost: a permission/role change elsewhere only
    // takes effect after the next login, not immediately).
    // Two ways in: Administrator (role 'admin', always full access) or this server's
    // configured Mod role (role 'mod' — see src/utils/modRole.js's isMod, which already
    // treats Administrator as a superset so an Admin is never double-counted as Mod).
    // WHICH dashboard pages a 'mod' session can actually reach is enforced later, per
    // request, by requireDashboardAccess — this only decides who gets in the door at all.
    const guilds = [...req.client.guilds.cache.values()];
    const memberships = await Promise.all(guilds.map((g) => g.members.fetch(discordUser.id).catch(() => null)));
    const guildAccess = [];
    for (let i = 0; i < guilds.length; i++) {
      const member = memberships[i];
      if (!member) continue;
      const admin = member.permissions.has(PermissionFlagsBits.Administrator);
      // eslint-disable-next-line no-await-in-loop
      const mod = !admin && (await isMod(member));
      if (admin || mod) {
        guildAccess.push({ id: guilds[i].id, name: guilds[i].name, iconURL: guilds[i].iconURL({ size: 64 }), role: admin ? 'admin' : 'mod' });
      }
    }

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatarURL: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`
        : null,
    };
    req.session.guildAccess = guildAccess;

    if (guildAccess.length === 0) {
      res.status(403).render('403', { title: 'Accesso negato' });
      return;
    }

    if (guildAccess.length === 1) {
      // Only one option — pick it automatically instead of making them click it, same
      // one-click experience as the original single-server dashboard had.
      req.session.guildId = guildAccess[0].id;
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
  const guildAccess = req.session.guildAccess || [];
  if (guildAccess.length === 0) {
    res.status(403).render('403', { title: 'Accesso negato' });
    return;
  }
  res.render('selectServer', { title: 'Scegli server', guilds: guildAccess });
});

router.post('/select-server', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const guildAccess = req.session.guildAccess || [];
  const chosen = guildAccess.find((g) => g.id === req.body.guildId);
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

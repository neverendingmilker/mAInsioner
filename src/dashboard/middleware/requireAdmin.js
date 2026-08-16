// Gates every dashboard page behind: Discord login, being an Administrator in at least
// one server the bot is in (both checked once at login, cached in the session — see
// routes/auth.js), and having picked WHICH of those servers to manage (also session-
// backed, set by the /select-server picker). Someone logged in with Discord but not an
// admin anywhere sees a 403; an admin who hasn't picked a server yet (or whose picked
// server they've since lost admin on) gets sent to pick one, not a redirect loop to login.
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  const adminGuilds = req.session.adminGuilds || [];
  if (adminGuilds.length === 0) {
    return res.status(403).render('403', { title: 'Accesso negato' });
  }

  if (!req.session.guildId || !adminGuilds.some((g) => g.id === req.session.guildId)) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/select-server');
  }

  next();
}

module.exports = { requireAdmin };

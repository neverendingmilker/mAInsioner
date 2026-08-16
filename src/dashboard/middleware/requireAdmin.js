// Gates every dashboard page behind Discord login + Administrator permission in the
// target guild (checked once, at login — see routes/auth.js). Someone who's logged in
// with Discord but isn't an admin sees a 403, not a redirect loop back to login.
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  if (!req.session.user.isAdmin) {
    return res.status(403).render('403', { title: 'Accesso negato' });
  }
  next();
}

module.exports = { requireAdmin };

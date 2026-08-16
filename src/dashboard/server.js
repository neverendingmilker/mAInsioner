const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('../config/config');
const { SqlSessionStore } = require('./sessionStore');
const { requireAdmin } = require('./middleware/requireAdmin');
const authRoutes = require('./routes/auth');
const overviewRoutes = require('./routes/overview');
const honeypotRoutes = require('./routes/honeypot');
const birthdayRoutes = require('./routes/birthday');
const slowmodeRoutes = require('./routes/slowmode');
const reactionlimitRoutes = require('./routes/reactionlimit');
const rolelinkRoutes = require('./routes/rolelink');
const stickyRoutes = require('./routes/sticky');
const incidentRoutes = require('./routes/incident');
const comborolesRoutes = require('./routes/comboroles');

// Web dashboard for the bot: Discord OAuth2 login, gated to whoever has Administrator in
// at least one server the bot is in — which one they're managing is then picked via
// /select-server and stored per-session (see guild.js + middleware/requireAdmin.js).
// Runs in the same process/port as the bot itself — this *is* what satisfies Render's
// "Web Service needs an open HTTP port" requirement now (previously a bare status page,
// see git history).
function start(client) {
  if (!config.dashboard.clientSecret || !config.dashboard.sessionSecret) {
    console.error('❌ DISCORD_CLIENT_SECRET and SESSION_SECRET must be set to run the dashboard.');
    process.exit(1);
  }

  const app = express();

  // Render terminates TLS and proxies plain HTTP to the app — without this, req.protocol
  // is always "http" and secure cookies / the OAuth2 redirect_uri would be built wrong.
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.static(path.join(__dirname, 'public')));

  // Unauthenticated, deliberately before the session/auth stack — this is what Render's
  // health check (and an external keep-alive ping, e.g. cron-job.org) should target instead
  // of "/", which now requires a login.
  app.get('/healthz', (req, res) => {
    res.status(200).send(client.isReady() ? `OK - Bot online as ${client.user.tag}` : 'OK - Bot starting...');
  });

  app.use(
    session({
      secret: config.dashboard.sessionSecret,
      store: new SqlSessionStore(),
      resave: false,
      saveUninitialized: false,
      // Every request that touches a session pushes its expiry back out (via the store's
      // touch()), so staying active in the dashboard keeps you logged in indefinitely —
      // the 30 days only start counting down once you actually stop using it.
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 30 * 24 * 60 * 60 * 1000 },
    })
  );

  // Needed to read <form> POST bodies (feature pages submit plain HTML forms, no JS
  // fetch/JSON) — extended:false keeps it to the built-in querystring parser, plenty for
  // the flat key/value forms every page uses so far.
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    req.client = client;
    res.locals.user = req.session.user || null;
    // Every server this user is an admin in (computed once at login) — the sidebar uses
    // this to decide whether to show a "cambia server" link at all.
    res.locals.adminGuilds = req.session.adminGuilds || [];
    // One-shot success/error banner for the page a POST redirects back to (e.g. "Trappola
    // creata."). Cheap alternative to a flash-message library: stash it on the session
    // right before redirecting, read-and-clear it here on the very next request.
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
  });

  app.use(authRoutes);
  app.use(
    requireAdmin,
    overviewRoutes,
    honeypotRoutes,
    birthdayRoutes,
    slowmodeRoutes,
    reactionlimitRoutes,
    rolelinkRoutes,
    stickyRoutes,
    incidentRoutes,
    comborolesRoutes
  );

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Pagina non trovata', message: 'Questa pagina non esiste.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[dashboard] Unhandled error:', err);
    res.status(500).render('error', { title: 'Errore', message: 'Qualcosa è andato storto.' });
  });

  app.listen(config.port, () => {
    console.log(`[dashboard] Listening on port ${config.port}`);
  });
}

module.exports = { start };

const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('../config/config');
const { requireAdmin } = require('./middleware/requireAdmin');
const authRoutes = require('./routes/auth');
const overviewRoutes = require('./routes/overview');

// Web dashboard for the bot: Discord OAuth2 login, gated to whoever has Administrator in
// the configured guild (see guild.js + middleware/requireAdmin.js). Runs in the same
// process/port as the bot itself — this *is* what satisfies Render's "Web Service needs an
// open HTTP port" requirement now (previously a bare status page, see git history).
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
      resave: false,
      saveUninitialized: false,
      // MemoryStore (the default) is fine here: single process, one small admin team,
      // no need for a shared/persistent session store for a v1 dashboard.
      cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  app.use((req, res, next) => {
    req.client = client;
    res.locals.user = req.session.user || null;
    next();
  });

  app.use(authRoutes);
  app.use(requireAdmin, overviewRoutes);

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

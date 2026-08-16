require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  timezone: process.env.TZ || 'Europe/Rome',
  port: process.env.PORT || 3000,

  turso: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },

  dashboard: {
    // OAuth2 client secret from the Discord Developer Portal (Bot & OAuth2 share the
    // same client, so clientId above is reused as the OAuth2 client_id).
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    // Signs the dashboard's session cookie — any long random string, generated once.
    sessionSecret: process.env.SESSION_SECRET,
  },
};

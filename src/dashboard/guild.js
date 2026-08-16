// Which guild a dashboard request is about. The bot can now run on more than one
// server, so this is no longer inferred automatically — it's whatever the logged-in
// admin picked via the server selector (/select-server) after login, stored in their
// session as `guildId` (see routes/auth.js and middleware/requireAdmin.js, which
// guarantees this is only ever set to a guild they're actually an admin in).
// Returns null if no guild is selected, or the bot is no longer in that guild (e.g. it
// was removed from the server mid-session).
function resolveDashboardGuild(client, guildId) {
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) ?? null;
}

module.exports = { resolveDashboardGuild };

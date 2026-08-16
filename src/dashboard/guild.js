const config = require('../config/config');

// Which guild the dashboard shows/manages. This bot is built around a single primary
// server (Mod/Admin roles are hardcoded per-server elsewhere), but it may also be joined
// to a second, empty test server (see Server Backup) — so "the guild the bot happens to
// be in" isn't reliable once there's more than one. GUILD_ID picks it explicitly; with
// only one guild joined there's nothing to disambiguate, so it's used automatically.
function resolveDashboardGuild(client) {
  if (config.guildId) return client.guilds.cache.get(config.guildId) ?? null;
  if (client.guilds.cache.size === 1) return client.guilds.cache.first();
  return null;
}

module.exports = { resolveDashboardGuild };

const { REST, Routes } = require('discord.js');
const config = require('./config/config');
const { loadCommands } = require('./utils/loadCommands');

async function deploy() {
  const commands = loadCommands();
  const body = commands.map((c) => c.data.toJSON());

  const rest = new REST().setToken(config.token);

  // Always global now that the bot can run on more than one server — a guild-scoped
  // registration only ever covers the one guild it's pointed at, so any other server
  // that adds the bot wouldn't see the commands at all. Global takes up to ~1h to
  // propagate to Discord clients after a change (guild-scoped is instant); that
  // trade-off is accepted since it only matters right after a command is added/edited.
  console.log(`Registering ${body.length} command(s) globally (can take up to 1h to propagate)...`);
  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log('✅ Commands registered successfully.');

  // One-time cleanup: earlier versions of this bot registered guild-scoped commands
  // instead, gated on a GUILD_ID env var (from the dashboard's old single-guild setup).
  // If that variable is still set on this deploy, proactively wipe that guild's
  // guild-scoped set so it doesn't linger as duplicates alongside the global ones —
  // best-effort, never blocks startup if it fails.
  if (process.env.GUILD_ID) {
    try {
      await rest.put(Routes.applicationGuildCommands(config.clientId, process.env.GUILD_ID), { body: [] });
      console.log('✅ Cleared stale guild-scoped commands (leftover GUILD_ID env var — safe to remove it from Render now).');
    } catch (err) {
      console.error('⚠️ Could not clear stale guild-scoped commands:', err.message);
    }
  }
}

deploy().catch((err) => {
  console.error('❌ Error registering commands:', err);
  process.exit(1);
});

const { REST, Routes } = require('discord.js');
const config = require('./config/config');
const { loadCommands } = require('./utils/loadCommands');

async function deploy() {
  const commands = loadCommands();
  const body = commands.map((c) => c.data.toJSON());

  const rest = new REST().setToken(config.token);

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  console.log(
    config.guildId
      ? `Registering ${body.length} command(s) on guild ${config.guildId} (instant)...`
      : `Registering ${body.length} command(s) globally (can take up to 1h to propagate)...`
  );

  await rest.put(route, { body });

  console.log('✅ Commands registered successfully.');

  // Guild-scoped and global commands are entirely separate sets — Discord doesn't clean
  // up one when the other gets used, so every command would show up twice (this actually
  // happened: GUILD_ID got set for the dashboard's guild-resolution env var, which flipped
  // this script from global to guild-scoped registration on the next boot, leaving the old
  // global copies stranded). Whenever GUILD_ID is set, proactively wipe the global set on
  // every deploy so stale duplicates can never accumulate again.
  if (config.guildId) {
    try {
      await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      console.log('✅ Cleared any stale globally-registered commands.');
    } catch (err) {
      console.error('⚠️ Could not clear stale global commands:', err.message);
    }
  }
}

deploy().catch((err) => {
  console.error('❌ Error registering commands:', err);
  process.exit(1);
});

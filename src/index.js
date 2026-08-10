const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config/config');
const { loadCommands } = require('./utils/loadCommands');
const { loadEvents } = require('./utils/loadEvents');
const health = require('./health');

if (!config.token || !config.clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID must be set in the .env file');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // needed to assign/remove roles and fetch members
    GatewayIntentBits.GuildMessages, // needed for the sticky-message feature to detect new activity
    GatewayIntentBits.GuildMessageReactions, // needed for the suggestion feature's react-to-decide buttons
    GatewayIntentBits.MessageContent, // needed for GoosePizza to read message text and match its trigger word
  ],
  // Needed so reactionAdd still fires for messages/reactions the bot hasn't
  // got in its own cache (e.g. a suggestion posted days ago, before a
  // restart) — without partials Discord silently drops those events.
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

client.commands = loadCommands();
loadEvents(client);

client.login(config.token);

// No dashboard: just a small status page, to satisfy Render's requirement
// (hosting configured as a "Web Service") of having an open HTTP port.
health.start(client);

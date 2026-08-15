const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const { handleLog } = require('./handlers/log');
const honeypotManager = require('../../features/honeypot/honeypotManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(honeypotManager, PermissionFlagsBits.Administrator, 'Honeypot');

const HONEYPOT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const data = new SlashCommandBuilder()
  .setName('honeypot')
  .setDescription('[Admin] Sets a channel as a trap: any non-mod who interacts with it gets kicked')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Turns a channel into a honeypot and posts the trap message there')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel to trap').addChannelTypes(...HONEYPOT_CHANNEL_TYPES).setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('message').setDescription("The bait message's text (optional, has a default)").setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('button_label').setDescription('Label on the trap button (optional, default: "Click here")').setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('emoji').setDescription('Emoji the bot reacts to its own bait message with (optional, extra bait)').setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) => sub.setName('list').setDescription('Lists every channel currently set up as a honeypot'))
  .addSubcommand((sub) => sub.setName('log').setDescription('Shows how many people honeypot has kicked, and the most recent ones'))
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Removes the trap from a channel (also deletes the trap message, if still there)')
      .addStringOption((opt) =>
        opt.setName('channel').setDescription('Which honeypot to remove (start typing to see active ones)').setRequired(true).setAutocomplete(true)
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    case 'log':
      return handleLog(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "channel" option's autocomplete on /honeypot remove: only shows channels
// currently set up as a honeypot, instead of every channel in the server.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'channel') {
    await interaction.respond([]);
    return;
  }

  const channels = await honeypotManager.listChannels(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = channels
    .map((c) => {
      const channel = interaction.guild.channels.cache.get(c.channelId);
      return { name: channel ? `#${channel.name}` : c.channelId, value: c.channelId };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

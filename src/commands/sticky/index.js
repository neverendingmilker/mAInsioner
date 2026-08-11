const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const stickyManager = require('../../features/sticky/stickyManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(stickyManager, PermissionFlagsBits.Administrator, 'Sticky Messages');

const STICKY_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Sticky message management')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set up (or replace) the sticky message for a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to add the sticky message to')
          .addChannelTypes(...STICKY_CHANNEL_TYPES)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('The message content to stick')
          .setMaxLength(4000)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Remove the sticky message from a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to remove the sticky message from')
          .addChannelTypes(...STICKY_CHANNEL_TYPES)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Show all sticky messages configured in this server'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!stickyManager.isEnabled(interaction.guildId)) {
    await interaction.reply({
      content: '⚠️ The sticky message feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

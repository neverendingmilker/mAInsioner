const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const postLimitManager = require('../../features/postlimit/postLimitManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(postLimitManager, PermissionFlagsBits.Administrator, 'Post Limit');

const data = new SlashCommandBuilder()
  .setName('postlimit')
  .setDescription('Limits how often each person can post in a channel (beyond Discord\'s 6h slowmode cap)')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set (or replace) the post limit for a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('The channel to limit')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('How often each person may post: a number + s/m/h/d — e.g. 12h, 1d, 3d (min 1m)')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes the post limit from a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('The channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Admin] Lists every channel with a post limit configured'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await postLimitManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The post limit feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
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

const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const reactionLimitManager = require('../../features/reactionlimit/reactionLimitManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(reactionLimitManager, PermissionFlagsBits.Administrator, 'Reaction Limit');

const REACTIONLIMIT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement];

const data = new SlashCommandBuilder()
  .setName('reactionlimit')
  .setDescription(`Limits each person to ${reactionLimitManager.REACTION_LIMIT} reactions per thread in a channel's threads`)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set (or replace) the reaction limit for a channel\'s threads')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription("The channel whose threads should be limited")
          .addChannelTypes(...REACTIONLIMIT_CHANNEL_TYPES)
          .setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('ignore_first_post')
          .setDescription("Don't count reactions on each thread's starter message (default: off, counts everything)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes the reaction limit from a channel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel').addChannelTypes(...REACTIONLIMIT_CHANNEL_TYPES).setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Admin] Lists every channel with a reaction limit configured'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await reactionLimitManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Reaction Limit feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
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

const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleEdit } = require('./handlers/edit');
const { handleRemove } = require('./handlers/remove');
const { handleApprove, handleReject } = require('./handlers/decide');
const { handleChannel } = require('./handlers/channel');
const { handleList } = require('./handlers/list');
const suggestionManager = require('../../features/suggestion/suggestionManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(suggestionManager, PermissionFlagsBits.Administrator, 'Suggestions');

const data = new SlashCommandBuilder()
  .setName('suggestion')
  .setDescription('Suggestion management')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Submit a new suggestion')
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Your suggestion').setMaxLength(1000).setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('approve')
      .setDescription('[Admin] Approve a suggestion')
      .addIntegerOption((opt) =>
        opt.setName('number').setDescription('Suggestion number (e.g. 12)').setMinValue(1).setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('[Admin] Set (or, omitting the channel, remove) where suggestions get posted')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel for suggestions (omit to remove the current one)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Edit one of your own pending suggestions')
      .addIntegerOption((opt) =>
        opt.setName('number').setDescription('Suggestion number (e.g. 12)').setMinValue(1).setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('text').setDescription('New text for the suggestion').setMaxLength(1000).setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Show all suggestions still waiting for a decision')
  )
  .addSubcommand((sub) =>
    sub
      .setName('reject')
      .setDescription('[Admin] Reject a suggestion')
      .addIntegerOption((opt) =>
        opt.setName('number').setDescription('Suggestion number (e.g. 12)').setMinValue(1).setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove your own pending suggestion, or (mods) any suggestion by number')
      .addIntegerOption((opt) =>
        opt
          .setName('number')
          .setDescription("Suggestion number — required if you have more than one pending, or for a mod's removal")
          .setMinValue(1)
          .setRequired(false)
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await suggestionManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The suggestion feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    case 'approve':
      return handleApprove(interaction);
    case 'reject':
      return handleReject(interaction);
    case 'channel':
      return handleChannel(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

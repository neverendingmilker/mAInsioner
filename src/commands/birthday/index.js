const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleEdit } = require('./handlers/edit');
const { handleRemove } = require('./handlers/remove');
const { handleConfig } = require('./handlers/config');
const { handleList } = require('./handlers/list');
const birthdayManager = require('../../features/birthday/birthdayManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(birthdayManager, PermissionFlagsBits.Administrator, 'Birthday');

const data = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Birthday management')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add (or update) your birthday')
      .addIntegerOption((opt) =>
        opt.setName('day').setDescription('Day (1-31)').setMinValue(1).setMaxValue(31).setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName('month').setDescription('Month (1-12)').setMinValue(1).setMaxValue(12).setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName('year').setDescription('Year of birth (optional)').setRequired(false)
      )
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('[Admin only] Set the birthday for someone else instead of yourself')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription("Edit your saved birthday (or, for mods, anyone's)")
      .addIntegerOption((opt) =>
        opt.setName('day').setDescription('Day (1-31)').setMinValue(1).setMaxValue(31).setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName('month').setDescription('Month (1-12)').setMinValue(1).setMaxValue(12).setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName('year').setDescription('Year of birth (optional)').setRequired(false)
      )
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('[Mod only] Edit the birthday for someone else instead of yourself')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove your birthday (or, for admins, someone else\'s)')
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('[Admin only] Remove someone else\'s birthday instead of your own')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('config')
      .setDescription('[Admin] Configure the birthday role, removal timer and/or greeting channel')
      .addRoleOption((opt) =>
        opt.setName('role').setDescription("Role to assign on someone's birthday").setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('removeafter')
          .setDescription('How long before removing the role, e.g. 30s, 10m, 24h, 3d (min 10s, max 30d)')
          .setRequired(false)
      )
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel for birthday greetings')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Show all birthdays in this server, grouped by month')
  )
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await birthdayManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The birthday feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
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
    case 'config':
      return handleConfig(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

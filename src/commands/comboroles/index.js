const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleRun } = require('./handlers/run');
const comboRolesManager = require('../../features/comboroles/comboRolesManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(comboRolesManager, PermissionFlagsBits.ManageGuild, 'Combined Role Search');

const data = new SlashCommandBuilder()
  .setName('comboroles')
  .setDescription('Shows the users who have all the given roles (optionally excluding others with BUT)')
  .addSubcommand((sub) =>
    sub
      .setName('search')
      .setDescription('Shows the users who have all the given roles (optionally excluding others with BUT)')
      .addRoleOption((opt) => opt.setName('role1').setDescription('First required role').setRequired(true))
      .addRoleOption((opt) => opt.setName('role2').setDescription('Second role (optional)').setRequired(false))
      .addRoleOption((opt) => opt.setName('role3').setDescription('Third required role (optional)').setRequired(false))
      .addRoleOption((opt) => opt.setName('role4').setDescription('Fourth required role (optional)').setRequired(false))
      .addRoleOption((opt) => opt.setName('role5').setDescription('Fifth required role (optional)').setRequired(false))
      .addRoleOption((opt) =>
        opt.setName('but1').setDescription('BUT: exclude anyone who also has this role (optional)').setRequired(false)
      )
      .addRoleOption((opt) =>
        opt.setName('but2').setDescription('BUT: exclude anyone who also has this role (optional)').setRequired(false)
      )
      .addRoleOption((opt) =>
        opt.setName('but3').setDescription('BUT: exclude anyone who also has this role (optional)').setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await comboRolesManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The combined role search feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  return handleRun(interaction);
}

module.exports = { data, execute };

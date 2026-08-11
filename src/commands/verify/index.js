const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleConfig } = require('./handlers/config');
const { handleVerifyType } = require('./handlers/verifyAction');
const { handleEdit } = require('./handlers/edit');
const verifyManager = require('../../features/verify/verifyManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(verifyManager, PermissionFlagsBits.Administrator, 'Verification');

const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('User verification management')
  .addSubcommand((sub) =>
    sub
      .setName('config')
      .setDescription('[Admin] Configure the give roles, shared remove role and report channel for sub, domme and maledom')
      .addRoleOption((opt) => opt.setName('verified_sub').setDescription('Role to give for /verify sub').setRequired(false))
      .addRoleOption((opt) =>
        opt.setName('verified_domme').setDescription('Role to give for /verify domme').setRequired(false)
      )
      .addRoleOption((opt) =>
        opt.setName('verified_maledom').setDescription('Role to give for /verify maledom').setRequired(false)
      )
      .addRoleOption((opt) =>
        opt
          .setName('remove')
          .setDescription('Role to remove (if present) when verifying as sub, domme or maledom')
          .setRequired(false)
      )
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel where verification reports are posted')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addRoleOption((opt) =>
        opt
          .setName('allowedrole')
          .setDescription('Role (besides Manage Roles holders) allowed to use /verify sub, domme and maledom')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('sub')
      .setDescription('[Admin] Verify a user as Sub')
      .addUserOption((opt) => opt.setName('user').setDescription('User to verify').setRequired(true))
      .addStringOption((opt) =>
        opt.setName('verification').setDescription('How the verification was done').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('domme')
      .setDescription('[Admin] Verify a user as Domme')
      .addUserOption((opt) => opt.setName('user').setDescription('User to verify').setRequired(true))
      .addStringOption((opt) =>
        opt.setName('verification').setDescription('How the verification was done').setRequired(true)
      )
      .addStringOption((opt) => opt.setName('social').setDescription('Social media / handle').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('maledom')
      .setDescription('[Admin] Verify a user as Maledom')
      .addUserOption((opt) => opt.setName('user').setDescription('User to verify').setRequired(true))
      .addStringOption((opt) =>
        opt.setName('verification').setDescription('How the verification was done').setRequired(true)
      )
      .addStringOption((opt) => opt.setName('social').setDescription('Social media / handle').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Edit the Verification/Social fields of a user\'s last verification report')
      .addUserOption((opt) => opt.setName('user').setDescription('User whose report to edit').setRequired(true))
  )
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await verifyManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The verification feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'config':
      return handleConfig(interaction);
    case 'sub':
      return handleVerifyType(interaction, 'sub');
    case 'domme':
      return handleVerifyType(interaction, 'domme');
    case 'maledom':
      return handleVerifyType(interaction, 'maledom');
    case 'edit':
      return handleEdit(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

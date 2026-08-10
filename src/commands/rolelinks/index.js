const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleLink } = require('./handlers/link');
const { handleUnlink } = require('./handlers/unlink');
const { handleList } = require('./handlers/list');
const roleLinkManager = require('../../features/rolelinks/roleLinkManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(roleLinkManager, PermissionFlagsBits.ManageRoles, 'Role Links');

const data = new SlashCommandBuilder()
  .setName('rolelink')
  .setDescription('Links two roles: losing role1 automatically removes role2 (optionally the other way too)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName('link')
      .setDescription('Link role1 -> role2: losing role1 removes role2')
      .addRoleOption((opt) => opt.setName('role1').setDescription('The role that triggers the removal when lost').setRequired(true))
      .addRoleOption((opt) => opt.setName('role2').setDescription('The role to remove').setRequired(true))
      .addBooleanOption((opt) =>
        opt
          .setName('viceversa')
          .setDescription('Also remove role1 when role2 is lost (default: false)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('unlink')
      .setDescription('Removes a role1 -> role2 link')
      .addRoleOption((opt) => opt.setName('role1').setDescription('role1 as it was set in /rolelink link').setRequired(true))
      .addRoleOption((opt) => opt.setName('role2').setDescription('role2 as it was set in /rolelink link').setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Lists all configured role links in this server'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  switch (interaction.options.getSubcommand()) {
    case 'link':
      return handleLink(interaction);
    case 'unlink':
      return handleUnlink(interaction);
    case 'list':
      return handleList(interaction);
    case 'disable':
      return handleDisable(interaction);
    default:
      return undefined;
  }
}

module.exports = { data, execute };

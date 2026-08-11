const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleEdit } = require('./handlers/edit');
const { handleList } = require('./handlers/list');
const roleLinkManager = require('../../features/rolelinks/roleLinkManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(roleLinkManager, PermissionFlagsBits.Administrator, 'Role Links');

const data = new SlashCommandBuilder()
  .setName('rolelink')
  .setDescription('Links roles: losing role1 automatically removes role2 (optionally the other way too)')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Link role1 -> one or more roles (picked next): losing role1 removes them')
      .addRoleOption((opt) => opt.setName('role1').setDescription('The role that triggers the removal when lost').setRequired(true))
      .addBooleanOption((opt) =>
        opt
          .setName('viceversa')
          .setDescription('Also remove role1 when a target role is lost (default: false)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes a role1 -> role2 link')
      .addRoleOption((opt) => opt.setName('role1').setDescription('role1 as it was set in /rolelink add').setRequired(true))
      .addRoleOption((opt) => opt.setName('role2').setDescription('role2 as it was set in /rolelink add').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Change an existing link (which roles, and/or viceversa)')
      .addRoleOption((opt) => opt.setName('role1').setDescription('Current role1 of the link to edit').setRequired(true))
      .addRoleOption((opt) => opt.setName('role2').setDescription('Current role2 of the link to edit').setRequired(true))
      .addRoleOption((opt) => opt.setName('new_role1').setDescription('New role1 (optional)').setRequired(false))
      .addRoleOption((opt) => opt.setName('new_role2').setDescription('New role2 (optional)').setRequired(false))
      .addBooleanOption((opt) => opt.setName('viceversa').setDescription('New viceversa setting (optional)').setRequired(false))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Mod] Lists all configured role links in this server'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  switch (interaction.options.getSubcommand()) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'list':
      return handleList(interaction);
    case 'disable':
      return handleDisable(interaction);
    default:
      return undefined;
  }
}

module.exports = { data, execute };

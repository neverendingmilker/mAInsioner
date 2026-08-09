const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleLink } = require('./handlers/link');
const { handleUnlink } = require('./handlers/unlink');
const { handleList } = require('./handlers/list');
const { handleExemptAdd, handleExemptRemove, handleExemptList } = require('./handlers/exempt');

const data = new SlashCommandBuilder()
  .setName('boosterlink')
  .setDescription('Tracks custom perk roles given to server boosters, so they auto-remove when the boost ends')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName('link')
      .setDescription('Associate a custom role with a booster, so it gets auto-removed if they stop boosting')
      .addUserOption((opt) => opt.setName('user').setDescription('The booster').setRequired(true))
      .addRoleOption((opt) => opt.setName('role').setDescription('Their custom perk role').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('unlink')
      .setDescription('Stop tracking custom role(s) for a user (does not remove the role itself)')
      .addUserOption((opt) => opt.setName('user').setDescription('The user').setRequired(true))
      .addRoleOption((opt) =>
        opt
          .setName('role')
          .setDescription('The role to stop tracking (omit to untrack all of this user\'s linked roles)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Lists tracked custom roles')
      .addUserOption((opt) => opt.setName('user').setDescription("Show only this user's tracked roles").setRequired(false))
  )
  .addSubcommandGroup((group) =>
    group
      .setName('exempt')
      .setDescription('Manage which roles are exempt from the auto-removal, regardless of boost status')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add a role: members with it are never touched by the auto-removal')
          .addRoleOption((opt) => opt.setName('role').setDescription('The role to exempt').setRequired(true))
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove a role from the exempt list')
          .addRoleOption((opt) => opt.setName('role').setDescription('The role to stop exempting').setRequired(true))
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('Lists every exempt role'))
  );

async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);

  if (group === 'exempt') {
    switch (interaction.options.getSubcommand()) {
      case 'add':
        return handleExemptAdd(interaction);
      case 'remove':
        return handleExemptRemove(interaction);
      case 'list':
        return handleExemptList(interaction);
      default:
        return undefined;
    }
  }

  switch (interaction.options.getSubcommand()) {
    case 'link':
      return handleLink(interaction);
    case 'unlink':
      return handleUnlink(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return undefined;
  }
}

module.exports = { data, execute };

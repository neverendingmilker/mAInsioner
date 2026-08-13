const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleEdit } = require('./handlers/edit');
const { handleList } = require('./handlers/list');
const { handleExemptAdd, handleExemptRemove, handleExemptList } = require('./handlers/exempt');
const boosterLinkManager = require('../../features/boosterlinks/boosterLinkManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(boosterLinkManager, PermissionFlagsBits.Administrator, 'Booster Links');

const data = new SlashCommandBuilder()
  .setName('boosterlink')
  .setDescription('Tracks custom perk roles given to server boosters, so they auto-remove when the boost ends')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Associate a custom role with a booster, so it gets auto-removed if they stop boosting')
      .addUserOption((opt) => opt.setName('user').setDescription('The booster').setRequired(true))
      .addRoleOption((opt) => opt.setName('role').setDescription('Their custom perk role').setRequired(true))
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Change which role is tracked for a user (swaps one linked role for another)')
      .addStringOption((opt) =>
        opt.setName('user').setDescription('Which user to edit (start typing to see tracked users)').setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt.setName('old_role').setDescription('Their currently-tracked role').setRequired(true).setAutocomplete(true)
      )
      .addRoleOption((opt) => opt.setName('new_role').setDescription('The role to track instead').setRequired(true))
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
      .addSubcommand((sub) => sub.setName('list').setDescription('Lists every exempt role'))
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Remove a role from the exempt list')
          .addRoleOption((opt) => opt.setName('role').setDescription('The role to stop exempting').setRequired(true))
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Lists tracked custom roles')
      .addUserOption((opt) => opt.setName('user').setDescription("Show only this user's tracked roles").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Stop tracking custom role(s) for a user (does not remove the role itself)')
      .addStringOption((opt) =>
        opt.setName('user').setDescription('Which user (start typing to see tracked users)').setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('role')
          .setDescription("The role to stop tracking (omit to untrack all of this user's linked roles)")
          .setRequired(false)
          .setAutocomplete(true)
      )
  );

async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (!group && sub === 'disable') {
    return handleDisable(interaction);
  }

  if (group === 'exempt') {
    switch (sub) {
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

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return undefined;
  }
}

// Powers the "user" option's autocomplete on /boosterlink remove and edit (only users
// who actually have a tracked link, with their currently-tracked role(s) shown right in
// the label), and the "role"/"old_role" option's autocomplete on both (only whichever
// roles are actually tracked for the selected user).
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'user') {
    const allLinks = await boosterLinkManager.listAll(interaction.guildId);
    const linksByUser = new Map();
    for (const link of allLinks) {
      if (!linksByUser.has(link.user_id)) linksByUser.set(link.user_id, []);
      linksByUser.get(link.user_id).push(link.role_id);
    }

    const query = focused.value.toLowerCase();
    const choices = [...linksByUser.entries()]
      .map(([userId, roleIds]) => {
        const member = interaction.guild.members.cache.get(userId);
        const displayName = member ? member.user.username : userId;
        const roleNames = roleIds.map((id) => interaction.guild.roles.cache.get(id)?.name ?? id).join(', ');
        return { name: `${displayName} — ${roleNames}`.slice(0, 100), value: userId, searchable: displayName.toLowerCase() };
      })
      .filter((c) => c.searchable.includes(query))
      .slice(0, 25)
      .map(({ name, value }) => ({ name, value }));

    await interaction.respond(choices);
    return;
  }

  if (focused.name !== 'role' && focused.name !== 'old_role') {
    await interaction.respond([]);
    return;
  }

  const userId = interaction.options.getString('user');
  if (!userId) {
    await interaction.respond([]);
    return;
  }

  const links = await boosterLinkManager.listForUser(interaction.guildId, userId);
  const query = focused.value.toLowerCase();

  const choices = links
    .map((l) => {
      const role = interaction.guild.roles.cache.get(l.role_id);
      return role ? { name: role.name, value: role.id } : null;
    })
    .filter(Boolean)
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

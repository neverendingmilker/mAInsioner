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
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Change an existing link (which roles, and/or viceversa)')
      .addStringOption((opt) =>
        opt.setName('link').setDescription('Which link to edit (start typing to see configured ones)').setRequired(true).setAutocomplete(true)
      )
      .addRoleOption((opt) => opt.setName('new_role1').setDescription('New role1 (optional)').setRequired(false))
      .addRoleOption((opt) => opt.setName('new_role2').setDescription('New role2 (optional)').setRequired(false))
      .addBooleanOption((opt) => opt.setName('viceversa').setDescription('New viceversa setting (optional)').setRequired(false))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Mod] Lists all configured role links in this server'))
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes a role1 -> role2 link')
      .addStringOption((opt) =>
        opt.setName('link').setDescription('Which link to remove (start typing to see configured ones)').setRequired(true).setAutocomplete(true)
      )
  );

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

// Powers the "link" option's autocomplete on /rolelink edit and remove — shows every
// currently configured link (role1 -> role2, with its viceversa setting) instead of
// making the admin pick role1/role2 separately and hope they typed an existing pair.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'link') {
    await interaction.respond([]);
    return;
  }

  const links = await roleLinkManager.listAll(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = links
    .map((l) => {
      const roleA = interaction.guild.roles.cache.get(l.role_a_id);
      const roleB = interaction.guild.roles.cache.get(l.role_b_id);
      const arrow = l.bidirectional ? '<->' : '->';
      const label = `${roleA?.name ?? l.role_a_id} ${arrow} ${roleB?.name ?? l.role_b_id}`;
      return { name: label.slice(0, 100), value: `${l.role_a_id}:${l.role_b_id}` };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

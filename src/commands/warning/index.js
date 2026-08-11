const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleGive } = require('./handlers/give');
const { handleEdit } = require('./handlers/edit');
const { handleRoles } = require('./handlers/roles');
const { handleChannel } = require('./handlers/channel');
const warningManager = require('../../features/warning/warningManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(warningManager, PermissionFlagsBits.Administrator, 'Warnings');

const data = new SlashCommandBuilder()
  .setName('warning')
  .setDescription('Moderation warnings: logs a note on a user and assigns one of two configured roles')
  .addSubcommand((sub) =>
    sub
      .setName('give')
      .setDescription('[Mod] Issue a full warning to a user')
      .addUserOption((opt) => opt.setName('user').setDescription('Who to warn').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Why').setRequired(true).setMaxLength(300))
      .addStringOption((opt) =>
        opt
          .setName('role')
          .setDescription('Which of the two configured roles to assign')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('date')
          .setDescription('Backdate it: DD/MM/YY or DD/MM/YYYY (default: today). Date only, no time.')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Mod] Edit one of your own previously-issued warnings/verbals')
      .addStringOption((opt) =>
        opt.setName('warning').setDescription('Which of your warnings to edit').setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) => opt.setName('reason').setDescription('New reason (optional)').setRequired(false).setMaxLength(300))
      .addStringOption((opt) =>
        opt
          .setName('date')
          .setDescription('New date: DD/MM/YY or DD/MM/YYYY, overwrites the current one (optional)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('roles')
      .setDescription('[Admin] Configure the two roles selectable via /warning give')
      .addRoleOption((opt) => opt.setName('role_1').setDescription('First role').setRequired(true))
      .addRoleOption((opt) => opt.setName('role_2').setDescription('Second role').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('[Admin] Set the channel where the warnings list is kept updated')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('The channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
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

  if (!(await warningManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Warnings feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  const needsAdmin = sub === 'roles' || sub === 'channel';
  const needsMod = sub === 'give' || sub === 'edit';

  if (needsAdmin && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }
  if (needsMod && !interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ content: '❌ You need the "Moderate Members" permission to use this command.', ephemeral: true });
    return;
  }

  switch (sub) {
    case 'give':
      return handleGive(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'roles':
      return handleRoles(interaction);
    case 'channel':
      return handleChannel(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "role" option's autocomplete on /warning give (the two configured roles),
// and the "warning" option's autocomplete on /warning edit (only the caller's own).
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'warning') {
    const own = await warningManager.getOwnWarningsList(interaction.guildId, interaction.user.id);
    const query = focused.value.toLowerCase();
    const filtered = own.filter((w) => w.label.toLowerCase().includes(query)).slice(0, 25);
    await interaction.respond(filtered.map((w) => ({ name: w.label, value: String(w.id) })));
    return;
  }

  if (focused.name !== 'role') {
    await interaction.respond([]);
    return;
  }

  const choices = await warningManager.getRoleChoices(interaction.guild);
  const query = focused.value.toLowerCase();
  const filtered = choices.filter((c) => c.name.toLowerCase().includes(query));

  await interaction.respond(filtered.map((c) => ({ name: c.name, value: c.id })));
}

module.exports = { data, execute, autocomplete };

const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleEdit } = require('./handlers/edit');
const { handleConfig } = require('./handlers/config');
const { handleUpdate } = require('./handlers/update');
const warningManager = require('../../features/warning/warningManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(warningManager, PermissionFlagsBits.Administrator, 'Warnings');

const data = new SlashCommandBuilder()
  .setName('warning')
  .setDescription('Configuration and management for the Warnings feature (to warn someone, use /warn)')
  .addSubcommand((sub) =>
    sub
      .setName('config')
      .setDescription('[Admin] Configure the two escalation roles used by /warn and/or the warnings list channel')
      .addRoleOption((opt) =>
        opt.setName('role_1').setDescription('First role (assigned on the first warning) — set together with role_2').setRequired(false)
      )
      .addRoleOption((opt) =>
        opt.setName('role_2').setDescription('Second role (assigned on the next warning) — set together with role_1').setRequired(false)
      )
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Where the warnings list is kept updated')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand())
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
    sub.setName('update').setDescription('[Admin] Refreshes the warnings list embed with the current formatting/content')
  );

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

  const needsAdmin = sub === 'config' || sub === 'update';
  const needsMod = sub === 'edit';

  if (needsAdmin && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }
  if (needsMod && !interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ content: '❌ You need the "Moderate Members" permission to use this command.', ephemeral: true });
    return;
  }

  switch (sub) {
    case 'edit':
      return handleEdit(interaction);
    case 'config':
      return handleConfig(interaction);
    case 'update':
      return handleUpdate(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "warning" option's autocomplete on /warning edit (only the caller's own).
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'warning') {
    await interaction.respond([]);
    return;
  }

  const own = await warningManager.getOwnWarningsList(interaction.guildId, interaction.user.id);
  const query = focused.value.toLowerCase();
  const filtered = own.filter((w) => w.label.toLowerCase().includes(query)).slice(0, 25);
  await interaction.respond(filtered.map((w) => ({ name: w.label, value: String(w.id) })));
}

module.exports = { data, execute, autocomplete };

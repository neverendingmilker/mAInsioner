const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleGive } = require('./handlers/give');
const { handleRoles } = require('./handlers/roles');
const { handleChannel } = require('./handlers/channel');
const warningManager = require('../../features/warning/warningManager');

const data = new SlashCommandBuilder()
  .setName('warning')
  .setDescription('Moderation warnings: logs a note on a user and assigns one of two configured roles')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub
      .setName('give')
      .setDescription('Issue a full warning to a user')
      .addUserOption((opt) => opt.setName('user').setDescription('Who to warn').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Why').setRequired(true).setMaxLength(300))
      .addStringOption((opt) =>
        opt
          .setName('role')
          .setDescription('Which of the two configured roles to assign')
          .setRequired(true)
          .setAutocomplete(true)
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
  );

async function execute(interaction) {
  if (!(await warningManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Warnings feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'give':
      return handleGive(interaction);
    case 'roles':
      return handleRoles(interaction);
    case 'channel':
      return handleChannel(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "role" option's autocomplete on /warning give — reflects whichever two
// roles are currently configured, by their live name (in case they got renamed).
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
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

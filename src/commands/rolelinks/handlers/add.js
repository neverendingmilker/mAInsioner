const { PermissionFlagsBits, MessageFlags, ActionRowBuilder, RoleSelectMenuBuilder } = require('discord.js');
const sessions = require('../../../features/rolelinks/roleLinkSessions');

const MAX_TARGET_ROLES = 10;

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const role1 = interaction.options.getRole('role1');
  const bidirectional = interaction.options.getBoolean('viceversa') ?? false;

  if (role1.managed || role1.id === interaction.guildId) {
    await interaction.reply({ content: '⚠️ That role can\'t be used here.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const menu = new RoleSelectMenuBuilder()
    .setCustomId('rolelink:add:roles')
    .setPlaceholder(`Pick 1-${MAX_TARGET_ROLES} role(s) to remove when ${role1.name} is lost`)
    .setMinValues(1)
    .setMaxValues(MAX_TARGET_ROLES);

  const sent = await interaction.editReply({
    content: `Losing ${role1} will remove which role(s)? Pick one or more:`,
    components: [new ActionRowBuilder().addComponents(menu)],
  });

  sessions.create(sent.id, { role1Id: role1.id, bidirectional, createdBy: interaction.user.id });
}

module.exports = { handleAdd };

const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

async function handleToggle(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const enabled = interaction.options.getBoolean('enabled');
  await goosepizzaManager.setEnabled(interaction.guildId, enabled);

  await interaction.reply({
    content: enabled ? '✅ GoosePizza is now enabled.' : '✅ GoosePizza is now disabled.',
    ephemeral: true,
  });
}

module.exports = { handleToggle };

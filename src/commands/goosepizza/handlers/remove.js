const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const name = interaction.options.getString('name');
  const removedCount = await goosepizzaManager.remove(interaction.guildId, name);

  if (removedCount === 0) {
    await interaction.reply({ content: `No GoosePizza trigger named "${name}" found.`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ GoosePizza trigger **${name}** removed.`, ephemeral: true });
}

module.exports = { handleRemove };

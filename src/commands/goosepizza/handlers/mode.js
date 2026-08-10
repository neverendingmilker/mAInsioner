const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

async function handleMode(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const mode = interaction.options.getString('mode');

  try {
    await goosepizzaManager.setMode(interaction.guildId, mode);
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: `✅ GoosePizza will now: ${goosepizzaManager.RESPONSE_MODES[mode]}`, ephemeral: true });
}

module.exports = { handleMode };

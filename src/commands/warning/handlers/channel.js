const { PermissionFlagsBits } = require('discord.js');
const warningManager = require('../../../features/warning/warningManager');

async function handleChannel(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  try {
    await warningManager.setChannel(interaction.guild, channel);
  } catch (err) {
    if (err instanceof warningManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: `✅ The warnings list will be kept updated in ${channel}.`, ephemeral: true });
}

module.exports = { handleChannel };

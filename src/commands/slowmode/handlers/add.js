const { PermissionFlagsBits } = require('discord.js');
const slowModeManager = require('../../../features/slowmode/slowModeManager');
const { formatSeconds } = require('../../../utils/duration');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages) && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Manage Messages" or "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const duration = interaction.options.getString('duration');

  let result;
  try {
    result = await slowModeManager.setLimit(interaction.guildId, channel, duration, interaction.user.id);
  } catch (err) {
    if (err instanceof slowModeManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ ${channel}: each person can now only post there once every **${formatSeconds(result.cooldownSeconds)}**. ` +
      `Moderators (Manage Messages/Administrator) are always exempt.`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

const { PermissionFlagsBits } = require('discord.js');
const honeypotManager = require('../../../features/honeypot/honeypotManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const channel = interaction.guild.channels.cache.get(channelId);

  try {
    await honeypotManager.removeChannel(interaction.guild, channelId);
  } catch (err) {
    if (err instanceof honeypotManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content: `✅ ${channel ?? 'That channel'} is no longer a honeypot. The trap message was removed too, if it was still there.`,
    ephemeral: true,
  });
}

module.exports = { handleRemove };

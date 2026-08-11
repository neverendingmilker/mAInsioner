const { PermissionFlagsBits } = require('discord.js');
const stickyManager = require('../../../features/sticky/stickyManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '⚠️ You need Administrator permission to remove a sticky message.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  const removed = await stickyManager.removeSticky(interaction.guild, channel.id);

  if (!removed) {
    await interaction.reply({ content: `⚠️ There's no sticky message configured in ${channel}.`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Sticky message removed from ${channel}.`, ephemeral: true });
}

module.exports = { handleRemove };

const { PermissionFlagsBits } = require('discord.js');
const honeypotManager = require('../../../features/honeypot/honeypotManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const message = interaction.options.getString('message');
  const buttonLabel = interaction.options.getString('button_label');
  const emoji = interaction.options.getString('emoji');

  try {
    await honeypotManager.addChannel(interaction.guild, channel, message, buttonLabel, interaction.user.id, emoji);
  } catch (err) {
    if (err instanceof honeypotManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ ${channel} is now a honeypot. Anyone without Mod/Admin who posts there, reacts to anything there, or clicks the ` +
      `trap button gets kicked immediately — their message gets deleted (if it was a post) and the bot's own bait reaction ` +
      `gets cleaned up (if one was set).`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

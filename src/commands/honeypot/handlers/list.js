const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const honeypotManager = require('../../../features/honeypot/honeypotManager');

const EMBED_COLOR = 0xed4245;

async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channels = await honeypotManager.listChannels(interaction.guildId);

  if (channels.length === 0) {
    await interaction.reply({ content: '✅ No honeypot channels are currently set up.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Active honeypot channels')
    .setDescription(channels.map((c) => `<#${c.channelId}>`).join('\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };

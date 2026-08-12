const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const autoresponderManager = require('../../../features/autoresponder/autoresponderManager');

const EMBED_COLOR = 0x9b59b6;

async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channels = await autoresponderManager.listChannels(interaction.guildId);

  if (channels.length === 0) {
    await interaction.reply({ content: 'No autoresponders are currently configured in this server.', ephemeral: true });
    return;
  }

  const lines = channels.map((c) => `<#${c.channelId}> — ${c.emojis.join(' ')}`);
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Autoresponders').setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };

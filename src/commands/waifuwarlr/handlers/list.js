const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const waifuWarLRManager = require('../../../features/waifuwarlr/waifuWarLRManager');

const EMBED_COLOR = 0x1abc9c;

async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelIds = await waifuWarLRManager.listChannels(interaction.guildId);
  if (channelIds.length === 0) {
    await interaction.reply({ content: 'No channels are set up for reaction codes in this server.', ephemeral: true });
    return;
  }

  const blocks = [];
  for (const channelId of channelIds) {
    const digitMap = await waifuWarLRManager.getDigitMap(interaction.guildId, channelId);
    const mappings =
      digitMap.size === 0
        ? '*(no digits mapped yet — use `/waifuwarlr setdigit`)*'
        : [...digitMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([digit, emoji]) => `\`${digit}\` → ${emoji}`)
            .join('  ');
    blocks.push(`<#${channelId}>\n${mappings}`);
  }

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Reaction codes').setDescription(blocks.join('\n\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };

const { EmbedBuilder } = require('discord.js');
const highlightManager = require('../../../features/highlight/highlightManager');

const EMBED_COLOR = 0xf1c40f;

async function handleList(interaction) {
  const [words, ignoredChannelIds, ignoredUserIds] = await Promise.all([
    highlightManager.getWordsForUser(interaction.guildId, interaction.user.id),
    highlightManager.getIgnoredChannels(interaction.guildId, interaction.user.id),
    highlightManager.getIgnoredUsers(interaction.guildId, interaction.user.id),
  ]);

  const wordsText = words.length > 0 ? words.map((w) => `\`${w}\``).join(', ') : '*(none set — use `/highlight add`)*';
  const channelsText = ignoredChannelIds.length > 0 ? ignoredChannelIds.map((id) => `<#${id}>`).join(', ') : '*(none)*';
  const usersText = ignoredUserIds.length > 0 ? ignoredUserIds.map((id) => `<@${id}>`).join(', ') : '*(none)*';

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Your Highlight settings')
    .addFields(
      { name: `Words (${words.length}/${highlightManager.MAX_WORDS_PER_USER})`, value: wordsText },
      { name: 'Ignored channels', value: channelsText },
      { name: 'Ignored users', value: usersText }
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };

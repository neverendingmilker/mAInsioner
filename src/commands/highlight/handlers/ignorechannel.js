const highlightManager = require('../../../features/highlight/highlightManager');

async function handleIgnoreChannel(interaction) {
  const channel = interaction.options.getChannel('channel');
  const result = await highlightManager.toggleIgnoredChannel(interaction.guildId, interaction.user.id, channel.id);

  await interaction.reply({
    content:
      result === 'added'
        ? `✅ ${channel} added to your ignore list — you won't be highlighted from messages there anymore.`
        : `✅ ${channel} removed from your ignore list — you'll be highlighted from messages there again.`,
    ephemeral: true,
  });
}

module.exports = { handleIgnoreChannel };

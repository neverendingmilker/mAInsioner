const highlightManager = require('../../../features/highlight/highlightManager');

async function handleRemove(interaction) {
  const word = interaction.options.getString('word');
  const removedCount = await highlightManager.removeWord(interaction.guildId, interaction.user.id, word);

  if (removedCount === 0) {
    await interaction.reply({ content: `⚠️ You're not highlighting "${word}".`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Stopped highlighting **"${word}"**.`, ephemeral: true });
}

module.exports = { handleRemove };

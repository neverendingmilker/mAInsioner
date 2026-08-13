const highlightManager = require('../../../features/highlight/highlightManager');

async function handleAdd(interaction) {
  const wordInput = interaction.options.getString('word');

  let word;
  try {
    word = await highlightManager.addWord(interaction.guildId, interaction.user.id, wordInput);
  } catch (err) {
    if (err instanceof highlightManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content: `✅ Now highlighting **"${word}"** — I'll DM you when someone says it (not your own messages).`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

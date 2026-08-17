const qotdManager = require('../../../features/qotd/qotdManager');
const { isMod } = require('../../../utils/modRole');

async function handleEdit(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const id = Number(interaction.options.getString('question'));
  const text = interaction.options.getString('text');

  try {
    await qotdManager.editQuestion(interaction.guildId, id, text);
  } catch (err) {
    if (err instanceof qotdManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: '✅ Question updated.', ephemeral: true });
}

module.exports = { handleEdit };

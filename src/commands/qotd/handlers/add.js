const qotdManager = require('../../../features/qotd/qotdManager');
const { isMod } = require('../../../utils/modRole');

async function handleAdd(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const question = interaction.options.getString('question');

  try {
    await qotdManager.addQuestion(interaction.guildId, question);
  } catch (err) {
    if (err instanceof qotdManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const questions = await qotdManager.listQuestions(interaction.guildId);
  await interaction.reply({
    content: `✅ Question added to the queue. ${questions.length} question(s) total now.`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

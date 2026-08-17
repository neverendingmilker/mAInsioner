const qotdManager = require('../../../features/qotd/qotdManager');
const { isMod } = require('../../../utils/modRole');

async function handleRemove(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const id = Number(interaction.options.getString('question'));
  await qotdManager.removeQuestion(interaction.guildId, id);

  const questions = await qotdManager.listQuestions(interaction.guildId);
  await interaction.reply({
    content: `✅ Question removed. ${questions.length} question(s) left in the queue.`,
    ephemeral: true,
  });
}

module.exports = { handleRemove };

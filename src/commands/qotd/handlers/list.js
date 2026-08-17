const qotdManager = require('../../../features/qotd/qotdManager');
const { isMod } = require('../../../utils/modRole');

// "Upcoming" means not-yet-posted (from the queue cursor onward) — the full history
// including already-posted questions is still only on the dashboard.
async function handleList(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const [config, questions] = await Promise.all([qotdManager.getConfig(interaction.guildId), qotdManager.listQuestions(interaction.guildId)]);

  const upcoming = questions.slice(config.next_position);

  if (upcoming.length === 0) {
    await interaction.reply({
      content: 'No upcoming questions — the queue is empty or exhausted. Add one with `/qotd add`.',
      ephemeral: true,
    });
    return;
  }

  const lines = upcoming.map((q, i) => {
    const preview = q.question.length > 100 ? `${q.question.slice(0, 100)}…` : q.question;
    return `**${i + 1}.** ${preview} \`(#${q.id})\``;
  });

  // Discord caps a message at 2000 chars — truncate the whole list rather than erroring
  // out if the queue is long; the dashboard already has the full, unbounded view.
  let content = `**Upcoming questions (${upcoming.length}):**\n${lines.join('\n')}`;
  if (content.length > 1900) {
    content = `${content.slice(0, 1900)}…\n*(list truncated — see the dashboard for the full queue)*`;
  }

  await interaction.reply({ content, ephemeral: true });
}

module.exports = { handleList };

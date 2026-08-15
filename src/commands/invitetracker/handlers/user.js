const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');

async function handleUser(interaction) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const stats = await inviteTrackerManager.getUserStats(interaction.guildId, target.id);

  if (stats.total === 0) {
    await interaction.reply({ content: `${target} hasn't invited anyone (tracked) yet.` });
    return;
  }

  await interaction.reply({
    content: `${target} has invited **${stats.current}** ${stats.current === 1 ? 'person' : 'people'} currently in the server (**${stats.total}** total, including anyone who later left).`,
  });
}

module.exports = { handleUser };

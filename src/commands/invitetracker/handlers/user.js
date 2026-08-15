const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');

async function handleUser(interaction) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const stats = await inviteTrackerManager.getUserStats(interaction.guildId, target.id);
  const assignedCodes = await inviteTrackerManager.getAssignedInvites(interaction.guildId, target.id);

  const lines = [];
  lines.push(
    stats.total === 0
      ? `${target} hasn't invited anyone (tracked) yet.`
      : `${target} has invited **${stats.current}** ${stats.current === 1 ? 'person' : 'people'} currently in the server (**${stats.total}** total, including anyone who later left).`
  );

  if (assignedCodes.length > 0) {
    lines.push(`Active invite link${assignedCodes.length === 1 ? '' : 's'} credited to them: ${assignedCodes.map((c) => `https://discord.gg/${c}`).join(', ')}`);
  }

  await interaction.reply({ content: lines.join('\n') });
}

module.exports = { handleUser };

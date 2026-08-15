const { EmbedBuilder } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');

const EMBED_COLOR = 0x5865f2;
const LIMIT = 10;

async function handleLeaderboard(interaction) {
  const leaderboard = await inviteTrackerManager.getLeaderboard(interaction.guildId, LIMIT);

  if (leaderboard.length === 0) {
    await interaction.reply({ content: '✅ No tracked invites yet — no one has joined through a trackable invite so far.' });
    return;
  }

  const lines = leaderboard.map(
    (row, i) => `**${i + 1}.** <@${row.inviterId}> — **${row.current}** here now (${row.total} total)`
  );

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('🏆 Top inviters').setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed] });
}

module.exports = { handleLeaderboard };

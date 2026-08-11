const { PermissionFlagsBits } = require('discord.js');
const animeNightManager = require('../../../features/animenight/animeNightManager');

async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need the "Administrator" permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const sessionDate = interaction.options.getString('session');
  const newTitles = interaction.options.getString('titles');
  const newDate = interaction.options.getString('date');

  try {
    const result = await animeNightManager.editSession(
      interaction.guildId,
      sessionDate,
      newTitles,
      newDate,
      interaction.user.id
    );

    // Recompute the session number after the edit, for a friendly confirmation message.
    const sessions = await animeNightManager.getSessionsList(interaction.guildId);
    const matched = sessions.find((s) => s.date === result.date);
    const label = matched ? `Mystery Anime Night ${matched.number}` : 'Session';

    const list = result.titles.map((title) => `• ${title}`).join('\n');
    await interaction.reply({
      content: `✏️ ${label} updated — now on **${animeNightManager.formatDisplayDate(result.date)}**:\n${list}`,
    });
  } catch (err) {
    if (err instanceof animeNightManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
    } else {
      throw err;
    }
  }
}

module.exports = { handleEdit };

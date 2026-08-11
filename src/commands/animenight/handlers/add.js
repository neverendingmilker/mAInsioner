const { PermissionFlagsBits } = require('discord.js');
const animeNightManager = require('../../../features/animenight/animeNightManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need the "Administrator" permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const titlesInput = interaction.options.getString('titles');
  const dateInput = interaction.options.getString('date');

  try {
    const { titles, watchedDate } = await animeNightManager.addAnime(
      interaction.guildId,
      titlesInput,
      dateInput,
      interaction.user.id
    );

    const displayDate = animeNightManager.formatDisplayDate(watchedDate);
    const list = titles.map((title) => `• ${title}`).join('\n');

    await interaction.reply({
      content: `📺 Added ${titles.length} anime for **${displayDate}**:\n${list}`,
    });
  } catch (err) {
    if (err instanceof animeNightManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
    } else {
      throw err;
    }
  }
}

module.exports = { handleAdd };

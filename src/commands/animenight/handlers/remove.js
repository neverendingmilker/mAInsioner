const { PermissionFlagsBits } = require('discord.js');
const animeNightManager = require('../../../features/animenight/animeNightManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const entryId = interaction.options.getString('entry');

  try {
    const removed = await animeNightManager.removeAnime(interaction.guildId, entryId);
    const displayDate = animeNightManager.formatDisplayDate(removed.date);
    await interaction.reply({ content: `🗑️ Removed **${removed.title}** from **${displayDate}**.` });
  } catch (err) {
    if (err instanceof animeNightManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }
}

module.exports = { handleRemove };

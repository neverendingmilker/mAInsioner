const { PermissionFlagsBits } = require('discord.js');
const animeNightManager = require('../../../features/animenight/animeNightManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const sessionDate = interaction.options.getString('session');

  try {
    const removed = await animeNightManager.removeSession(interaction.guildId, sessionDate);
    const displayDate = animeNightManager.formatDisplayDate(removed.date);
    const list = removed.titles.map((title) => `• ${title}`).join('\n');
    await interaction.reply({ content: `🗑️ Removed the whole session from **${displayDate}** (${removed.titles.length} anime):\n${list}` });
  } catch (err) {
    if (err instanceof animeNightManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }
}

module.exports = { handleRemove };

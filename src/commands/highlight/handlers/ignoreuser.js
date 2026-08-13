const highlightManager = require('../../../features/highlight/highlightManager');

async function handleIgnoreUser(interaction) {
  const user = interaction.options.getUser('user');

  let result;
  try {
    result = await highlightManager.toggleIgnoredUser(interaction.guildId, interaction.user.id, user.id);
  } catch (err) {
    if (err instanceof highlightManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      result === 'added'
        ? `✅ ${user} added to your ignore list — their messages won't highlight you anymore.`
        : `✅ ${user} removed from your ignore list — their messages can highlight you again.`,
    ephemeral: true,
  });
}

module.exports = { handleIgnoreUser };

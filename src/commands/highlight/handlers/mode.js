const highlightManager = require('../../../features/highlight/highlightManager');

const MODE_DESCRIPTIONS = {
  exclude: 'everywhere, **except** the channels in your list',
  include: '**only** in the channels in your list',
};

async function handleMode(interaction) {
  const mode = interaction.options.getString('mode');

  try {
    await highlightManager.setChannelMode(interaction.guildId, interaction.user.id, mode);
  } catch (err) {
    if (err instanceof highlightManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content: `✅ Highlight mode updated — you'll now be notified ${MODE_DESCRIPTIONS[mode]}. Manage the list with \`/highlight ignorechannel\`.`,
    ephemeral: true,
  });
}

module.exports = { handleMode };

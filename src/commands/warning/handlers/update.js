const warningManager = require('../../../features/warning/warningManager');

async function handleUpdate(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    await warningManager.refreshEmbed(interaction.guild);
  } catch (err) {
    if (err instanceof warningManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
      return;
    }
    throw err;
  }

  await interaction.editReply({ content: '✅ Warnings list refreshed with the current formatting/content.' });
}

module.exports = { handleUpdate };

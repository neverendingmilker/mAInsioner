const warningManager = require('../../../features/warning/warningManager');

async function handleEdit(interaction) {
  const warningId = Number(interaction.options.getString('warning'));
  const reason = interaction.options.getString('reason') ?? undefined;
  const dateInput = interaction.options.getString('date') ?? undefined;

  try {
    await warningManager.editWarning(interaction.guild, warningId, interaction.user.id, { reason, dateInput });
  } catch (err) {
    if (err instanceof warningManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: '✅ Warning updated.', ephemeral: true });
}

module.exports = { handleEdit };

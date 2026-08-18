const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const verifyManager = require('../../../features/verify/verifyManager');

const FIELD_LABELS = {
  verification: 'Verification',
  social: 'Social',
};

// Step 1 (select menu from /verify edit): admin picked which field to change —
// show a modal to type the new value, prefilled with the current one.
async function handleEditSelect(interaction) {
  const [, , reportIdStr] = interaction.customId.split(':');
  const reportId = Number(reportIdStr);
  const field = interaction.values[0];

  const report = await verifyManager.getReportById(reportId);
  if (!report) {
    await interaction.update({ content: '⚠️ This report no longer exists.', components: [] });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`vfedit:modal:${reportId}:${field}`)
    .setTitle(`Edit ${FIELD_LABELS[field]}`);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(FIELD_LABELS[field])
    .setStyle(TextInputStyle.Paragraph)
    .setValue(report[field])
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
}

// Step 2 (modal submit): update the DB record and edit the original report embed
// in place — everything else (member, verified on, user id, color) stays the same.
// The DB update + live-message sync now live in verifyManager.updateReportAndSync
// (shared with the dashboard's report edit form) — this handler is a thin wrapper
// that reproduces the exact same two possible replies as before the extraction.
async function handleEditModalSubmit(interaction) {
  const [, , reportIdStr, field] = interaction.customId.split(':');
  const reportId = Number(reportIdStr);
  const newValue = interaction.fields.getTextInputValue('value');

  const result = await verifyManager.updateReportAndSync(interaction.guild, reportId, field, newValue);

  if (!result.found) {
    await interaction.reply({ content: '⚠️ This report no longer exists.', ephemeral: true });
    return;
  }

  if (!result.messageUpdated) {
    await interaction.reply({
      content: '✅ Saved, but I couldn\'t find the original report message to update it (it may have been deleted).',
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `✅ **${FIELD_LABELS[field]}** updated.`,
    ephemeral: true,
  });
}

module.exports = { handleEditSelect, handleEditModalSubmit };

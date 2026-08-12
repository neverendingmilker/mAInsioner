const { PermissionFlagsBits } = require('discord.js');
const suggestionManager = require('../../../features/suggestion/suggestionManager');

// Shared core: given an already-resolved suggestion row, applies the decision. Used by
// both the /suggestion approve|reject slash commands (which look it up by number) and
// the "Suggestion: Approve"/"Suggestion: Reject" context menu commands (which look it
// up by the message that was right-clicked).
async function applyDecision(interaction, suggestion, status, pastTense) {
  if (suggestion.status !== 'pending') {
    await interaction.reply({
      content: `⚠️ Suggestion **#${suggestion.number}** has already been decided.`,
      ephemeral: true,
    });
    return;
  }

  await suggestionManager.setStatus(interaction.guild, suggestion.number, status, interaction.user.id);

  await interaction.reply({ content: `✅ Suggestion **#${suggestion.number}** ${pastTense}.`, ephemeral: true });
}

async function decide(interaction, status, verb, pastTense) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: `⚠️ You need admin permissions to ${verb} suggestions.`, ephemeral: true });
    return;
  }

  const number = interaction.options.getInteger('number');

  const suggestion = await suggestionManager.getSuggestion(interaction.guild.id, number);
  if (!suggestion) {
    await interaction.reply({ content: `⚠️ No suggestion found with number **#${number}**.`, ephemeral: true });
    return;
  }

  await applyDecision(interaction, suggestion, status, pastTense);
}

async function handleApprove(interaction) {
  return decide(interaction, 'approved', 'approve', 'approved');
}

async function handleReject(interaction) {
  return decide(interaction, 'denied', 'reject', 'rejected');
}

module.exports = { handleApprove, handleReject, applyDecision };

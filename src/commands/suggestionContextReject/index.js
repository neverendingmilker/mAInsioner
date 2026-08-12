const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const suggestionManager = require('../../features/suggestion/suggestionManager');
const { applyDecision } = require('../suggestion/handlers/decide');

// Message context menu command: right-click a suggestion's posted embed -> Apps ->
// "Suggestion: Reject". Resolves which suggestion it is from the message itself,
// instead of needing to type its number.
const data = new ContextMenuCommandBuilder()
  .setName('Suggestion: Reject')
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this.', ephemeral: true });
    return;
  }

  const suggestion = await suggestionManager.getSuggestionByMessageId(interaction.targetMessage.id);
  if (!suggestion) {
    await interaction.reply({ content: "⚠️ That message doesn't look like a suggestion I'm tracking.", ephemeral: true });
    return;
  }

  await applyDecision(interaction, suggestion, 'denied', 'rejected');
}

module.exports = { data, execute };

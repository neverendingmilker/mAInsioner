const { PermissionFlagsBits } = require('discord.js');
const suggestionManager = require('../../../features/suggestion/suggestionManager');

async function handleRemove(interaction) {
  const number = interaction.options.getInteger('number'); // optional
  const isMod = interaction.memberPermissions.has(PermissionFlagsBits.Administrator);

  // A mod can remove ANY suggestion by number, regardless of who posted it.
  if (isMod && number) {
    const suggestion = await suggestionManager.getSuggestion(interaction.guildId, number);
    if (!suggestion) {
      await interaction.reply({ content: `⚠️ No suggestion found with number **#${number}**.`, ephemeral: true });
      return;
    }
    await suggestionManager.removeSuggestion(interaction.guild, number);
    await interaction.reply({ content: `✅ Suggestion **#${number}** removed.`, ephemeral: true });
    return;
  }

  // Self-service: only your own still-pending suggestions.
  const ownPending = await suggestionManager.listPendingForUser(interaction.guildId, interaction.user.id);

  if (ownPending.length === 0) {
    await interaction.reply({ content: "⚠️ You don't have any pending suggestions to remove.", ephemeral: true });
    return;
  }

  let target;
  if (number) {
    target = ownPending.find((s) => s.number === number);
    if (!target) {
      await interaction.reply({
        content: `⚠️ You don't have a pending suggestion numbered **#${number}**.`,
        ephemeral: true,
      });
      return;
    }
  } else if (ownPending.length === 1) {
    target = ownPending[0];
  } else {
    const numbers = ownPending.map((s) => `#${s.number}`).join(', ');
    await interaction.reply({
      content: `⚠️ You have more than one pending suggestion (${numbers}) — specify which one with the \`number\` option.`,
      ephemeral: true,
    });
    return;
  }

  await suggestionManager.removeSuggestion(interaction.guild, target.number);
  await interaction.reply({ content: `✅ Your suggestion **#${target.number}** was removed.`, ephemeral: true });
}

module.exports = { handleRemove };

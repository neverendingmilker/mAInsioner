const { PermissionFlagsBits } = require('discord.js');
const reactionCodeManager = require('../../../features/reactioncode/reactionCodeManager');

async function handleSetDigits(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const mapping = interaction.options.getString('mapping');

  let parsed;
  try {
    parsed = await reactionCodeManager.setDigits(interaction.guildId, channelId, mapping);
  } catch (err) {
    if (err instanceof reactionCodeManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const summary = parsed.map(({ digit, emoji }) => `\`${digit}\` → ${emoji}`).join('  ');
  await interaction.reply({ content: `✅ Set ${parsed.length} mapping${parsed.length === 1 ? '' : 's'} for <#${channelId}>: ${summary}`, ephemeral: true });
}

module.exports = { handleSetDigits };

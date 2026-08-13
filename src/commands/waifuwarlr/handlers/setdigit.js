const { PermissionFlagsBits } = require('discord.js');
const waifuWarLRManager = require('../../../features/waifuwarlr/waifuWarLRManager');

async function handleSetDigit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const digit = interaction.options.getString('digit');
  const emoji = interaction.options.getString('emoji');

  let mappings;
  try {
    mappings = await waifuWarLRManager.setDigit(interaction.guildId, channelId, digit, emoji);
  } catch (err) {
    if (err instanceof waifuWarLRManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const summary = mappings.map((m) => `\`${m.digit}\` → ${m.emoji}`).join('  ');
  await interaction.reply({
    content: `✅ Set ${mappings.length} mapping${mappings.length === 1 ? '' : 's'} for <#${channelId}>: ${summary}`,
    ephemeral: true,
  });
}

module.exports = { handleSetDigit };

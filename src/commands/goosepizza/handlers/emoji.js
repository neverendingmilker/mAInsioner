const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

async function handleEmoji(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const emojiInput = interaction.options.getString('emoji');

  let emoji;
  try {
    emoji = await goosepizzaManager.setEmoji(interaction.guildId, emojiInput);
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: `✅ GoosePizza will now post ${emoji}.`, ephemeral: true });
}

module.exports = { handleEmoji };

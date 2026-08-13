const { PermissionFlagsBits } = require('discord.js');
const waifuWarLRManager = require('../../../features/waifuwarlr/waifuWarLRManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  try {
    await waifuWarLRManager.addChannel(interaction.guild, channel, interaction.user.id);
  } catch (err) {
    if (err instanceof waifuWarLRManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ ${channel} is now set up for reaction codes. Next, map digits to emojis with \`/waifuwarlr setdigit\` — ` +
      `posting an image there and then a message that's only digits (up to 9) will swap the reactions on that image ` +
      `for the ones those digits are mapped to, and delete the digit message.`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

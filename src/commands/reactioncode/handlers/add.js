const { PermissionFlagsBits } = require('discord.js');
const reactionCodeManager = require('../../../features/reactioncode/reactionCodeManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  await reactionCodeManager.addChannel(interaction.guildId, channel, interaction.user.id);

  await interaction.reply({
    content:
      `✅ ${channel} is now set up for reaction codes. Next, map digits to emojis with \`/reactioncode setdigit\` — ` +
      `posting an image there and then a message that's only digits (up to 9) will swap the reactions on that image ` +
      `for the ones those digits are mapped to, and delete the digit message.`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

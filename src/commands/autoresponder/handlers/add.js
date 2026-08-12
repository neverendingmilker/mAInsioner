const { PermissionFlagsBits } = require('discord.js');
const autoresponderManager = require('../../../features/autoresponder/autoresponderManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const emojisInput = interaction.options.getString('emojis');

  let result;
  try {
    result = await autoresponderManager.setChannel(interaction.guild, channel, emojisInput, interaction.user.id);
  } catch (err) {
    if (err instanceof autoresponderManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content: `✅ I'll now react with ${result.emojis.join(' ')} to every message in ${channel}.`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

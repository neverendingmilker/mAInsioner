const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

async function handleCreate(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const name = interaction.options.getString('name');
  const channel = interaction.options.getChannel('channel');
  const triggerText = interaction.options.getString('trigger');
  const emoji = interaction.options.getString('emoji');
  const mode = interaction.options.getString('mode');

  let result;
  try {
    result = await goosepizzaManager.create(interaction.guild, name, channel, triggerText, emoji, mode, interaction.user.id);
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ GoosePizza trigger **${result.name}** created: messages containing "${result.triggerText}" in ${result.channel} ` +
      `will get ${goosepizzaManager.RESPONSE_MODES[result.mode].toLowerCase()}, using ${result.emoji}.`,
    ephemeral: true,
  });
}

module.exports = { handleCreate };

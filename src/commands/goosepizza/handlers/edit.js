const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const name = interaction.options.getString('name');
  const triggerInput = interaction.options.getString('trigger') ?? undefined;
  const emojiInput = interaction.options.getString('emoji') ?? undefined;
  const mode = interaction.options.getString('mode') ?? undefined;

  let updated;
  try {
    updated = await goosepizzaManager.edit(interaction.guild, name, { triggerInput, emojiInput, mode });
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ GoosePizza trigger **${name}** updated: trigger "${updated.trigger_text}", emoji ${updated.emoji}, ` +
      `mode **${goosepizzaManager.RESPONSE_MODES[updated.response_mode]}**. ` +
      "(Use `/goosepizza channels` to change which channels it watches.)",
    ephemeral: true,
  });
}

module.exports = { handleEdit };

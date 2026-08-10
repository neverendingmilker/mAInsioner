const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const name = interaction.options.getString('name');
  const channel = interaction.options.getChannel('channel') ?? undefined;
  const triggerInput = interaction.options.getString('trigger') ?? undefined;
  const emojiInput = interaction.options.getString('emoji') ?? undefined;
  const mode = interaction.options.getString('mode') ?? undefined;

  let updated;
  try {
    updated = await goosepizzaManager.edit(interaction.guild, name, { channel, triggerInput, emojiInput, mode });
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ GoosePizza trigger **${name}** updated: watching <#${updated.channel_id}>, ` +
      `trigger "${updated.trigger_text}", emoji ${updated.emoji}, ` +
      `mode **${goosepizzaManager.RESPONSE_MODES[updated.response_mode]}**.`,
    ephemeral: true,
  });
}

module.exports = { handleEdit };

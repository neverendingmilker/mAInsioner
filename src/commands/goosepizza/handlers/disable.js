const { PermissionFlagsBits } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

// With `name` given, toggles that one trigger. Without it, toggles the whole feature
// (every trigger at once) — same behavior as before this option existed.
async function handleDisable(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const enabled = interaction.options.getBoolean('enabled');
  const name = interaction.options.getString('name');

  if (name) {
    try {
      await goosepizzaManager.setTriggerEnabled(interaction.guildId, name, enabled);
    } catch (err) {
      if (err instanceof goosepizzaManager.ValidationError) {
        await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
        return;
      }
      throw err;
    }
    await interaction.reply({
      content: enabled ? `✅ Trigger **${name}** is now enabled.` : `✅ Trigger **${name}** is now disabled.`,
      ephemeral: true,
    });
    return;
  }

  await goosepizzaManager.setEnabled(interaction.guildId, enabled);
  await interaction.reply({
    content: enabled ? '✅ GoosePizza is now enabled (every trigger).' : '✅ GoosePizza is now disabled (every trigger).',
    ephemeral: true,
  });
}

module.exports = { handleDisable };

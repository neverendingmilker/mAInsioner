const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const starboardManager = require('../../../features/starboard/starboardManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need the "Administrator" permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const name = interaction.options.getString('name');
  const removedCount = await starboardManager.remove(interaction.guildId, name);

  if (removedCount === 0) {
    await interaction.reply({ content: `No starboard named "${name}" found in this server.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    content: `✅ Starboard **${name}** removed. Already-posted messages are left as-is, but won't be updated anymore.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { handleRemove };

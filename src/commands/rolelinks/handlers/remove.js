const { PermissionFlagsBits } = require('discord.js');
const roleLinkManager = require('../../../features/rolelinks/roleLinkManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need the "Administrator" permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const [roleAId, roleBId] = interaction.options.getString('link').split(':');
  const roleA = interaction.guild.roles.cache.get(roleAId);
  const roleB = interaction.guild.roles.cache.get(roleBId);
  if (!roleA || !roleB) {
    await interaction.reply({ content: "⚠️ One of that link's roles doesn't seem to exist anymore.", ephemeral: true });
    return;
  }

  const removedCount = await roleLinkManager.unlink(interaction.guildId, roleA.id, roleB.id);

  if (removedCount === 0) {
    await interaction.reply({
      content: `No link found from ${roleA} to ${roleB}. Check the order — role1 is the one that, when lost, removes role2.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: `✅ Unlinked ${roleA} → ${roleB}.`, ephemeral: true });
}

module.exports = { handleRemove };

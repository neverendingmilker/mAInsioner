const { PermissionFlagsBits } = require('discord.js');
const boosterLinkManager = require('../../../features/boosterlinks/boosterLinkManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: '❌ You need the "Manage Roles" permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const user = interaction.options.getUser('user');
  const roleId = interaction.options.getString('role');

  if (roleId) {
    const role = interaction.guild.roles.cache.get(roleId) ?? (await interaction.guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      await interaction.reply({ content: "⚠️ That role doesn't seem to exist anymore.", ephemeral: true });
      return;
    }
    await boosterLinkManager.unlink(interaction.guildId, user.id, role.id);
    await interaction.reply({
      content: `✅ Stopped tracking ${role} for ${user}. The role itself was **not** removed from them.`,
      ephemeral: true,
    });
    return;
  }

  const removedCount = await boosterLinkManager.unlink(interaction.guildId, user.id, null);

  if (removedCount === 0) {
    await interaction.reply({ content: `${user} had no tracked custom roles.`, ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `✅ Stopped tracking all ${removedCount} custom role(s) linked to ${user}. The roles themselves were **not** removed from them.`,
    ephemeral: true,
  });
}

module.exports = { handleRemove };

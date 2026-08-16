const boosterLinkManager = require('../../../features/boosterlinks/boosterLinkManager');
const { isMod } = require('../../../utils/modRole');

async function handleRemove(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({
      content: '❌ You need to be a Mod or Admin to use this command.',
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.options.getString('user');
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await interaction.reply({ content: "⚠️ Couldn't find that user anymore.", ephemeral: true });
    return;
  }
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

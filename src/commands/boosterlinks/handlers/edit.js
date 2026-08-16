const boosterLinkManager = require('../../../features/boosterlinks/boosterLinkManager');
const { isMod } = require('../../../utils/modRole');

// Re-points an existing link to a different role (or a different user), without
// needing a separate unlink + link. Under the hood this is just "stop tracking the old
// role, start tracking the new one" — done in one step for convenience.
async function handleEdit(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const userId = interaction.options.getString('user');
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await interaction.reply({ content: "⚠️ Couldn't find that user anymore.", ephemeral: true });
    return;
  }
  const oldRoleId = interaction.options.getString('old_role');
  const newRole = interaction.options.getRole('new_role');

  const oldRole = interaction.guild.roles.cache.get(oldRoleId) ?? (await interaction.guild.roles.fetch(oldRoleId).catch(() => null));
  if (!oldRole) {
    await interaction.reply({ content: "⚠️ That role doesn't seem to exist anymore.", ephemeral: true });
    return;
  }

  const existingLinks = await boosterLinkManager.listForUser(interaction.guildId, user.id);
  const hasOldLink = existingLinks.some((l) => l.role_id === oldRole.id);
  if (!hasOldLink) {
    await interaction.reply({ content: `⚠️ ${user} doesn't have ${oldRole} tracked — nothing to edit.`, ephemeral: true });
    return;
  }

  try {
    await boosterLinkManager.unlink(interaction.guildId, user.id, oldRole.id);
    await boosterLinkManager.link(interaction.guild, user.id, newRole, interaction.user.id);
  } catch (err) {
    if (err instanceof boosterLinkManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content: `✅ Updated: ${user} is now tracked with ${newRole} instead of ${oldRole}.`,
    ephemeral: true,
  });
}

module.exports = { handleEdit };

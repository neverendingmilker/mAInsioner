const { PermissionFlagsBits } = require('discord.js');
const verifyManager = require('../../../features/verify/verifyManager');

async function handleTotalRoles(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const roles = [1, 2, 3, 4, 5, 6]
    .map((n) => interaction.options.getRole(`role_${n}`))
    .filter(Boolean);
  const defaultRole = interaction.options.getRole('default_role');

  const uniqueRoleIds = [...new Set(roles.map((r) => r.id))];
  if (uniqueRoleIds.length !== roles.length) {
    await interaction.reply({ content: '⚠️ The same role was listed more than once — list each role only once.', ephemeral: true });
    return;
  }

  await verifyManager.setTotalRoles(interaction.guildId, uniqueRoleIds);
  await verifyManager.setConfig(interaction.guildId, { defaultTotalRole: defaultRole.id });

  const rolesList = roles.map((r) => `${r}`).join(', ');
  await interaction.reply({
    content:
      `✅ \`/verify sub\` will now check for: ${rolesList}. ` +
      `If a member has none of those, they'll automatically get ${defaultRole}.`,
    ephemeral: true,
  });
}

module.exports = { handleTotalRoles };

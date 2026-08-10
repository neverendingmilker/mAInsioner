const { PermissionFlagsBits } = require('discord.js');
const warningManager = require('../../../features/warning/warningManager');

async function handleRoles(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ content: '❌ You need the "Moderate Members" permission to use this command.', ephemeral: true });
    return;
  }

  const role1 = interaction.options.getRole('role_1');
  const role2 = interaction.options.getRole('role_2');

  try {
    await warningManager.setRoles(interaction.guild, role1, role2);
  } catch (err) {
    if (err instanceof warningManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content: `✅ \`/warning give\` will now let you choose between ${role1} and ${role2}.`,
    ephemeral: true,
  });
}

module.exports = { handleRoles };

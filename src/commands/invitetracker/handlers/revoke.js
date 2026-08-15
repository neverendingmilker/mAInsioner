const { PermissionFlagsBits } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');

async function handleRevoke(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const code = interaction.options.getString('code');
  await interaction.deferReply({ ephemeral: true });
  await inviteTrackerManager.revokeAssignedInvite(interaction.guild, code);

  await interaction.editReply({ content: `✅ **${code}** has been deleted and is no longer assigned to anyone.` });
}

module.exports = { handleRevoke };

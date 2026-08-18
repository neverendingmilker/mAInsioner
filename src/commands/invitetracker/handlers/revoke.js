const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');
const { isMod } = require('../../../utils/modRole');

// Mod-only, full stop — including for your own self-made invite (create_self's error
// message points people at a Mod for that, rather than at this command themselves).
async function handleRevoke(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to revoke an invite.', ephemeral: true });
    return;
  }

  const code = interaction.options.getString('code');

  await interaction.deferReply({ ephemeral: true });
  await inviteTrackerManager.revokeAssignedInvite(interaction.guild, code);

  await interaction.editReply({ content: `✅ **${code}** has been deleted and is no longer assigned to anyone.` });
}

module.exports = { handleRevoke };

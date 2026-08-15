const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');
const { isMod } = require('../../../utils/modRole');

async function handleRevoke(interaction) {
  const code = interaction.options.getString('code');

  if (!isMod(interaction.member)) {
    const assignedUserId = await inviteTrackerManager.getAssignedUser(interaction.guildId, code);
    if (assignedUserId !== interaction.user.id) {
      await interaction.reply({ content: "❌ You can only revoke your own invite — ask a Mod/Admin for anyone else's.", ephemeral: true });
      return;
    }
  }

  await interaction.deferReply({ ephemeral: true });
  await inviteTrackerManager.revokeAssignedInvite(interaction.guild, code);

  await interaction.editReply({ content: `✅ **${code}** has been deleted and is no longer assigned to anyone.` });
}

module.exports = { handleRevoke };

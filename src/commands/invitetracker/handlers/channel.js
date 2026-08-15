const { PermissionFlagsBits } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');

async function handleChannel(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  await interaction.deferReply({ ephemeral: true });
  await inviteTrackerManager.setDefaultChannel(interaction.guildId, channel.id);

  const botMember = interaction.guild.members.me;
  const canInvite = botMember && channel.permissionsFor(botMember)?.has(PermissionFlagsBits.CreateInstantInvite);

  await interaction.editReply({
    content:
      `✅ New invites from \`/invites create\` and \`/invites create_self\` will now open into ${channel}.` +
      (canInvite ? '' : ' ⚠️ Heads up: I don\'t currently have "Create Invite" permission there — grant it or invites will fail.'),
  });
}

module.exports = { handleChannel };

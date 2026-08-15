const { PermissionFlagsBits } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');

async function handleCreate(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');
  const channel = interaction.options.getChannel('channel');
  const maxUses = interaction.options.getInteger('max_uses');
  const expiresInHours = interaction.options.getInteger('expires_in_hours');

  try {
    const invite = await inviteTrackerManager.createAssignedInvite(
      interaction.guild,
      channel,
      user,
      { maxUses: maxUses ?? undefined, maxAgeSeconds: expiresInHours != null ? expiresInHours * 3600 : undefined },
      interaction.user.id
    );

    await interaction.reply({
      content:
        `✅ Created **https://discord.gg/${invite.code}** into ${channel}, credited to ${user} — every join through it counts ` +
        `towards their invite stats, no matter who actually clicks it.` +
        (maxUses ? ` Max uses: ${maxUses}.` : '') +
        (expiresInHours ? ` Expires in ${expiresInHours}h.` : ' Never expires.'),
      ephemeral: true,
    });
  } catch (err) {
    if (err instanceof inviteTrackerManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }
}

module.exports = { handleCreate };

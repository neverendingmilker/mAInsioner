const { PermissionFlagsBits } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');

// Open to everyone (no Mod check) — but always for yourself, only one at a time, and
// always with default settings (unlimited uses, never expires) into the configured
// channel. No options at all — for a different user, custom limits/expiry, or crediting
// an invite made elsewhere, Mods/Admin use `/invites create` instead.

async function handleCreateSelf(interaction) {
  try {
    const activeOwn = await inviteTrackerManager.getActiveOwnInvite(interaction.guild, interaction.user.id);
    if (activeOwn) {
      throw new inviteTrackerManager.ValidationError(
        `You already have your own invite — **https://discord.gg/${activeOwn}**. Ask a Mod to revoke it with \`/invites revoke\` before making another.`
      );
    }

    const channel = await inviteTrackerManager.resolveTargetChannel(interaction.guild);

    const memberPerms = channel.permissionsFor(interaction.member);
    if (!memberPerms?.has(PermissionFlagsBits.CreateInstantInvite)) {
      // Stops this being a backdoor into a channel the member couldn't normally invite
      // people to themselves — the bot having the permission alone isn't enough here.
      throw new inviteTrackerManager.ValidationError('You need the "Create Invite" permission in that channel yourself to make an invite there.');
    }

    const invite = await inviteTrackerManager.createAssignedInvite(interaction.guild, channel, interaction.user, {}, interaction.user.id);

    await interaction.reply({
      content: `✅ Your invite is **https://discord.gg/${invite.code}** — every join through it counts towards your own invite stats. Unlimited uses, never expires.`,
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

module.exports = { handleCreateSelf };

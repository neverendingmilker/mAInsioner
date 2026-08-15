const { PermissionFlagsBits } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');
const { resolveMaxAgeSeconds, extractInviteCode } = require('./expiryHelpers');

// Open to everyone (no Mod check) — but always for yourself, and only one at a time.
// Mods/Admin who want to hand out an invite to someone ELSE, or make more than one, use
// `/invites create` instead.

async function handleCreateSelfNew(interaction, channel) {
  const memberPerms = channel.permissionsFor(interaction.member);
  if (!memberPerms?.has(PermissionFlagsBits.CreateInstantInvite)) {
    // Stops this being a backdoor into channels the member couldn't normally invite
    // people to themselves — the bot having the permission alone isn't enough here.
    throw new inviteTrackerManager.ValidationError('You need the "Create Invite" permission in that channel yourself to make an invite there.');
  }

  const maxUses = interaction.options.getInteger('max_uses');
  const expiresInHours = interaction.options.getInteger('expires_in_hours');
  const expiresAt = interaction.options.getString('expires_at');

  const { maxAgeSeconds, expiresAtDate } = resolveMaxAgeSeconds(expiresInHours, expiresAt);

  const invite = await inviteTrackerManager.createAssignedInvite(
    interaction.guild,
    channel,
    interaction.user,
    { maxUses: maxUses ?? undefined, maxAgeSeconds },
    interaction.user.id
  );

  const expiryText = expiresAtDate ? ` Expires <t:${Math.floor(expiresAtDate.getTime() / 1000)}:R>.` : ' Never expires.';

  await interaction.reply({
    content:
      `✅ Your invite is **https://discord.gg/${invite.code}** — every join through it counts towards your own invite stats.` +
      (maxUses ? ` Max uses: ${maxUses}.` : '') +
      expiryText,
    ephemeral: true,
  });
}

async function handleCreateSelfExisting(interaction, rawCode) {
  const disallowed = ['channel', 'max_uses', 'expires_in_hours', 'expires_at'].filter((name) => interaction.options.get(name));
  if (disallowed.length > 0) {
    throw new inviteTrackerManager.ValidationError(
      `\`code\` credits an invite you already made — its settings are already fixed, so ${disallowed.map((n) => `\`${n}\``).join(', ')} ${disallowed.length === 1 ? "doesn't" : "don't"} apply here.`
    );
  }

  const code = extractInviteCode(rawCode);
  const invite = await inviteTrackerManager.assignExistingInvite(interaction.guild, code, interaction.user, interaction.user.id);

  await interaction.reply({
    content:
      `✅ **https://discord.gg/${invite.code}** is now credited to you. Only joins from now on count — any uses it already had ` +
      `before this weren't logged, so they're not retroactively counted.`,
    ephemeral: true,
  });
}

async function handleCreateSelf(interaction) {
  const channel = interaction.options.getChannel('channel');
  const existingCode = interaction.options.getString('code');

  try {
    const activeOwn = await inviteTrackerManager.getActiveOwnInvite(interaction.guild, interaction.user.id);
    if (activeOwn) {
      throw new inviteTrackerManager.ValidationError(
        `You already have your own invite — **https://discord.gg/${activeOwn}**. Revoke it with \`/invites revoke\` before making another.`
      );
    }

    if (existingCode) {
      await handleCreateSelfExisting(interaction, existingCode);
      return;
    }

    if (!channel) {
      throw new inviteTrackerManager.ValidationError('`channel` is required unless you set `code` to credit yourself with one you already made.');
    }

    await handleCreateSelfNew(interaction, channel);
  } catch (err) {
    if (err instanceof inviteTrackerManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }
}

module.exports = { handleCreateSelf };

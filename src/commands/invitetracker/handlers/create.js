const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');
const { isMod } = require('../../../utils/modRole');
const { resolveMaxAgeSeconds, extractInviteCode } = require('./expiryHelpers');

// Mod/Admin only — makes or assigns an invite for ANY user, with no limit on how many.
// Regular members use the separate `/invites create_self` instead (self only, one at a
// time) — kept as its own command rather than a permission branch inside this one so the
// two use cases don't look identical until you hit a permission error trying the "wrong" one.

async function handleCreateNew(interaction, user, channel) {
  const maxUses = interaction.options.getInteger('max_uses');
  const expiresInHours = interaction.options.getInteger('expires_in_hours');
  const expiresAt = interaction.options.getString('expires_at');

  const { maxAgeSeconds, expiresAtDate } = resolveMaxAgeSeconds(expiresInHours, expiresAt);

  const invite = await inviteTrackerManager.createAssignedInvite(
    interaction.guild,
    channel,
    user,
    { maxUses: maxUses ?? undefined, maxAgeSeconds },
    interaction.user.id
  );

  const expiryText = expiresAtDate ? ` Expires <t:${Math.floor(expiresAtDate.getTime() / 1000)}:R>.` : ' Never expires.';

  await interaction.reply({
    content:
      `✅ Created **https://discord.gg/${invite.code}** into ${channel}, credited to ${user} — every join through it counts ` +
      `towards their invite stats, no matter who actually clicks it.` +
      (maxUses ? ` Max uses: ${maxUses}.` : '') +
      expiryText,
    ephemeral: true,
  });
}

async function handleAssignExisting(interaction, user, rawCode) {
  const disallowed = ['max_uses', 'expires_in_hours', 'expires_at'].filter((name) => interaction.options.get(name));
  if (disallowed.length > 0) {
    throw new inviteTrackerManager.ValidationError(
      `\`code\` assigns an invite you already made — its settings are already fixed, so ${disallowed.map((n) => `\`${n}\``).join(', ')} ${disallowed.length === 1 ? "doesn't" : "don't"} apply here.`
    );
  }

  const code = extractInviteCode(rawCode);
  const invite = await inviteTrackerManager.assignExistingInvite(interaction.guild, code, user, interaction.user.id);

  await interaction.reply({
    content:
      `✅ **https://discord.gg/${invite.code}** is now credited to ${user}. Only joins from now on count — any uses it already ` +
      `had before this weren't logged, so they're not retroactively counted.`,
    ephemeral: true,
  });
}

async function handleCreate(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({
      content: '❌ You need to be a Mod or Admin to create an invite for someone else — use `/invites create_self` for your own.',
      ephemeral: true,
    });
    return;
  }

  const user = interaction.options.getUser('user');
  const existingCode = interaction.options.getString('code');

  try {
    if (existingCode) {
      await handleAssignExisting(interaction, user, existingCode);
      return;
    }

    const channel = await inviteTrackerManager.resolveTargetChannel(interaction.guild);
    await handleCreateNew(interaction, user, channel);
  } catch (err) {
    if (err instanceof inviteTrackerManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }
}

module.exports = { handleCreate };

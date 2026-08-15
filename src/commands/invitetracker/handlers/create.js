const { PermissionFlagsBits } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');
const config = require('../../../config/config');
const { zonedTimeToUtc } = require('../../../utils/timezoneDate');

const EXPIRES_AT_FORMAT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

// `expires_in_hours` and `expires_at` are two ways to say the same thing (Discord's API
// only understands a duration in seconds, not an absolute date) — this resolves either
// one into the seconds-from-now value createAssignedInvite actually wants, throwing a
// ValidationError for anything that can't be turned into a valid future duration.
function resolveMaxAgeSeconds(expiresInHours, expiresAt) {
  if (expiresInHours != null && expiresAt) {
    throw new inviteTrackerManager.ValidationError('Specify either `expires_in_hours` or `expires_at`, not both.');
  }

  if (expiresInHours != null) {
    return { maxAgeSeconds: expiresInHours * 3600, expiresAtDate: new Date(Date.now() + expiresInHours * 3600 * 1000) };
  }

  if (expiresAt) {
    const match = expiresAt.trim().match(EXPIRES_AT_FORMAT);
    if (!match) {
      throw new inviteTrackerManager.ValidationError(
        '`expires_at` has to look like `YYYY-MM-DD HH:mm` (e.g. `2026-08-20 18:00`), in Europe/Rome time.'
      );
    }
    const [, year, month, day, hour, minute] = match;
    const expiresAtDate = zonedTimeToUtc(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, config.timezone);
    const maxAgeSeconds = Math.round((expiresAtDate.getTime() - Date.now()) / 1000);
    if (maxAgeSeconds <= 0) {
      throw new inviteTrackerManager.ValidationError('That date/time is in the past.');
    }
    return { maxAgeSeconds, expiresAtDate };
  }

  return { maxAgeSeconds: undefined, expiresAtDate: null };
}

// Accepts a bare code ("abc123"), a full link ("https://discord.gg/abc123"), or one
// with the old-style path ("https://discord.com/invite/abc123") and returns just the code.
function extractInviteCode(input) {
  const trimmed = input.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const segments = trimmed.split('/');
  return segments[segments.length - 1].split('?')[0];
}

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
  const disallowed = ['channel', 'max_uses', 'expires_in_hours', 'expires_at'].filter((name) => interaction.options.get(name));
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
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');
  const channel = interaction.options.getChannel('channel');
  const existingCode = interaction.options.getString('code');

  try {
    if (existingCode) {
      await handleAssignExisting(interaction, user, existingCode);
      return;
    }

    if (!channel) {
      throw new inviteTrackerManager.ValidationError('`channel` is required when creating a new invite (omit it only when using `code` to assign one you already made).');
    }

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

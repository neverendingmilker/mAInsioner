const { SlashCommandBuilder, PermissionFlagsBits, OverwriteType, EmbedBuilder, MessageFlags } = require('discord.js');

// Discord's own documented list of permissions that are blocked for an account without
// 2FA enabled, when the server has "Require 2FA for moderator actions" turned on. This
// is a fixed list Discord defines — not something a bot or server owner can change.
// Notably, some things people assume are "mod permissions" are NOT on it (View Audit
// Log, Manage Emojis and Stickers, Manage Nicknames, Moderate Members/timeout).
const MFA_PERMISSIONS = [
  { flag: PermissionFlagsBits.Administrator, label: 'Administrator' },
  { flag: PermissionFlagsBits.KickMembers, label: 'Kick Members' },
  { flag: PermissionFlagsBits.BanMembers, label: 'Ban Members' },
  { flag: PermissionFlagsBits.ManageGuild, label: 'Manage Server' },
  { flag: PermissionFlagsBits.ManageRoles, label: 'Manage Roles' },
  { flag: PermissionFlagsBits.ManageChannels, label: 'Manage Channels' },
  { flag: PermissionFlagsBits.ManageMessages, label: 'Manage Messages' },
  { flag: PermissionFlagsBits.ManageWebhooks, label: 'Manage Webhooks' },
  { flag: PermissionFlagsBits.ManageThreads, label: 'Manage Threads' },
  { flag: PermissionFlagsBits.MuteMembers, label: 'Mute Members' },
  { flag: PermissionFlagsBits.DeafenMembers, label: 'Deafen Members' },
  { flag: PermissionFlagsBits.MoveMembers, label: 'Move Members' },
];

const MAX_CHANNELS_SHOWN_PER_ROLE = 10;

const data = new SlashCommandBuilder()
  .setName('2faroles')
  .setDescription('[Admin] Lists roles that have permissions requiring 2FA for moderation')
  .addBooleanOption((opt) =>
    opt.setName('ignore_bots').setDescription("Skip bots' own auto-created roles and their overrides (default: false)").setRequired(false)
  );

async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

  const ignoreBots = interaction.options.getBoolean('ignore_bots') ?? false;

  const roles = [...interaction.guild.roles.cache.values()]
    .filter((r) => !ignoreBots || !r.tags?.botId)
    .sort((a, b) => b.position - a.position);

  // Base (server-wide) permissions, from each role's own settings.
  const baseHeldByRoleId = new Map(); // roleId -> string[] of labels
  for (const role of roles) {
    const held = MFA_PERMISSIONS.filter((p) => role.permissions.has(p.flag)).map((p) => p.label);
    if (held.length > 0) baseHeldByRoleId.set(role.id, held);
  }

  // Per-channel overrides that ALLOW an MFA permission for a role — this is how a role
  // can end up with a 2FA-gated permission in one specific channel without it showing
  // up anywhere in its base permissions (a common, easy-to-miss misconfiguration).
  // Skips anything the role already has server-wide, since re-flagging that per channel
  // wouldn't be new information.
  const overridesByRoleId = new Map(); // roleId -> Array<{ channelName, labels }>
  for (const channel of interaction.guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if (overwrite.type !== OverwriteType.Role) continue;
      if (ignoreBots && interaction.guild.roles.cache.get(overwrite.id)?.tags?.botId) continue;
      const baseHeld = new Set(baseHeldByRoleId.get(overwrite.id) ?? []);
      const grantedHere = MFA_PERMISSIONS.filter((p) => overwrite.allow.has(p.flag) && !baseHeld.has(p.label));
      if (grantedHere.length === 0) continue;
      if (!overridesByRoleId.has(overwrite.id)) overridesByRoleId.set(overwrite.id, []);
      overridesByRoleId.get(overwrite.id).push({ channelName: channel.name, labels: grantedHere.map((p) => p.label) });
    }
  }

  const relevantRoleIds = new Set([...baseHeldByRoleId.keys(), ...overridesByRoleId.keys()]);
  const matches = roles.filter((r) => relevantRoleIds.has(r.id));

  if (matches.length === 0) {
    await interaction.reply({
      content: '✅ No role in this server currently has any permission that requires 2FA for moderation — server-wide or via a channel override.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Roles with 2FA-required permissions')
    .setDescription(
      'These are the permissions that Discord itself blocks for an account without 2FA enabled, if this server turns on ' +
        '"Require 2FA for moderator actions" (Server Settings → Safety Setup). Includes permissions granted only via a ' +
        "per-channel override, not just a role's server-wide settings — those are the easiest to miss."
    );

  for (const role of matches.slice(0, 25)) {
    const heldPermissions = baseHeldByRoleId.get(role.id) ?? [];
    const overrides = overridesByRoleId.get(role.id) ?? [];

    const lines = [];
    if (heldPermissions.length > 0) {
      // Administrator implicitly grants every other permission, so listing all 12 next
      // to it would just be noise — the label alone already says everything.
      lines.push(heldPermissions.includes('Administrator') ? 'Administrator *(implies every other permission)*' : heldPermissions.join(', '));
    }
    if (overrides.length > 0) {
      const overrideLines = overrides
        .slice(0, MAX_CHANNELS_SHOWN_PER_ROLE)
        .map((o) => `#${o.channelName}: ${o.labels.join(', ')}`);
      if (overrides.length > MAX_CHANNELS_SHOWN_PER_ROLE) {
        overrideLines.push(`...and ${overrides.length - MAX_CHANNELS_SHOWN_PER_ROLE} more channel(s)`);
      }
      lines.push(`⚠️ **Channel overrides:**\n${overrideLines.join('\n')}`);
    }

    embed.addFields({ name: role.name, value: lines.join('\n').slice(0, 1024) });
  }
  if (matches.length > 25) {
    embed.setFooter({ text: `...and ${matches.length - 25} more role(s) not shown.` });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };

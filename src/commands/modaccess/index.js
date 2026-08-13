const { SlashCommandBuilder, PermissionFlagsBits, OverwriteType, EmbedBuilder, MessageFlags } = require('discord.js');

// A broader, less formally-defined list than /mfaroles' Discord-mandated 2FA set —
// includes permissions commonly THOUGHT of as "moderator-level" that Discord's 2FA
// requirement doesn't actually cover (View Audit Log, Manage Nicknames, Manage
// Expressions, Timeout Members).
const MOD_PERMISSIONS = [
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
  { flag: PermissionFlagsBits.ViewAuditLog, label: 'View Audit Log' },
  { flag: PermissionFlagsBits.ManageNicknames, label: 'Manage Nicknames' },
  { flag: PermissionFlagsBits.ManageGuildExpressions, label: 'Manage Expressions (emoji/stickers/sounds)' },
  { flag: PermissionFlagsBits.ModerateMembers, label: 'Timeout Members' },
];

const MAX_ENTRIES_SHOWN_PER_ROW = 10;
const MAX_FIELDS = 25;

const data = new SlashCommandBuilder()
  .setName('modaccess')
  .setDescription('[Admin] Lists roles/people with permissions commonly considered moderator-level')
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
    .filter((r) => !ignoreBots || !r.tags?.botId) // a bot's own auto-created role carries its botId here
    .sort((a, b) => b.position - a.position);

  // Base (server-wide) permissions, from each role's own settings.
  const baseHeldByRoleId = new Map(); // roleId -> string[] of labels
  for (const role of roles) {
    const held = MOD_PERMISSIONS.filter((p) => role.permissions.has(p.flag)).map((p) => p.label);
    if (held.length > 0) baseHeldByRoleId.set(role.id, held);
  }

  // Per-channel overrides — both ROLE-targeted (like /mfaroles checks) AND
  // MEMBER-targeted: an individual person granted a permission on just one channel,
  // which a role-only audit would never catch.
  const roleOverridesByRoleId = new Map(); // roleId -> Array<{ channelName, labels }>
  const memberOverridesByUserId = new Map(); // userId -> { displayName, entries: Array<{ channelName, labels }> }

  for (const channel of interaction.guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if (overwrite.type === OverwriteType.Role) {
        if (ignoreBots && interaction.guild.roles.cache.get(overwrite.id)?.tags?.botId) continue;

        const baseHeld = new Set(baseHeldByRoleId.get(overwrite.id) ?? []);
        const grantedHere = MOD_PERMISSIONS.filter((p) => overwrite.allow.has(p.flag) && !baseHeld.has(p.label));
        if (grantedHere.length === 0) continue;

        if (!roleOverridesByRoleId.has(overwrite.id)) roleOverridesByRoleId.set(overwrite.id, []);
        roleOverridesByRoleId.get(overwrite.id).push({ channelName: channel.name, labels: grantedHere.map((p) => p.label) });
      } else if (overwrite.type === OverwriteType.Member) {
        const member = interaction.guild.members.cache.get(overwrite.id);
        if (ignoreBots && member?.user?.bot) continue;

        const grantedHere = MOD_PERMISSIONS.filter((p) => overwrite.allow.has(p.flag));
        if (grantedHere.length === 0) continue;

        const displayName = member ? member.user.username : overwrite.id;
        if (!memberOverridesByUserId.has(overwrite.id)) memberOverridesByUserId.set(overwrite.id, { displayName, entries: [] });
        memberOverridesByUserId.get(overwrite.id).entries.push({ channelName: channel.name, labels: grantedHere.map((p) => p.label) });
      }
    }
  }

  const relevantRoleIds = new Set([...baseHeldByRoleId.keys(), ...roleOverridesByRoleId.keys()]);
  const roleMatches = roles.filter((r) => relevantRoleIds.has(r.id));
  const memberMatches = [...memberOverridesByUserId.entries()];

  if (roleMatches.length === 0 && memberMatches.length === 0) {
    await interaction.reply({
      content: '✅ No role or individual member in this server currently has any permission commonly considered moderator-level.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Roles & individual members with moderator-level permissions')
    .setDescription(
      "A broader check than `/mfaroles` — includes permissions commonly thought of as \"mod-only\" that Discord's 2FA " +
        "requirement doesn't actually cover (View Audit Log, Manage Nicknames, Manage Expressions, Timeout). Also checks " +
        'per-channel overrides granted to an **individual person** directly, not just roles — those appear as their own entries below (👤).'
    );

  let fieldCount = 0;
  for (const role of roleMatches) {
    if (fieldCount >= MAX_FIELDS) break;
    const heldPermissions = baseHeldByRoleId.get(role.id) ?? [];
    const overrides = roleOverridesByRoleId.get(role.id) ?? [];

    const lines = [];
    if (heldPermissions.length > 0) {
      // Administrator implicitly grants every other permission, so listing all of them
      // next to it would just be noise — the label alone already says everything.
      lines.push(heldPermissions.includes('Administrator') ? 'Administrator *(implies every other permission)*' : heldPermissions.join(', '));
    }
    if (overrides.length > 0) {
      const overrideLines = overrides
        .slice(0, MAX_ENTRIES_SHOWN_PER_ROW)
        .map((o) => `#${o.channelName}: ${o.labels.join(', ')}`);
      if (overrides.length > MAX_ENTRIES_SHOWN_PER_ROW) {
        overrideLines.push(`...and ${overrides.length - MAX_ENTRIES_SHOWN_PER_ROW} more channel(s)`);
      }
      lines.push(`⚠️ **Channel overrides:**\n${overrideLines.join('\n')}`);
    }

    embed.addFields({ name: `🎭 ${role.name}`, value: lines.join('\n').slice(0, 1024) });
    fieldCount++;
  }

  for (const [, { displayName, entries }] of memberMatches) {
    if (fieldCount >= MAX_FIELDS) break;
    const entryLines = entries.slice(0, MAX_ENTRIES_SHOWN_PER_ROW).map((e) => `#${e.channelName}: ${e.labels.join(', ')}`);
    if (entries.length > MAX_ENTRIES_SHOWN_PER_ROW) {
      entryLines.push(`...and ${entries.length - MAX_ENTRIES_SHOWN_PER_ROW} more channel(s)`);
    }
    embed.addFields({ name: `👤 ${displayName} (individual override)`, value: entryLines.join('\n').slice(0, 1024) });
    fieldCount++;
  }

  const totalMatches = roleMatches.length + memberMatches.length;
  if (totalMatches > MAX_FIELDS) {
    embed.setFooter({ text: `...and ${totalMatches - MAX_FIELDS} more entries not shown.` });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };

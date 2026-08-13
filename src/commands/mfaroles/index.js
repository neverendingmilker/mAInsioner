const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

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

const data = new SlashCommandBuilder()
  .setName('mfaroles')
  .setDescription('[Admin] Lists roles that have permissions requiring 2FA for moderation');

async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

  const roles = [...interaction.guild.roles.cache.values()].sort((a, b) => b.position - a.position);

  const matches = [];
  for (const role of roles) {
    const heldPermissions = MFA_PERMISSIONS.filter((p) => role.permissions.has(p.flag)).map((p) => p.label);
    if (heldPermissions.length > 0) {
      matches.push({ role, heldPermissions });
    }
  }

  if (matches.length === 0) {
    await interaction.reply({
      content: '✅ No role in this server currently has any permission that requires 2FA for moderation.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Roles with 2FA-required permissions')
    .setDescription(
      "These are the permissions that Discord itself blocks for an account without 2FA enabled, if this server turns on " +
        '"Require 2FA for moderator actions" (Server Settings → Safety Setup). This only checks each role\'s own ' +
        "permissions — a permission granted only as a per-channel override won't show up here."
    );

  for (const { role, heldPermissions } of matches.slice(0, 25)) {
    // Administrator implicitly grants every other permission, so listing all 12 next to
    // it would just be noise — the label alone already says everything.
    const value = heldPermissions.includes('Administrator') ? 'Administrator *(implies every other permission on this list)*' : heldPermissions.join(', ');
    embed.addFields({ name: role.name, value });
  }
  if (matches.length > 25) {
    embed.setFooter({ text: `...and ${matches.length - 25} more role(s) not shown.` });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { data, execute };

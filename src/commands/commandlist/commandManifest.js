const { PermissionFlagsBits } = require('discord.js');

// Hand-maintained reference of every slash command (and subcommand) the bot exposes,
// with the access tier actually enforced in code:
//   ADMIN     — requires the "Administrator" permission
//   MOD       — requires an elevated-but-not-full-admin permission (Manage Roles,
//               Manage Server, or Moderate Members) — typically what a dedicated
//               moderator role would be granted
//   EVERYONE  — no permission check; any member can use it
//
// `permission` is the literal PermissionFlagsBits value actually checked in code (null
// for EVERYONE), used by /commandlist to test it against the real "mod" role in the
// server it's run in, rather than just repeating the static tier label.
//
// Keep this in sync by hand whenever a command's permission requirements change —
// there's no way to derive it automatically, since some of it lives in per-subcommand
// inline checks rather than a single declarative place.

const ADMIN = 'Admin';
const MOD = 'Mod';
const EVERYONE = 'Everyone';

// The user's own moderator role — referenced whenever "the mod role" comes up.
const MOD_ROLE_ID = '1090658915810820156';

const COMMAND_MANIFEST = [
  {
    feature: 'Anime Night',
    command: '/animenight',
    subcommands: [
      { name: 'add', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'last', tier: EVERYONE, permission: null },
      { name: 'edit', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Birthday',
    command: '/birthday',
    subcommands: [
      { name: 'add', tier: EVERYONE, permission: null, note: 'Admin to set for someone else' },
      { name: 'remove', tier: EVERYONE, permission: null, note: "Admin to remove someone else's" },
      { name: 'config', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Booster Links',
    command: '/boosterlink',
    subcommands: [
      { name: 'link', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'unlink', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'list', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'exempt add/remove/list', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Combined Role Search',
    command: '/comboroles',
    subcommands: [
      { name: 'search', tier: EVERYONE, permission: null },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
    ],
  },
  {
    feature: 'Command List',
    command: '/commandlist',
    subcommands: [{ name: '(the command itself)', tier: EVERYONE, permission: null }],
  },
  {
    feature: 'Disable Feature',
    command: '/disablefeature',
    subcommands: [{ name: '(the command itself)', tier: ADMIN, permission: PermissionFlagsBits.Administrator }],
  },
  {
    feature: 'GoosePizza',
    command: '/goosepizza',
    subcommands: [
      { name: 'create', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'edit', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'channels', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'remove', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'list', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
    ],
  },
  {
    feature: 'Incident',
    command: '/incident',
    subcommands: [
      { name: 'channel', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'setnumber', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'reset', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Role Links',
    command: '/rolelink',
    subcommands: [
      { name: 'link', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'unlink', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'list', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Starboard',
    command: '/starboard',
    subcommands: [
      { name: 'create', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'edit', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'remove', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'list', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'lookback', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageGuild },
    ],
  },
  {
    feature: 'Sticky Messages',
    command: '/sticky',
    subcommands: [
      { name: 'add', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'remove', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Suggestions',
    command: '/suggestion',
    subcommands: [
      { name: 'add', tier: EVERYONE, permission: null },
      { name: 'edit', tier: EVERYONE, permission: null, note: 'own pending suggestions only' },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'approve', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'reject', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'channel set/remove', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Verbal',
    command: '/verbal',
    subcommands: [
      {
        name: '(the command itself)',
        tier: MOD,
        permission: PermissionFlagsBits.ModerateMembers,
        note: 'shares state with /warning',
      },
    ],
  },
  {
    feature: 'Verification',
    command: '/verify',
    subcommands: [
      { name: 'config', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      {
        name: 'sub',
        tier: MOD,
        permission: PermissionFlagsBits.ManageRoles,
        note: 'or the role set via /verify config allowedrole',
        verifyAllowedRoleCheck: true,
      },
      {
        name: 'domme',
        tier: MOD,
        permission: PermissionFlagsBits.ManageRoles,
        note: 'or the role set via /verify config allowedrole',
        verifyAllowedRoleCheck: true,
      },
      {
        name: 'maledom',
        tier: MOD,
        permission: PermissionFlagsBits.ManageRoles,
        note: 'or the role set via /verify config allowedrole',
        verifyAllowedRoleCheck: true,
      },
      {
        name: 'edit',
        tier: MOD,
        permission: PermissionFlagsBits.ManageRoles,
        note: 'or the role set via /verify config allowedrole',
        verifyAllowedRoleCheck: true,
      },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Warnings',
    command: '/warning',
    subcommands: [
      { name: 'give', tier: MOD, permission: PermissionFlagsBits.ModerateMembers },
      { name: 'roles', tier: MOD, permission: PermissionFlagsBits.ModerateMembers },
      { name: 'channel', tier: MOD, permission: PermissionFlagsBits.ModerateMembers },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ModerateMembers },
    ],
  },
];

module.exports = { ADMIN, MOD, EVERYONE, MOD_ROLE_ID, COMMAND_MANIFEST };

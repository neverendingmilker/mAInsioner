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
      { name: 'add', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'remove', tier: ADMIN, permission: PermissionFlagsBits.Administrator, note: 'removes a single entry' },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'last', tier: EVERYONE, permission: null },
      { name: 'edit', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Birthday',
    command: '/birthday',
    subcommands: [
      { name: 'add', tier: EVERYONE, permission: null, note: 'Mod to set for someone else' },
      { name: 'edit', tier: EVERYONE, permission: null, note: 'Mod to edit someone else\'s' },
      { name: 'remove', tier: EVERYONE, permission: null, note: "Mod to remove someone else's" },
      { name: 'config', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Booster Links',
    command: '/boosterlink',
    subcommands: [
      { name: 'add', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'remove', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'edit', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'list', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'exempt add/remove/list', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'disable', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
    ],
  },
  {
    feature: 'Combined Role Search',
    command: '/comboroles',
    subcommands: [
      { name: 'search', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Command List',
    command: '/commandlist',
    subcommands: [{ name: '(the command itself)', tier: MOD, permission: PermissionFlagsBits.ManageRoles }],
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
      { name: 'add', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'edit', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'channels', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'remove', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'list', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Incident',
    command: '/incident',
    subcommands: [
      { name: 'channel', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'set', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'reset', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Post Limit',
    command: '/postlimit',
    subcommands: [
      { name: 'add', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'remove', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'list', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Role Links',
    command: '/rolelink',
    subcommands: [
      { name: 'add', tier: ADMIN, permission: PermissionFlagsBits.Administrator, note: 'picks one or more target roles' },
      { name: 'remove', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'edit', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'list', tier: MOD, permission: PermissionFlagsBits.ManageRoles },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Starboard',
    command: '/starboard',
    subcommands: [
      { name: 'add', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'edit', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'remove', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'lookback', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Sticky Messages',
    command: '/sticky',
    subcommands: [
      { name: 'add', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'edit', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'remove', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
  {
    feature: 'Sticky: Add (right-click)',
    command: 'Sticky: Add',
    subcommands: [
      { name: '(the command itself)', tier: ADMIN, permission: PermissionFlagsBits.Administrator, note: 'right-click a message -> Apps' },
    ],
  },
  {
    feature: 'Sticky: Edit (right-click)',
    command: 'Sticky: Edit',
    subcommands: [
      { name: '(the command itself)', tier: ADMIN, permission: PermissionFlagsBits.Administrator, note: 'right-click a message -> Apps; opens a modal' },
    ],
  },
  {
    feature: 'Sticky: Remove (right-click)',
    command: 'Sticky: Remove',
    subcommands: [
      { name: '(the command itself)', tier: ADMIN, permission: PermissionFlagsBits.Administrator, note: 'right-click a message -> Apps' },
    ],
  },
  {
    feature: 'Suggestions',
    command: '/suggestion',
    subcommands: [
      { name: 'add', tier: EVERYONE, permission: null },
      { name: 'edit', tier: EVERYONE, permission: null, note: 'own pending suggestions only' },
      { name: 'remove', tier: EVERYONE, permission: null, note: 'own pending (any, for Admins)' },
      { name: 'list', tier: EVERYONE, permission: null },
      { name: 'approve', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'reject', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
      { name: 'channel', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
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
      { name: 'config', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
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
    feature: 'Warn',
    command: '/warn',
    subcommands: [
      {
        name: '(the command itself)',
        tier: MOD,
        permission: PermissionFlagsBits.ModerateMembers,
        note: 'auto-escalates through role_1/role_2; shares state with /warning',
      },
    ],
  },
  {
    feature: 'Warnings',
    command: '/warning',
    subcommands: [
      { name: 'edit', tier: MOD, permission: PermissionFlagsBits.ModerateMembers, note: 'own issued warnings only' },
      { name: 'config', tier: ADMIN, permission: PermissionFlagsBits.Administrator, note: 'escalation roles + warnings channel' },
      { name: 'update', tier: ADMIN, permission: PermissionFlagsBits.Administrator, note: 'refreshes the embed formatting' },
      { name: 'disable', tier: ADMIN, permission: PermissionFlagsBits.Administrator },
    ],
  },
];

module.exports = { ADMIN, MOD, EVERYONE, MOD_ROLE_ID, COMMAND_MANIFEST };

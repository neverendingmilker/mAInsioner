// Hand-maintained reference of every slash command (and subcommand) the bot exposes,
// with the access tier actually enforced in code:
//   ADMIN     — requires the "Administrator" permission
//   MOD       — requires an elevated-but-not-full-admin permission (Manage Roles,
//               Manage Server, or Moderate Members) — typically what a dedicated
//               moderator role would be granted
//   EVERYONE  — no permission check; any member can use it
//
// This mirrors the actual PermissionFlagsBits checks in each command's handler(s), not
// any specific role — a member only gets the MOD-tier commands if their roles actually
// carry one of those permissions in this server's own Discord settings. There's no
// separate hardcoded "mod role"; access follows Discord's real permission grants, the
// same way Discord enforces it everywhere else.
//
// Keep this in sync by hand whenever a command's permission requirements change —
// there's no way to derive it automatically, since some of it lives in per-subcommand
// inline checks rather than a single declarative place.

const ADMIN = 'Admin';
const MOD = 'Mod';
const EVERYONE = 'Everyone';

const COMMAND_MANIFEST = [
  {
    feature: 'Anime Night',
    command: '/animenight',
    subcommands: [
      { name: 'add', tier: MOD },
      { name: 'list', tier: EVERYONE },
      { name: 'last', tier: EVERYONE },
      { name: 'edit', tier: MOD },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Birthday',
    command: '/birthday',
    subcommands: [
      { name: 'add', tier: EVERYONE, note: 'Admin to set for someone else' },
      { name: 'remove', tier: EVERYONE, note: "Admin to remove someone else's" },
      { name: 'config', tier: MOD },
      { name: 'list', tier: EVERYONE },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Booster Links',
    command: '/boosterlink',
    subcommands: [
      { name: 'link', tier: MOD },
      { name: 'unlink', tier: MOD },
      { name: 'list', tier: MOD },
      { name: 'exempt add/remove/list', tier: MOD },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Combined Role Search',
    command: '/comboroles',
    subcommands: [
      { name: 'search', tier: EVERYONE },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Command List',
    command: '/commandlist',
    subcommands: [{ name: '(the command itself)', tier: EVERYONE }],
  },
  {
    feature: 'Disable Feature',
    command: '/disablefeature',
    subcommands: [{ name: '(the command itself)', tier: ADMIN }],
  },
  {
    feature: 'GoosePizza',
    command: '/goosepizza',
    subcommands: [
      { name: 'create', tier: MOD },
      { name: 'edit', tier: MOD },
      { name: 'channels', tier: MOD },
      { name: 'remove', tier: MOD },
      { name: 'list', tier: MOD },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Incident',
    command: '/incident',
    subcommands: [
      { name: 'channel', tier: ADMIN },
      { name: 'setnumber', tier: ADMIN },
      { name: 'reset', tier: ADMIN },
      { name: 'disable', tier: ADMIN },
    ],
  },
  {
    feature: 'Role Links',
    command: '/rolelink',
    subcommands: [
      { name: 'link', tier: MOD },
      { name: 'unlink', tier: MOD },
      { name: 'list', tier: MOD },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Starboard',
    command: '/starboard',
    subcommands: [
      { name: 'create', tier: MOD },
      { name: 'edit', tier: MOD },
      { name: 'remove', tier: MOD },
      { name: 'list', tier: MOD },
      { name: 'lookback', tier: MOD },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Sticky Messages',
    command: '/sticky',
    subcommands: [
      { name: 'add', tier: MOD },
      { name: 'remove', tier: MOD },
      { name: 'list', tier: EVERYONE },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Suggestions',
    command: '/suggestion',
    subcommands: [
      { name: 'add', tier: EVERYONE },
      { name: 'edit', tier: EVERYONE, note: 'own pending suggestions only' },
      { name: 'list', tier: EVERYONE },
      { name: 'approve', tier: ADMIN },
      { name: 'reject', tier: ADMIN },
      { name: 'channel set/remove', tier: ADMIN },
      { name: 'disable', tier: ADMIN },
    ],
  },
  {
    feature: 'Verbal',
    command: '/verbal',
    subcommands: [{ name: '(the command itself)', tier: MOD, note: 'shares state with /warning' }],
  },
  {
    feature: 'Verification',
    command: '/verify',
    subcommands: [
      { name: 'config', tier: MOD },
      { name: 'sub', tier: MOD, note: 'or the role set via /verify config allowedrole' },
      { name: 'domme', tier: MOD, note: 'or the role set via /verify config allowedrole' },
      { name: 'maledom', tier: MOD, note: 'or the role set via /verify config allowedrole' },
      { name: 'edit', tier: MOD, note: 'or the role set via /verify config allowedrole' },
      { name: 'disable', tier: MOD },
    ],
  },
  {
    feature: 'Warnings',
    command: '/warning',
    subcommands: [
      { name: 'give', tier: MOD },
      { name: 'roles', tier: MOD },
      { name: 'channel', tier: MOD },
      { name: 'disable', tier: MOD },
    ],
  },
];

module.exports = { ADMIN, MOD, EVERYONE, COMMAND_MANIFEST };

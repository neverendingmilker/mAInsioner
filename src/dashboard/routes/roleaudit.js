const express = require('express');
const { PermissionFlagsBits, OverwriteType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const { getSidebarFeatures } = require('../sidebarData');

const router = express.Router();

// Same fixed list as /2faroles — Discord's own documented set of permissions blocked for
// an account without 2FA enabled, when "Require 2FA for moderator actions" is on.
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

// Same broader list as /modroles — permissions commonly thought of as "moderator-level"
// that Discord's 2FA requirement doesn't actually cover.
const MOD_PERMISSIONS = [
  ...MFA_PERMISSIONS,
  { flag: PermissionFlagsBits.ViewAuditLog, label: 'View Audit Log' },
  { flag: PermissionFlagsBits.ManageNicknames, label: 'Manage Nicknames' },
  { flag: PermissionFlagsBits.ManageGuildExpressions, label: 'Manage Expressions (emoji/sticker/suoni)' },
  { flag: PermissionFlagsBits.ModerateMembers, label: 'Timeout Members' },
];

const MAX_ENTRIES_SHOWN = 10;

function requireGuild(req, res) {
  const guild = resolveDashboardGuild(req.client, req.session.guildId);
  if (!guild) {
    res.status(500).render('error', {
      title: 'Server non trovato',
      message: 'Il server selezionato non è più disponibile — esci e accedi di nuovo per sceglierne un altro.',
    });
    return null;
  }
  return guild;
}

// Shared computation behind both /2faroles and /modroles — reimplemented here rather than
// delegated to a manager, because these commands have no persisted state or manager layer
// at all: they compute live from the guild's Discord cache every single time they run,
// same as this route does. Kept as one function since the two commands are otherwise
// identical logic over a different permission list (+ /modroles also checks per-member
// overrides, gated behind includeMemberOverrides).
function auditRoles(guild, permissions, { ignoreBots, includeMemberOverrides }) {
  const roles = [...guild.roles.cache.values()]
    .filter((r) => !ignoreBots || !r.tags?.botId)
    .sort((a, b) => b.position - a.position);

  const baseHeldByRoleId = new Map();
  for (const role of roles) {
    const held = permissions.filter((p) => role.permissions.has(p.flag)).map((p) => p.label);
    if (held.length > 0) baseHeldByRoleId.set(role.id, held);
  }

  const roleOverridesByRoleId = new Map();
  const memberOverridesByUserId = new Map();

  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if (overwrite.type === OverwriteType.Role) {
        if (ignoreBots && guild.roles.cache.get(overwrite.id)?.tags?.botId) continue;
        const baseHeld = new Set(baseHeldByRoleId.get(overwrite.id) ?? []);
        const grantedHere = permissions.filter((p) => overwrite.allow.has(p.flag) && !baseHeld.has(p.label));
        if (grantedHere.length === 0) continue;
        if (!roleOverridesByRoleId.has(overwrite.id)) roleOverridesByRoleId.set(overwrite.id, []);
        roleOverridesByRoleId.get(overwrite.id).push({ channelName: channel.name, labels: grantedHere.map((p) => p.label) });
      } else if (includeMemberOverrides && overwrite.type === OverwriteType.Member) {
        const member = guild.members.cache.get(overwrite.id);
        if (ignoreBots && member?.user?.bot) continue;
        const grantedHere = permissions.filter((p) => overwrite.allow.has(p.flag));
        if (grantedHere.length === 0) continue;
        const displayName = member ? member.user.tag : overwrite.id;
        if (!memberOverridesByUserId.has(overwrite.id)) memberOverridesByUserId.set(overwrite.id, { displayName, entries: [] });
        memberOverridesByUserId.get(overwrite.id).entries.push({ channelName: channel.name, labels: grantedHere.map((p) => p.label) });
      }
    }
  }

  const relevantRoleIds = new Set([...baseHeldByRoleId.keys(), ...roleOverridesByRoleId.keys()]);
  const roleMatches = roles
    .filter((r) => relevantRoleIds.has(r.id))
    .map((role) => {
      const heldPermissions = baseHeldByRoleId.get(role.id) ?? [];
      const allOverrides = roleOverridesByRoleId.get(role.id) ?? [];
      return {
        name: role.name,
        isAdmin: heldPermissions.includes('Administrator'),
        heldPermissions: heldPermissions.includes('Administrator') ? [] : heldPermissions,
        overrides: allOverrides.slice(0, MAX_ENTRIES_SHOWN).map((o) => `#${o.channelName}: ${o.labels.join(', ')}`),
        overridesHidden: Math.max(0, allOverrides.length - MAX_ENTRIES_SHOWN),
      };
    });

  const memberMatches = [...memberOverridesByUserId.values()].map((m) => ({
    displayName: m.displayName,
    entries: m.entries.slice(0, MAX_ENTRIES_SHOWN).map((e) => `#${e.channelName}: ${e.labels.join(', ')}`),
    entriesHidden: Math.max(0, m.entries.length - MAX_ENTRIES_SHOWN),
  }));

  return { roleMatches, memberMatches };
}

router.get('/roleaudit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const ignoreBots = req.query.ignoreBots === '1';

    const mfa = auditRoles(guild, MFA_PERMISSIONS, { ignoreBots, includeMemberOverrides: false });
    const mod = auditRoles(guild, MOD_PERMISSIONS, { ignoreBots, includeMemberOverrides: true });

    res.render('roleaudit', {
      title: 'Ruoli & Permessi',
      guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
      features: getSidebarFeatures(null),
      ignoreBots,
      mfa,
      mod,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

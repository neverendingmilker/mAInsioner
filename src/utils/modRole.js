const { PermissionFlagsBits } = require('discord.js');
const repo = require('./modRoleRepository');

// Which role counts as "Mod" is configurable per server (see /modrole) rather than a
// single fixed ID, now that the bot can run on more than one server. Cached in memory
// per guild so the hot paths that call isMod() (honeypot/reactionlimit/slowmode/verify
// check it on every message/reaction) don't hit the DB every time — the cache is kept
// in sync directly by setModRoleId whenever /modrole changes the value, so it never
// goes stale across a redeploy-free session.
const cache = new Map(); // guildId -> roleId | null

async function getModRoleId(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  const roleId = await repo.getModRoleId(guildId);
  cache.set(guildId, roleId);
  return roleId;
}

async function setModRoleId(guildId, roleId) {
  await repo.setModRoleId(guildId, roleId);
  cache.set(guildId, roleId);
}

// True if this member counts as a moderator for the bot's purposes: they hold this
// server's configured Mod role, or they have Administrator (the owner, who outranks
// every tier). Accepts a GuildMember (or anything with the same .guild/.permissions/
// .roles.cache shape). If no Mod role has been configured for this server yet, only
// Administrators count — set one with /modrole.
async function isMod(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const guildId = member.guild?.id;
  if (!guildId) return false;
  const modRoleId = await getModRoleId(guildId);
  if (!modRoleId) return false;
  return member.roles?.cache?.has?.(modRoleId) ?? false;
}

module.exports = { isMod, getModRoleId, setModRoleId };

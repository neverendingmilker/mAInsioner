const { PermissionFlagsBits } = require('discord.js');

// This bot only ever runs for a single server, so the "Mod" tier is this one specific,
// fixed role rather than a per-guild configurable setting — see the project
// instructions. Every place in the bot that gates something behind "Mod" access checks
// this role directly (not the Manage Messages/Moderate Members/Manage Roles permission
// that role happens to carry), so it stays correct even if that role's own permissions
// change later.
const MOD_ROLE_ID = '1090658915810820156';

// True if this member counts as a moderator for the bot's purposes: they hold the Mod
// role directly, or they have Administrator (the owner, who outranks every tier).
// Accepts a GuildMember (or anything with the same .permissions/.roles.cache shape).
function isMod(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return member.roles?.cache?.has?.(MOD_ROLE_ID) ?? false;
}

module.exports = { MOD_ROLE_ID, isMod };

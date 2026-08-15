const { PermissionFlagsBits } = require('discord.js');
const repo = require('./inviteTrackerRepository');
const cache = require('./inviteCache');

class ValidationError extends Error {}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

function assertCanTrack(guild) {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new ValidationError('I need the "Manage Server" permission to see and track this server\'s invites.');
  }
}

// Builds the initial in-memory snapshot of the guild's invites. Called once per guild
// at startup (see ready.js) — after this, inviteCreate/inviteDelete keep it up to date,
// and every join further refreshes it as a side effect of resolveUsedInvite below.
async function warmInviteCache(guild) {
  assertCanTrack(guild);
  const invites = await guild.invites.fetch();
  cache.setGuildInvites(guild.id, invites);
}

function cacheInvite(invite) {
  if (!invite.guild) return;
  cache.upsertInvite(invite.guild.id, invite);
}

function forgetInvite(guildId, code) {
  if (!guildId) return;
  cache.removeInvite(guildId, code);
}

// Diffs the live invite list against the last known snapshot to figure out which
// invite a member who just joined must have used (the one whose `uses` went up).
// Falls back to a couple of edge cases Discord doesn't make obvious:
//  - an invite that hit its max-uses limit gets auto-deleted the moment it's used,
//    so it won't be in the live list at all — if exactly one invite went missing,
//    that's almost certainly the one;
//  - joins via the server's vanity URL never show up in guild.invites.fetch() at all,
//    so those are tracked separately via fetchVanityData().
// Returns null if it genuinely can't be determined (e.g. Discovery, widget, or two
// invites changed in the same instant — rare, and not worth guessing wrong).
async function resolveUsedInvite(guild) {
  const before = cache.getGuildInvites(guild.id);
  const liveInvites = await guild.invites.fetch();
  cache.setGuildInvites(guild.id, liveInvites);

  for (const invite of liveInvites.values()) {
    const prev = before.get(invite.code);
    if (!prev || invite.uses > prev.uses) {
      return { code: invite.code, inviterId: invite.inviter?.id ?? null };
    }
  }

  const missingCodes = [...before.keys()].filter((code) => !liveInvites.has(code));
  if (missingCodes.length === 1) {
    const [code] = missingCodes;
    return { code, inviterId: before.get(code)?.inviterId ?? null };
  }

  if (guild.vanityURLCode) {
    try {
      const vanity = await guild.fetchVanityData();
      const prevVanityUses = cache.getVanityUses(guild.id);
      cache.setVanityUses(guild.id, vanity.uses);
      if (prevVanityUses != null && vanity.uses > prevVanityUses) {
        return { code: 'vanity', inviterId: null };
      }
    } catch {
      // No vanity URL set up, or the bot lost permission to see it — not fatal,
      // this was already just a fallback guess.
    }
  }

  return null;
}

async function handleMemberAdd(member) {
  if (member.user.bot) return;
  if (!(await repo.isEnabled(member.guild.id))) return;

  let resolved = null;
  try {
    resolved = await resolveUsedInvite(member.guild);
  } catch (err) {
    console.error(`[invitetracker] Could not resolve which invite ${member.id} used in guild ${member.guild.id}:`, err.message);
  }

  await repo.recordJoin(member.guild.id, member.id, resolved?.inviterId ?? null, resolved?.code ?? null);
}

async function handleMemberRemove(member) {
  if (member.user.bot) return;
  if (!(await repo.isEnabled(member.guild.id))) return;

  await repo.recordLeave(member.guild.id, member.id);
}

async function getLeaderboard(guildId, limit = 10) {
  return repo.getLeaderboard(guildId, limit);
}

async function getUserStats(guildId, userId) {
  return repo.getUserStats(guildId, userId);
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  warmInviteCache,
  cacheInvite,
  forgetInvite,
  handleMemberAdd,
  handleMemberRemove,
  getLeaderboard,
  getUserStats,
};

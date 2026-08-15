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

async function getDefaultChannel(guildId) {
  return repo.getDefaultChannel(guildId);
}

async function setDefaultChannel(guildId, channelId) {
  await repo.setDefaultChannel(guildId, channelId);
}

// Resolves the channel every new invite should open into: the server-wide default set
// via `/invites channel`. There's no per-invite override anymore — one consistent entry
// point keeps invites predictable instead of scattering them across the server.
async function resolveTargetChannel(guild) {
  const channelId = await repo.getDefaultChannel(guild.id);
  if (!channelId) {
    throw new ValidationError('No invite channel is set up yet — ask an Admin to run `/invites channel` first.');
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    throw new ValidationError('The configured invite channel no longer exists — ask an Admin to set a new one with `/invites channel`.');
  }

  return channel;
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

async function forgetInvite(guildId, code) {
  if (!guildId) return;
  cache.removeInvite(guildId, code);
  await repo.removeAssignedInvite(guildId, code).catch((err) => {
    console.error(`[invitetracker] Could not clean up assignment for deleted invite ${code} in guild ${guildId}:`, err.message);
  });
}

// Who a join through this code should be credited to: whoever it was explicitly
// assigned to via `/invites create` (if anyone), otherwise Discord's own record of who
// created it (a normal invite someone made themselves through Discord's UI/app).
async function attributeInvite(guildId, code, discordInviterId) {
  const assigned = await repo.getAssignedUser(guildId, code);
  return assigned ?? discordInviterId;
}

const MAX_INVITE_AGE_SECONDS = 604800; // Discord's own cap: 7 days

// Creates a brand-new, never-reused Discord invite (unique: true — otherwise Discord
// can hand back an existing invite with the same settings instead of a fresh code) for
// `channel`, credited to `user` regardless of who actually runs the command.
async function createAssignedInvite(guild, channel, user, { maxUses, maxAgeSeconds } = {}, createdBy) {
  assertCanTrack(guild);

  if (maxAgeSeconds != null && (maxAgeSeconds < 0 || maxAgeSeconds > MAX_INVITE_AGE_SECONDS)) {
    throw new ValidationError('Expiry has to be between 0 (never) and 168 hours (7 days) — that\'s Discord\'s own limit.');
  }

  const botMember = guild.members.me;
  const channelPerms = botMember && channel.permissionsFor(botMember);
  if (!channelPerms?.has(PermissionFlagsBits.CreateInstantInvite)) {
    throw new ValidationError('I need the "Create Invite" permission in that channel.');
  }

  const invite = await channel.createInvite({
    maxUses: maxUses ?? 0,
    maxAge: maxAgeSeconds ?? 0,
    unique: true,
    reason: `Invite Tracker: assigned to ${user.tag} (${user.id}) by ${createdBy}`,
  });

  cache.upsertInvite(guild.id, invite);
  await repo.assignInviteCode(guild.id, invite.code, user.id, createdBy);

  return invite;
}

// Assigns a code the admin already created some other way (e.g. straight from Discord's
// own UI) instead of making a new one. Only future joins count towards `user` — any uses
// the invite already had before this point aren't retroactively credited, since they
// were never logged as joins in the first place.
async function assignExistingInvite(guild, code, user, createdBy) {
  assertCanTrack(guild);

  const invite = await guild.invites.fetch(code).catch(() => null);
  if (!invite) {
    throw new ValidationError(`Couldn't find an active invite with code "${code}" in this server.`);
  }

  cache.upsertInvite(guild.id, invite);
  await repo.assignInviteCode(guild.id, invite.code, user.id, createdBy);

  return invite;
}

// Deletes both the real Discord invite and our assignment record. The Discord-side
// delete also fires inviteDelete, which would clean up the assignment on its own — this
// just does it immediately instead of waiting on the gateway round-trip.
async function revokeAssignedInvite(guild, code) {
  const invite = await guild.invites.fetch(code).catch(() => null);
  await invite?.delete('Invite Tracker: revoked').catch(() => {});
  await forgetInvite(guild.id, code);
}

async function getAssignedInvites(guildId, userId) {
  return repo.getAssignedInvites(guildId, userId);
}

async function getAssignedUser(guildId, code) {
  return repo.getAssignedUser(guildId, code);
}

// The self-service quota check for /invites create: does this user already have an
// invite they made for themselves? Cross-checks against the live invite list first, and
// silently cleans up (then reports "none") if the stored one turned out to be stale —
// expired, hit its max uses and got auto-deleted, or was removed outside of
// /invites revoke — so a dead DB row never permanently locks someone out.
async function getActiveOwnInvite(guild, userId) {
  const code = await repo.getOwnAssignedInvite(guild.id, userId);
  if (!code) return null;

  // Let a genuine fetch failure (e.g. the bot lost the Manage Server permission) surface
  // as an error — only an explicit "fetch worked, code just isn't in the list anymore"
  // counts as stale. Otherwise a temporary API hiccup could wipe someone's real record.
  assertCanTrack(guild);
  const liveInvites = await guild.invites.fetch();
  if (liveInvites.has(code)) return code;

  await forgetInvite(guild.id, code);
  return null;
}

async function getAllAssignedInvites(guildId) {
  return repo.getAllAssignedInvites(guildId);
}

// Every assigned invite, cross-referenced with its live Discord state (uses, max uses,
// expiry) for `/invites list`. An assignment whose invite no longer exists (expired, hit
// its max uses and got auto-deleted, or was removed some other way without going through
// `/invites revoke`) is still listed, just flagged as no longer active.
async function getAssignedInvitesOverview(guild) {
  assertCanTrack(guild);

  const [liveInvites, assigned] = await Promise.all([guild.invites.fetch(), repo.getAllAssignedInvites(guild.id)]);

  return assigned.map((a) => {
    const invite = liveInvites.get(a.code);
    return {
      code: a.code,
      assignedUserId: a.assignedUserId,
      active: Boolean(invite),
      uses: invite?.uses ?? null,
      maxUses: invite?.maxUses || null, // 0 means unlimited — normalize to null like "no limit"
      expiresTimestamp: invite?.expiresTimestamp ?? null,
    };
  });
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
      const inviterId = await attributeInvite(guild.id, invite.code, invite.inviter?.id ?? null);
      return { code: invite.code, inviterId };
    }
  }

  const missingCodes = [...before.keys()].filter((code) => !liveInvites.has(code));
  if (missingCodes.length === 1) {
    const [code] = missingCodes;
    const inviterId = await attributeInvite(guild.id, code, before.get(code)?.inviterId ?? null);
    return { code, inviterId };
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
  getDefaultChannel,
  setDefaultChannel,
  resolveTargetChannel,
  warmInviteCache,
  cacheInvite,
  forgetInvite,
  createAssignedInvite,
  assignExistingInvite,
  revokeAssignedInvite,
  getAssignedInvites,
  getAssignedUser,
  getActiveOwnInvite,
  getAllAssignedInvites,
  getAssignedInvitesOverview,
  handleMemberAdd,
  handleMemberRemove,
  getLeaderboard,
  getUserStats,
};

// In-memory snapshot of each guild's invites (code -> uses/inviter), used to diff
// against the live list when someone joins and figure out which invite they used.
// Discord's gateway doesn't tell you directly which invite a new member came through,
// so this "before/after uses count" diff is the standard way every invite tracker does it.
// Never persisted: rebuilt from the live invite list on every startup (see
// inviteTrackerManager.warmInviteCache), so a bot restart just means one extra API call,
// not lost data — the actual join history lives in the DB, not here.

const invitesByGuild = new Map(); // guildId -> Map(code -> { uses, inviterId })
const vanityUsesByGuild = new Map(); // guildId -> number | null

function setGuildInvites(guildId, invites) {
  const map = new Map();
  for (const invite of invites.values()) {
    map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter?.id ?? null });
  }
  invitesByGuild.set(guildId, map);
}

function getGuildInvites(guildId) {
  return invitesByGuild.get(guildId) ?? new Map();
}

function upsertInvite(guildId, invite) {
  const map = invitesByGuild.get(guildId) ?? new Map();
  map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter?.id ?? null });
  invitesByGuild.set(guildId, map);
}

function removeInvite(guildId, code) {
  invitesByGuild.get(guildId)?.delete(code);
}

function getVanityUses(guildId) {
  return vanityUsesByGuild.has(guildId) ? vanityUsesByGuild.get(guildId) : null;
}

function setVanityUses(guildId, uses) {
  vanityUsesByGuild.set(guildId, uses);
}

module.exports = { setGuildInvites, getGuildInvites, upsertInvite, removeInvite, getVanityUses, setVanityUses };

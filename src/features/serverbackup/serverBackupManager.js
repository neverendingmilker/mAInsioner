const { PermissionFlagsBits, ChannelType, OverwriteType } = require('discord.js');
const repo = require('./serverBackupRepository');

class ValidationError extends Error {}

const SNAPSHOT_VERSION = 1;

// What a backup/restore covers. Shared between create and restore — a snapshot can be
// taken with one scope and restored with a different (narrower) one; whichever data the
// snapshot doesn't have for the requested scope is just empty, nothing to restore there.
const SCOPES = ['all', 'roles', 'channels', 'assets'];
function normalizeScope(scope) {
  return SCOPES.includes(scope) ? scope : 'all';
}

// Small delay between each create call during a restore — this is a burst of several
// sequential role/channel creations, and a little breathing room avoids tripping
// Discord's rate limits on a server with a lot to restore.
const CREATE_DELAY_MS = 300;
// One member.roles.add() call already batches every role for that member into a single
// request, so a lighter delay between members is enough.
const MEMBER_DELAY_MS = 150;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

function assertCanManage(guild, scope = 'all') {
  const perms = guild.members.me?.permissions;
  const missing = [];
  if ((scope === 'all' || scope === 'roles') && !perms?.has(PermissionFlagsBits.ManageRoles)) missing.push('Manage Roles');
  if ((scope === 'all' || scope === 'channels') && !perms?.has(PermissionFlagsBits.ManageChannels)) missing.push('Manage Channels');
  if ((scope === 'all' || scope === 'assets') && !perms?.has(PermissionFlagsBits.ManageGuildExpressions)) missing.push('Manage Guild Expressions');
  if (missing.length > 0) {
    throw new ValidationError(`I need the following permission${missing.length === 1 ? '' : 's'} to do this: ${missing.join(', ')}.`);
  }
}

// Permission overwrites reference a role/member by ID, but IDs never survive a restore
// (recreated roles get brand-new ones) — so overwrites are stored by role *name* instead
// (member overwrites keep the raw user ID, since a person's Discord ID never changes).
function serializeOverwrites(overwriteCache, guild) {
  const list = [];
  for (const overwrite of overwriteCache.values()) {
    if (overwrite.type === OverwriteType.Role) {
      const name = overwrite.id === guild.id ? '@everyone' : guild.roles.cache.get(overwrite.id)?.name;
      if (!name) continue; // role vanished from cache mid-snapshot — skip rather than guess
      list.push({ kind: 'role', name, allow: overwrite.allow.bitfield.toString(), deny: overwrite.deny.bitfield.toString() });
    } else {
      list.push({ kind: 'member', id: overwrite.id, allow: overwrite.allow.bitfield.toString(), deny: overwrite.deny.bitfield.toString() });
    }
  }
  return list;
}

function resolveOverwrites(overwrites, nameToRoleId, guild) {
  if (!overwrites?.length) return [];
  const resolved = [];
  for (const ow of overwrites) {
    const id = ow.kind === 'role' ? (ow.name === '@everyone' ? guild.roles.everyone.id : nameToRoleId.get(ow.name)) : ow.id;
    if (!id) continue; // referenced role no longer exists and wasn't recreated — drop this entry
    resolved.push({ id, type: ow.kind === 'role' ? OverwriteType.Role : OverwriteType.Member, allow: BigInt(ow.allow), deny: BigInt(ow.deny) });
  }
  return resolved;
}

// Reassigns roles (by name, via nameToRoleId) to whoever from `data.members` is already
// in the guild — additive only, never removes a role. Shared by restoreSnapshot (right
// after it creates/matches roles) and syncMembers (which skips role creation entirely and
// just uses whatever roles already exist) — same logic either way, only how nameToRoleId
// gets built differs.
async function reassignMemberRoles(guild, data, nameToRoleId, reason, membersSummary) {
  if (!(data.members ?? []).length) return;

  try {
    await guild.members.fetch();
  } catch (err) {
    console.error('[serverbackup] Could not fetch the full member list before reassigning roles:', err.message);
  }

  for (const memberData of data.members) {
    const member = guild.members.cache.get(memberData.id);
    if (!member) {
      membersSummary.notYetJoined++;
      continue;
    }

    const roleIdsToAdd = [];
    for (const roleName of memberData.roles) {
      const roleId = nameToRoleId.get(roleName);
      if (!roleId) continue; // that role wasn't (re)created/invited yet — nothing to assign
      const role = guild.roles.cache.get(roleId);
      if (!role || role.managed || member.roles.cache.has(roleId)) continue;
      roleIdsToAdd.push(roleId);
    }

    if (roleIdsToAdd.length === 0) {
      membersSummary.noChangeNeeded++;
      continue;
    }

    try {
      await member.roles.add(roleIdsToAdd, reason);
      membersSummary.updated.push(member.user.tag ?? memberData.id);
      await sleep(MEMBER_DELAY_MS);
    } catch (err) {
      membersSummary.failed.push(`${member.user.tag ?? memberData.id} (${err.message})`);
    }
  }
}

// Snapshots roles (everything except @everyone — its permissions aren't touched on
// restore, only channel-level overwrites referencing it), categories, and every other
// channel type, each with its permission overwrites. Doesn't cover emoji, stickers, or
// soundboard sounds — those need their own backup (binary files, not just structure).
// `scope` limits what's captured: 'roles' skips categories/channels entirely, 'channels'
// skips roles, 'all' (default) captures everything.
async function createSnapshot(guild, label, createdBy, scope = 'all') {
  scope = normalizeScope(scope);
  assertCanManage(guild, scope);

  const roles =
    scope === 'channels' || scope === 'assets'
      ? []
      : [...guild.roles.cache.values()]
          .filter((role) => role.id !== guild.id)
          .sort((a, b) => a.position - b.position)
          .map((role) => ({
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            mentionable: role.mentionable,
            permissions: role.permissions.bitfield.toString(),
            // "Managed" roles belong to a bot/integration/booster tier — Discord creates
            // and owns them, they can't be created through the API. Kept in the snapshot
            // (so a channel overwrite referencing one can still be matched by name) but
            // never recreated on restore — see the role loop below.
            managed: role.managed,
          }));

  // Which (non-managed) roles each human member currently holds, by role name — lets a
  // restore on a new server reassign roles to whoever's already joined there, matched by
  // their persistent Discord user ID. Skipped along with roles for a 'channels'-only
  // backup, since there'd be nothing to match role names against.
  let members = [];
  if (scope !== 'channels' && scope !== 'assets') {
    try {
      await guild.members.fetch();
    } catch (err) {
      console.error('[serverbackup] Could not fetch the full member list, snapshot may be missing some members:', err.message);
    }

    members = [...guild.members.cache.values()]
      .filter((m) => !m.user.bot)
      .map((m) => ({
        id: m.id,
        roles: [...m.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed).map((r) => r.name),
      }))
      .filter((m) => m.roles.length > 0);
  }

  let categories = [];
  let channels = [];

  if (scope !== 'roles' && scope !== 'assets') {
    // Threads (and any other channel-like entity without its own overwrites) aren't real
    // "structure" — they inherit permissions from their parent channel, which is already
    // captured on its own. Filtering by the presence of permissionOverwrites is more
    // robust than listing thread type IDs by hand.
    const allChannels = [...guild.channels.cache.values()].filter((c) => c.permissionOverwrites);

    categories = allChannels
      .filter((c) => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((c) => ({
        name: c.name,
        permissionOverwrites: serializeOverwrites(c.permissionOverwrites.cache, guild),
      }));

    channels = allChannels
      .filter((c) => c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((c) => ({
        name: c.name,
        type: c.type,
        parentName: c.parent?.name ?? null,
        topic: 'topic' in c ? c.topic ?? null : null,
        nsfw: 'nsfw' in c ? Boolean(c.nsfw) : false,
        rateLimitPerUser: 'rateLimitPerUser' in c ? c.rateLimitPerUser ?? 0 : 0,
        bitrate: 'bitrate' in c ? c.bitrate ?? null : null,
        userLimit: 'userLimit' in c ? c.userLimit ?? null : null,
        permissionOverwrites: serializeOverwrites(c.permissionOverwrites.cache, guild),
      }));
  }

  const data = { version: SNAPSHOT_VERSION, scope, roles, categories, channels, members };
  const id = await repo.saveSnapshot(guild.id, guild.name, label, JSON.stringify(data), createdBy);

  let assetCounts = { emoji: 0, sticker: 0, soundboard: 0 };
  if (scope === 'assets' || scope === 'all') {
    assetCounts = await captureAssets(guild, id);
  }

  return {
    id,
    scope,
    roleCount: roles.length,
    categoryCount: categories.length,
    channelCount: channels.length,
    memberCount: members.length,
    assetCounts,
  };
}

async function downloadUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Downloads and stores the actual bytes of every custom emoji, sticker, and soundboard
// sound — unlike roles/channels these can't be reconstructed from just a name, and their
// CDN URL stops working once the original is deleted, so the raw file has to be saved.
// Best-effort per item: one failed download doesn't abort the rest of the backup.
async function captureAssets(guild, snapshotId) {
  const counts = { emoji: 0, sticker: 0, soundboard: 0 };

  try {
    const emojis = await guild.emojis.fetch();
    for (const emoji of emojis.values()) {
      try {
        const data = await downloadUrl(emoji.imageURL({ extension: emoji.animated ? 'gif' : 'png' }));
        await repo.saveAsset(snapshotId, 'emoji', emoji.name, { animated: emoji.animated }, data);
        counts.emoji++;
      } catch (err) {
        console.error(`[serverbackup] Failed to capture emoji "${emoji.name}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[serverbackup] Could not fetch emojis:', err.message);
  }

  try {
    const stickers = await guild.stickers.fetch();
    for (const sticker of stickers.values()) {
      try {
        const data = await downloadUrl(sticker.url);
        await repo.saveAsset(
          snapshotId,
          'sticker',
          sticker.name,
          { description: sticker.description, tags: sticker.tags, format: sticker.format },
          data
        );
        counts.sticker++;
      } catch (err) {
        console.error(`[serverbackup] Failed to capture sticker "${sticker.name}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[serverbackup] Could not fetch stickers:', err.message);
  }

  try {
    const sounds = await guild.soundboardSounds.fetch();
    for (const sound of sounds.values()) {
      try {
        const data = await downloadUrl(sound.url);
        await repo.saveAsset(
          snapshotId,
          'soundboard',
          sound.name,
          { volume: sound.volume, emojiId: sound.emoji?.id ?? null, emojiName: sound.emoji?.name ?? null },
          data
        );
        counts.soundboard++;
      } catch (err) {
        console.error(`[serverbackup] Failed to capture soundboard sound "${sound.name}":`, err.message);
      }
    }
  } catch (err) {
    console.error('[serverbackup] Could not fetch soundboard sounds:', err.message);
  }

  return counts;
}

// StickerFormatType: PNG=1, APNG=2, Lottie=3, GIF=4 — needed to give the re-uploaded file
// the right extension, since discord.js infers the format from the filename.
const STICKER_EXT_BY_FORMAT = { 1: 'png', 2: 'png', 3: 'json', 4: 'gif' };

// Re-uploads whatever emoji/stickers/soundboard sounds from the snapshot aren't already
// present in the target server by name — additive only, same philosophy as the rest of a
// restore. Each item gets a brand-new ID; any old message referencing the original emoji/
// sticker will still render broken since Discord has no way to reuse the old ID.
async function restoreAssets(guild, snapshotId, reason, summary) {
  const existingEmojiNames = new Set([...guild.emojis.cache.values()].map((e) => e.name));
  for (const asset of await repo.getAssets(snapshotId, 'emoji')) {
    if (existingEmojiNames.has(asset.name)) {
      summary.emoji.skipped++;
      continue;
    }
    try {
      const created = await guild.emojis.create({ attachment: asset.data, name: asset.name, reason });
      existingEmojiNames.add(created.name);
      summary.emoji.created.push(created.name);
      await sleep(CREATE_DELAY_MS);
    } catch (err) {
      summary.emoji.failed.push(`${asset.name} (${err.message})`);
    }
  }

  const existingStickerNames = new Set([...guild.stickers.cache.values()].map((s) => s.name));
  for (const asset of await repo.getAssets(snapshotId, 'sticker')) {
    if (existingStickerNames.has(asset.name)) {
      summary.stickers.skipped++;
      continue;
    }
    try {
      const ext = STICKER_EXT_BY_FORMAT[asset.meta?.format] ?? 'png';
      const created = await guild.stickers.create({
        file: { attachment: asset.data, name: `${asset.name}.${ext}` },
        name: asset.name,
        description: asset.meta?.description || undefined,
        tags: asset.meta?.tags || asset.name,
        reason,
      });
      existingStickerNames.add(created.name);
      summary.stickers.created.push(created.name);
      await sleep(CREATE_DELAY_MS);
    } catch (err) {
      summary.stickers.failed.push(`${asset.name} (${err.message})`);
    }
  }

  const existingSoundNames = new Set([...guild.soundboardSounds.cache.values()].map((s) => s.name));
  for (const asset of await repo.getAssets(snapshotId, 'soundboard')) {
    if (existingSoundNames.has(asset.name)) {
      summary.soundboard.skipped++;
      continue;
    }
    try {
      const created = await guild.soundboardSounds.create({
        file: asset.data,
        name: asset.name,
        volume: asset.meta?.volume ?? undefined,
        reason,
      });
      existingSoundNames.add(created.name);
      summary.soundboard.created.push(created.name);
      await sleep(CREATE_DELAY_MS);
    } catch (err) {
      summary.soundboard.failed.push(`${asset.name} (${err.message})`);
    }
  }
}

async function getAssetCounts(snapshotId) {
  return repo.getAssetCounts(snapshotId);
}

async function listSnapshots() {
  return repo.listSnapshots();
}

async function loadSnapshot(snapshotId) {
  const row = await repo.getSnapshot(snapshotId);
  if (!row) {
    throw new ValidationError(`No backup found with id **${snapshotId}**.`);
  }
  return { row, data: JSON.parse(row.data) };
}

// Bot/integration/booster ("managed") roles from the snapshot that aren't currently
// present in the target server by name — i.e. apps the admin hasn't (re-)invited yet.
// Restoring without them still works, but any channel overwrite that referenced one of
// these roles gets silently dropped instead of resolved (see resolveOverwrites) — this
// is meant to be shown to the admin *before* they confirm a restore, so they can invite
// the missing apps first if full fidelity matters, or knowingly proceed without them.
async function previewRestore(guild, snapshotId, scope = 'all') {
  const { row, data } = await loadSnapshot(snapshotId);
  scope = normalizeScope(scope);

  // An assets-only restore never touches roles/channel overwrites, so there's nothing
  // for a missing bot to affect — skip the check entirely.
  const missingBots =
    scope === 'assets'
      ? []
      : (() => {
          const existingNames = new Set([...guild.roles.cache.values()].map((r) => r.name));
          return (data.roles ?? []).filter((r) => r.managed && !existingNames.has(r.name)).map((r) => r.name);
        })();

  return { label: row.label, sourceGuildName: row.sourceGuildName, scope: data.scope ?? 'all', missingBots };
}

// Just the member-role-reassignment part of a restore, without touching roles/channels at
// all — for catching up members who joined *after* a restore already ran (they were
// "not yet joined" back then and got skipped). Much cheaper than a full restore: no role/
// channel creation attempts, nothing to confirm, just reassigns roles by name using
// whatever roles already exist in this server right now.
async function syncMembers(guild, snapshotId, executedBy) {
  assertCanManage(guild, 'roles');

  const { row, data } = await loadSnapshot(snapshotId);
  const reason = `Server Backup: member sync from backup #${snapshotId} by ${executedBy}`;

  const summary = {
    label: row.label,
    sourceGuildName: row.sourceGuildName,
    members: { updated: [], noChangeNeeded: 0, notYetJoined: 0, failed: [] },
  };

  const nameToRoleId = new Map();
  for (const role of guild.roles.cache.values()) nameToRoleId.set(role.name, role.id);

  await reassignMemberRoles(guild, data, nameToRoleId, reason, summary.members);

  return summary;
}

// Never deletes or overwrites anything that already exists — matches roles by name and
// channels by (type, category, name), and only creates whatever's missing. Safe to run
// more than once (a second run just skips everything already restored), and safe on a
// server that already has some channels/roles of its own. Not guild-scoped: a backup
// taken on one server can be restored on any other server the bot is in (e.g. an empty
// test server) — that's the whole point of a portable structure backup.
// `scope` limits what this run actually restores, independent of what the snapshot
// contains — e.g. a snapshot taken with scope 'all' can still be restored 'roles'-only.
async function restoreSnapshot(guild, snapshotId, executedBy, scope = 'all') {
  scope = normalizeScope(scope);
  assertCanManage(guild, scope);

  const { row, data } = await loadSnapshot(snapshotId);
  const reason = `Server Backup: restored from backup #${snapshotId} by ${executedBy}`;

  const summary = {
    label: row.label,
    sourceGuildName: row.sourceGuildName,
    scope,
    roles: { created: [], skipped: 0, failed: [] },
    members: { updated: [], noChangeNeeded: 0, notYetJoined: 0, failed: [] },
    categories: { created: [], skipped: 0, failed: [] },
    channels: { created: [], skipped: 0, failed: [] },
    emoji: { created: [], skipped: 0, failed: [] },
    stickers: { created: [], skipped: 0, failed: [] },
    soundboard: { created: [], skipped: 0, failed: [] },
    positionWarning: null,
  };

  // --- roles ---
  const nameToRoleId = new Map();
  for (const role of guild.roles.cache.values()) nameToRoleId.set(role.name, role.id);

  if (scope === 'roles' || scope === 'all') {
    for (const roleData of data.roles ?? []) {
      if (nameToRoleId.has(roleData.name)) {
        summary.roles.skipped++;
        continue;
      }
      // Bot/integration/booster roles can't be created through the API, and shouldn't be
      // faked with a lookalike — invite the bot (or wait for the integration/boost) and
      // Discord creates the real one with a matching name, which then gets picked up by
      // name for any channel overwrite that references it. Invite bots *before* restoring
      // wherever possible, so those overwrites resolve on the first pass instead of being
      // silently skipped below.
      if (roleData.managed) {
        summary.roles.skipped++;
        continue;
      }
      try {
        const created = await guild.roles.create({
          name: roleData.name,
          color: roleData.color || undefined,
          hoist: roleData.hoist,
          mentionable: roleData.mentionable,
          permissions: BigInt(roleData.permissions),
          reason,
        });
        nameToRoleId.set(created.name, created.id);
        summary.roles.created.push(created.name);
        await sleep(CREATE_DELAY_MS);
      } catch (err) {
        summary.roles.failed.push(`${roleData.name} (${err.message})`);
      }
    }

    // Best-effort: put every role from the snapshot (pre-existing or just-created) back in
    // its relative order. Can silently fail to move roles positioned above the bot's own
    // highest role — Discord just won't allow that, no way around it but moving the bot's
    // role up first.
    try {
      const positions = (data.roles ?? [])
        .filter((r) => nameToRoleId.has(r.name))
        .map((r, index) => ({ role: nameToRoleId.get(r.name), position: index + 1 }));
      if (positions.length > 0) {
        await guild.roles.setPositions(positions);
      }
    } catch (err) {
      summary.positionWarning = `Couldn't fully restore role order (${err.message}) — likely some roles sit above my own; move my role higher and reorder manually if needed.`;
    }

    // --- member role assignments ---
    // Only ever adds roles, never removes any — matches the "additive only" philosophy
    // of the rest of a restore. Anyone from the snapshot not currently in this server is
    // just skipped (nothing to reassign yet); running syncMembers (or restore) again
    // later picks up whoever's joined since, so this keeps being useful over time.
    await reassignMemberRoles(guild, data, nameToRoleId, reason, summary.members);
  }

  if (scope === 'roles') {
    return summary;
  }

  if (scope === 'channels' || scope === 'all') {
    // --- categories ---
    const nameToCategoryId = new Map();
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildCategory) nameToCategoryId.set(channel.name, channel.id);
    }

    for (const catData of data.categories ?? []) {
      if (nameToCategoryId.has(catData.name)) {
        summary.categories.skipped++;
        continue;
      }
      try {
        const created = await guild.channels.create({
          name: catData.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: resolveOverwrites(catData.permissionOverwrites, nameToRoleId, guild),
          reason,
        });
        nameToCategoryId.set(created.name, created.id);
        summary.categories.created.push(created.name);
        await sleep(CREATE_DELAY_MS);
      } catch (err) {
        summary.categories.failed.push(`${catData.name} (${err.message})`);
      }
    }

    // --- channels ---
    const channelKey = (name, type, parentName) => `${type}::${parentName ?? ''}::${name}`;
    const existingKeys = new Set();
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildCategory || !channel.permissionOverwrites) continue;
      existingKeys.add(channelKey(channel.name, channel.type, channel.parent?.name ?? null));
    }

    for (const chData of data.channels ?? []) {
      const key = channelKey(chData.name, chData.type, chData.parentName);
      if (existingKeys.has(key)) {
        summary.channels.skipped++;
        continue;
      }
      try {
        const options = {
          name: chData.name,
          type: chData.type,
          parent: chData.parentName ? nameToCategoryId.get(chData.parentName) : undefined,
          permissionOverwrites: resolveOverwrites(chData.permissionOverwrites, nameToRoleId, guild),
          reason,
        };
        if (chData.topic != null) options.topic = chData.topic;
        if (chData.nsfw) options.nsfw = true;
        if (chData.rateLimitPerUser) options.rateLimitPerUser = chData.rateLimitPerUser;
        if (chData.bitrate != null) options.bitrate = chData.bitrate;
        if (chData.userLimit != null) options.userLimit = chData.userLimit;

        const created = await guild.channels.create(options);
        existingKeys.add(key);
        summary.channels.created.push(created.name);
        await sleep(CREATE_DELAY_MS);
      } catch (err) {
        summary.channels.failed.push(`${chData.name} (${err.message})`);
      }
    }
  }

  if (scope === 'assets' || scope === 'all') {
    await restoreAssets(guild, snapshotId, reason, summary);
  }

  return summary;
}

module.exports = {
  ValidationError,
  SCOPES,
  isEnabled,
  setEnabled,
  assertCanManage,
  createSnapshot,
  listSnapshots,
  previewRestore,
  restoreSnapshot,
  syncMembers,
  getAssetCounts,
};

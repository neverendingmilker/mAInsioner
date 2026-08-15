const { PermissionFlagsBits, ChannelType, OverwriteType } = require('discord.js');
const repo = require('./serverBackupRepository');

class ValidationError extends Error {}

const SNAPSHOT_VERSION = 1;

// Small delay between each create call during a restore — this is a burst of several
// sequential role/channel creations, and a little breathing room avoids tripping
// Discord's rate limits on a server with a lot to restore.
const CREATE_DELAY_MS = 300;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

function assertCanManage(guild) {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new ValidationError('I need both "Manage Roles" and "Manage Channels" to back up or restore this server\'s structure.');
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

// Snapshots roles (everything except @everyone — its permissions aren't touched on
// restore, only channel-level overwrites referencing it), categories, and every other
// channel type, each with its permission overwrites. Doesn't cover emoji, stickers, or
// soundboard sounds — those need their own backup (binary files, not just structure).
async function createSnapshot(guild, label, createdBy) {
  assertCanManage(guild);

  const roles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => a.position - b.position)
    .map((role) => ({
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions.bitfield.toString(),
    }));

  const allChannels = [...guild.channels.cache.values()];

  const categories = allChannels
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({
      name: c.name,
      permissionOverwrites: serializeOverwrites(c.permissionOverwrites.cache, guild),
    }));

  const channels = allChannels
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

  const data = { version: SNAPSHOT_VERSION, roles, categories, channels };
  const id = await repo.saveSnapshot(guild.id, guild.name, label, JSON.stringify(data), createdBy);

  return { id, roleCount: roles.length, categoryCount: categories.length, channelCount: channels.length };
}

async function listSnapshots() {
  return repo.listSnapshots();
}

// Never deletes or overwrites anything that already exists — matches roles by name and
// channels by (type, category, name), and only creates whatever's missing. Safe to run
// more than once (a second run just skips everything already restored), and safe on a
// server that already has some channels/roles of its own. Not guild-scoped: a backup
// taken on one server can be restored on any other server the bot is in (e.g. an empty
// test server) — that's the whole point of a portable structure backup.
async function restoreSnapshot(guild, snapshotId, executedBy) {
  assertCanManage(guild);

  const row = await repo.getSnapshot(snapshotId);
  if (!row) {
    throw new ValidationError(`No backup found with id **${snapshotId}**.`);
  }

  const data = JSON.parse(row.data);
  const reason = `Server Backup: restored from backup #${snapshotId} by ${executedBy}`;

  const summary = {
    label: row.label,
    sourceGuildName: row.sourceGuildName,
    roles: { created: [], skipped: 0, failed: [] },
    categories: { created: [], skipped: 0, failed: [] },
    channels: { created: [], skipped: 0, failed: [] },
    positionWarning: null,
  };

  // --- roles ---
  const nameToRoleId = new Map();
  for (const role of guild.roles.cache.values()) nameToRoleId.set(role.name, role.id);

  for (const roleData of data.roles ?? []) {
    if (nameToRoleId.has(roleData.name)) {
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
    if (channel.type === ChannelType.GuildCategory) continue;
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

  return summary;
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  assertCanManage,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
};

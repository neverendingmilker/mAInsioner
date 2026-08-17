const repo = require('./boosterLinkRepository');

class ValidationError extends Error {}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

async function getOgFrenRoleId(guildId) {
  return repo.getOgFrenRoleId(guildId);
}

async function setOgFrenRoleId(guildId, roleId) {
  await repo.setOgFrenRoleId(guildId, roleId);
}

// Links a custom perk role to a booster. Requires the bot's own top role to sit
// above the linked role, otherwise it wouldn't be able to remove it later.
async function link(guild, userId, role, createdBy) {
  const botMember = guild.members.me;
  if (!botMember || botMember.roles.highest.position <= role.position) {
    throw new ValidationError(
      `My role needs to be higher than ${role} in the role list for me to be able to remove it later. Move my role above it in Server Settings → Roles and try again.`
    );
  }

  await repo.addLink(guild.id, userId, role.id, createdBy);
}

// Unlinks a specific role for a user, or every role linked to them if `roleId`
// is omitted. Returns how many links were removed (only meaningful for the
// "all" case, where the caller wants to know if anything was actually there).
async function unlink(guildId, userId, roleId) {
  if (roleId) {
    await repo.removeLink(guildId, userId, roleId);
    return 1;
  }
  return repo.removeAllLinksForUser(guildId, userId);
}

async function listForUser(guildId, userId) {
  return repo.getLinksForUser(guildId, userId);
}

async function listAll(guildId) {
  return repo.getAllLinksInGuild(guildId);
}

// --- Exempt roles ---
// Members holding ANY of a guild's configured exempt roles are skipped by the
// auto-removal entirely, even if they have linked custom roles and stop boosting.
// A member only needs one of the configured roles, not all of them at once.

async function addExemptRole(guildId, roleId, addedBy) {
  await repo.addExemptRole(guildId, roleId, addedBy);
}

async function removeExemptRole(guildId, roleId) {
  return repo.removeExemptRole(guildId, roleId);
}

async function listExemptRoles(guildId) {
  return repo.getExemptRoles(guildId);
}

async function isMemberExempt(member) {
  const exemptRoleIds = await repo.getExemptRoles(member.guild.id);
  if (exemptRoleIds.length === 0) return false;
  return exemptRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

// Called from guildMemberUpdate on any boost-status change: losing the booster role pauses
// (not deletes) every linked role, and regaining it restores whatever was paused. The link
// itself only ever goes away via an explicit unlink (Mod dashboard/command action).
async function handleMemberUpdate(oldMember, newMember) {
  if (!(await repo.isEnabled(newMember.guild.id))) return; // feature disabled for this guild

  const hadBooster = oldMember.roles.premiumSubscriberRole !== null;
  const hasBooster = newMember.roles.premiumSubscriberRole !== null;
  if (hadBooster === hasBooster) return; // boost status didn't change

  if (hasBooster) {
    await restorePausedLinks(newMember);
  } else {
    await pauseActiveLinks(newMember);
  }
}

// Lost the booster role: remove every currently-active linked role from the member and mark
// those links paused instead of deleting them, so restorePausedLinks can put them back if
// they boost again later. Exempt members are skipped entirely — same as before, their custom
// roles are never touched by boost status at all.
async function pauseActiveLinks(newMember) {
  if (await isMemberExempt(newMember)) return; // has at least one exempt role — skip regardless of boost status

  const links = await repo.getLinksForUser(newMember.guild.id, newMember.id);
  const activeLinks = links.filter((row) => Number(row.paused) !== 1);
  if (activeLinks.length === 0) return;

  for (const linkRow of activeLinks) {
    try {
      if (newMember.roles.cache.has(linkRow.role_id)) {
        await newMember.roles.remove(linkRow.role_id).catch((err) => {
          console.warn(
            `[boosterlinks] Could not remove role ${linkRow.role_id} from ${newMember.id} in guild ${newMember.guild.id}:`,
            err.message
          );
        });
      }
      await repo.setPaused(linkRow.guild_id, linkRow.user_id, linkRow.role_id, true);
      console.log(
        `[boosterlinks] ${newMember.id} stopped boosting guild ${newMember.guild.id}; removed role ${linkRow.role_id} and paused the link (comes back automatically if they boost again).`
      );
    } catch (err) {
      console.error(`[boosterlinks] Error handling custom-role cleanup for ${newMember.id}:`, err);
    }
  }
}

// Started boosting again: re-add every role that was paused last time they lost the boost.
// A role that's since been deleted, or that the bot can no longer assign (its own role fell
// below it in the hierarchy meanwhile), is left paused rather than silently dropped — it's
// still visible on the dashboard/`/boosterlink list` for a Mod to sort out or remove.
async function restorePausedLinks(newMember) {
  const links = await repo.getLinksForUser(newMember.guild.id, newMember.id);
  const pausedLinks = links.filter((row) => Number(row.paused) === 1);
  if (pausedLinks.length === 0) return;

  for (const linkRow of pausedLinks) {
    try {
      const role = newMember.guild.roles.cache.get(linkRow.role_id);
      if (!role) {
        console.warn(`[boosterlinks] Paused role ${linkRow.role_id} for ${newMember.id} no longer exists — leaving the link paused.`);
        continue;
      }

      const botMember = newMember.guild.members.me;
      if (!botMember || botMember.roles.highest.position <= role.position) {
        console.warn(
          `[boosterlinks] Can't restore ${role.id} for ${newMember.id} in guild ${newMember.guild.id} — my role is no longer above it.`
        );
        continue;
      }

      if (!newMember.roles.cache.has(role.id)) {
        await newMember.roles.add(role).catch((err) => {
          throw new Error(`Could not assign ${role.id}: ${err.message}`);
        });
      }
      await repo.setPaused(linkRow.guild_id, linkRow.user_id, linkRow.role_id, false);
      console.log(`[boosterlinks] ${newMember.id} started boosting guild ${newMember.guild.id} again; restored role ${role.id}.`);
    } catch (err) {
      console.error(`[boosterlinks] Error restoring custom role for ${newMember.id}:`, err);
    }
  }
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  getOgFrenRoleId,
  setOgFrenRoleId,
  link,
  unlink,
  listForUser,
  listAll,
  addExemptRole,
  removeExemptRole,
  listExemptRoles,
  isMemberExempt,
  handleMemberUpdate,
};

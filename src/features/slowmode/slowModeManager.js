const repo = require('./slowModeRepository');
const { parseDurationToSeconds, formatSeconds } = require('../../utils/duration');
const { isMod } = require('../../utils/modRole');

class ValidationError extends Error {}

// Auto-deleting notice posted in the channel to let the offender know why their message
// was removed — kept brief and short-lived so it doesn't linger and clutter the channel.
const NOTICE_LIFETIME_MS = 20000;

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

// --- Configuration ---

async function setLimit(guildId, channel, durationInput, createdBy) {
  let cooldownSeconds;
  try {
    cooldownSeconds = parseDurationToSeconds(durationInput);
  } catch (err) {
    throw new ValidationError(err.message);
  }
  if (cooldownSeconds < 60) {
    throw new ValidationError('The cooldown needs to be at least 1 minute — for anything shorter, use Discord\'s own slowmode instead.');
  }

  await repo.setLimit(guildId, channel.id, cooldownSeconds, createdBy);
  return { cooldownSeconds };
}

async function removeLimit(guildId, channelId) {
  return repo.removeLimit(guildId, channelId);
}

async function listLimits(guildId) {
  const rows = await repo.getAllLimits(guildId);
  return rows.map((row) => ({
    channelId: row.channel_id,
    cooldownSeconds: Number(row.cooldown_seconds),
    cooldownLabel: formatSeconds(Number(row.cooldown_seconds)),
  }));
}

// A member is exempt from the limit if they can manage messages or are a full admin —
// always exempt, no separate configurable list.
// Moderators (the configured Mod role, or Administrator) are always exempt.
async function isExempt(member) {
  return isMod(member);
}

// Called from messageCreate for every new guild message. Returns true if the message
// was blocked (deleted) so the caller can skip any further processing of it (sticky,
// GoosePizza, etc. shouldn't treat a deleted message as real new activity).
async function checkAndEnforce(message) {
  if (message.author?.bot) return false;
  if (!(await repo.isEnabled(message.guild.id))) return false;

  const limit = await repo.getLimitForChannel(message.guild.id, message.channelId);
  if (!limit) return false;

  if (await isExempt(message.member)) return false;

  const cooldownSeconds = Number(limit.cooldown_seconds);
  const now = message.createdTimestamp;
  const lastAllowed = await repo.getLastMessageAt(message.guild.id, message.channelId, message.author.id);

  if (!lastAllowed || now - lastAllowed >= cooldownSeconds * 1000) {
    await repo.setLastMessageAt(message.guild.id, message.channelId, message.author.id, now);
    return false; // within their right to post — allowed
  }

  // Over the limit: delete the message (don't touch their last-allowed timestamp, so
  // repeated violation attempts don't reset or extend the cooldown).
  await message.delete().catch(() => {});

  const nextAllowedAt = Math.floor((lastAllowed + cooldownSeconds * 1000) / 1000);
  const notice = await message.channel
    .send({
      content: `⏳ ${message.author}, you can only post here once every ${formatSeconds(cooldownSeconds)} — try again <t:${nextAllowedAt}:R>.`,
      allowedMentions: { users: [message.author.id] },
    })
    .catch(() => null);
  if (notice) {
    setTimeout(() => notice.delete().catch(() => {}), NOTICE_LIFETIME_MS).unref?.();
  }

  return true;
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  setLimit,
  removeLimit,
  listLimits,
  checkAndEnforce,
};

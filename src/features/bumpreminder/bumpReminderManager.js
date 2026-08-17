const { PermissionFlagsBits } = require('discord.js');
const repo = require('./bumpReminderRepository');

// Disboard's own cooldown between successful /bump uses — fixed, not configurable on their
// end, so it's fine to hardcode here.
const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;

// Disboard's real bot user id (public, same for every server it's in).
const DISBOARD_BOT_ID = '302050872383242240';

class ValidationError extends Error {}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

async function getConfig(guildId) {
  return repo.getConfig(guildId);
}

async function setChannel(guild, channel) {
  const botMember = guild.members.me;
  const canPost = botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  if (!canPost) {
    throw new ValidationError(`I don't have permission to post in ${channel}.`);
  }
  await repo.setChannel(guild.id, channel.id);
}

async function setRole(guildId, role) {
  // `null` clears the ping entirely — the role is optional (post without a mention), same
  // convention as QOTD/Themes' own pinged role.
  await repo.setRole(guildId, role ? role.id : null);
}

// Recognizes Disboard's own "Bump done" confirmation embed — the only signal available
// (Disboard has no webhook/event API for this), so this is inherently a bit fragile: it
// breaks if Disboard ever changes that wording or bot account. Deliberately not scoped to
// any particular channel — the cooldown itself is server-wide, not per-channel, so /bump
// counts no matter where it was used.
function isDisboardBumpConfirmation(message) {
  if (message.author?.id !== DISBOARD_BOT_ID) return false;
  const embed = message.embeds[0];
  return Boolean(embed?.description?.includes('Bump done'));
}

// Called from messageCreate for every message in every guild — bails out immediately
// unless it's actually Disboard's confirmation, so the cost on every other message is one
// author-id comparison.
async function handleMessage(message) {
  if (!message.guild || !isDisboardBumpConfirmation(message)) return;
  if (!(await repo.isEnabled(message.guild.id))) return;

  // The message that triggered Disboard's reply is a slash command interaction — its
  // invoking user is who actually bumped. Not required for the reminder itself (that's a
  // channel/role ping, not a DM), kept only as a "last bumped by" reference on the
  // dashboard/status command. `interactionMetadata` is the current discord.js v14 API;
  // `interaction` is its older, deprecated-but-still-present equivalent — either can be
  // missing (Disboard could theoretically post outside of responding to a command).
  const bumpedBy = message.interactionMetadata?.user ?? message.interaction?.user ?? null;

  await repo.recordBump(message.guild.id, Date.now() + BUMP_COOLDOWN_MS, bumpedBy?.id ?? null);
}

async function postReminder(client, guildId, cfg) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { posted: false, reason: 'guild_not_found' };

  const channel = guild.channels.cache.get(cfg.channel_id);
  if (!channel) return { posted: false, reason: 'channel_not_found' };

  const botMember = guild.members.me;
  const canPost = botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  if (!canPost) return { posted: false, reason: 'missing_permission' };

  const rolePing = cfg.role_id ? `<@&${cfg.role_id}> ` : '';
  await channel.send({
    content: `${rolePing}⏰ È di nuovo ora di fare bump! Usa \`/bump\` per supportare il server.`,
    allowedMentions: cfg.role_id ? { roles: [cfg.role_id] } : { parse: [] },
  });

  return { posted: true };
}

// Posts the reminder in every guild whose timer is armed and due — polled every minute by
// bumpReminderScheduler.js rather than a per-guild in-memory setTimeout, so a bot restart
// never loses (or resets) a pending reminder, same reasoning as QOTD/Themes/Birthday's own
// schedulers.
async function checkAllDue(client) {
  const rows = await repo.getAllDueGuilds(Date.now());

  for (const row of rows) {
    try {
      const result = await postReminder(client, row.guild_id, row);
      if (result.posted) {
        await repo.clearReminder(row.guild_id);
        console.log(`[bumpreminder] Posted the reminder in guild ${row.guild_id}.`);
      } else {
        console.warn(`[bumpreminder] Could not post the reminder in guild ${row.guild_id}: ${result.reason}`);
      }
    } catch (err) {
      console.error(`[bumpreminder] Error posting the reminder for guild ${row.guild_id}:`, err);
    }
  }
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  getConfig,
  setChannel,
  setRole,
  handleMessage,
  checkAllDue,
};

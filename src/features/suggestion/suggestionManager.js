const { EmbedBuilder } = require('discord.js');
const { client: db } = require('../../database/db');

const STATUS_COLORS = {
  pending: 0x3b87c2,
  approved: 0x00ff00,
  denied: 0xff0000,
};

// Custom emoji used both as vote reactions and as the admin decide-by-react
// shortcut. The bot must be a member of at least one server that owns these
// emoji for message.react() to work.
const UPVOTE_EMOJI = { name: 'check00', id: '1533958917682364629' };
const DOWNVOTE_EMOJI = { name: 'wrong00', id: '1533958951924666438' };
const VOTE_EMOJIS = [UPVOTE_EMOJI, DOWNVOTE_EMOJI];

function reactIdentifier(emoji) {
  return `${emoji.name}:${emoji.id}`;
}

function buildSuggestionEmbed(suggestion, authorTag, authorAvatarURL) {
  const color = STATUS_COLORS[suggestion.status] || STATUS_COLORS.pending;
  const titleSuffix = suggestion.status === 'approved' ? ' ✅' : suggestion.status === 'denied' ? ' ❌' : '';

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: authorTag, iconURL: authorAvatarURL })
    .setTitle(`Suggestion #${suggestion.number}${titleSuffix}`)
    .setDescription(suggestion.content);
}

// Adds the up/down vote reactions in order. Sequential on purpose: reacting
// in parallel doesn't guarantee they show up left-to-right in the client.
async function addVoteReactions(message) {
  for (const emoji of VOTE_EMOJIS) {
    await message.react(reactIdentifier(emoji)).catch(() => null);
  }
}

// --- Channel configuration ---

async function getChannelId(guildId) {
  const result = await db.execute({
    sql: 'SELECT channel_id FROM suggestion_config WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows[0]?.channel_id || null;
}

async function setChannel(guildId, channelId) {
  await db.execute({
    sql: `INSERT INTO suggestion_config (guild_id, channel_id) VALUES (?, ?)
          ON CONFLICT (guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
    args: [guildId, channelId],
  });
}

async function removeChannel(guildId) {
  await db.execute({
    sql: 'UPDATE suggestion_config SET channel_id = NULL WHERE guild_id = ?',
    args: [guildId],
  });
}

async function isEnabled(guildId) {
  const result = await db.execute({
    sql: 'SELECT enabled FROM suggestion_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Boolean(row.enabled) : true; // enabled by default until explicitly toggled off
}

async function setEnabled(guildId, enabled) {
  await db.execute({
    sql: `INSERT INTO suggestion_config (guild_id, enabled) VALUES (?, ?)
          ON CONFLICT (guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Suggestions ---

async function getSuggestion(guildId, number) {
  const result = await db.execute({
    sql: 'SELECT * FROM suggestions WHERE guild_id = ? AND number = ?',
    args: [guildId, number],
  });
  return result.rows[0] || null;
}

// Used by the reactionAdd event: given the message someone reacted to, finds
// the suggestion it belongs to (if any). message_id is globally unique on
// Discord, so no need for a guild filter here.
async function getSuggestionByMessageId(messageId) {
  const result = await db.execute({
    sql: 'SELECT * FROM suggestions WHERE message_id = ?',
    args: [messageId],
  });
  return result.rows[0] || null;
}

// Creates a new suggestion, posts its embed in the configured channel, and
// stores the resulting message id so it can be edited later (on /edit,
// /approve, /deny).
async function createSuggestion(channel, author, content) {
  const guildId = channel.guild.id;

  const numberResult = await db.execute({
    sql: 'SELECT COALESCE(MAX(number), 0) + 1 AS next_number FROM suggestions WHERE guild_id = ?',
    args: [guildId],
  });
  const number = numberResult.rows[0].next_number;

  const suggestion = {
    number,
    content,
    status: 'pending',
  };

  const message = await channel.send({
    embeds: [buildSuggestionEmbed(suggestion, author.tag ?? author.username, author.displayAvatarURL())],
  });

  await addVoteReactions(message);

  await db.execute({
    sql: `INSERT INTO suggestions (guild_id, number, user_id, content, status, channel_id, message_id, created_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    args: [guildId, number, author.id, content, channel.id, message.id, Date.now()],
  });

  return number;
}

// Re-renders the embed for a suggestion in place (used after /edit only —
// approve/deny use repostSuggestion below instead).
async function refreshEmbed(guild, suggestion) {
  if (!suggestion.message_id) return;

  const channel = guild.channels.cache.get(suggestion.channel_id);
  if (!channel) return;

  const message = await channel.messages.fetch(suggestion.message_id).catch(() => null);
  if (!message) return;

  const author = await guild.client.users.fetch(suggestion.user_id).catch(() => null);

  const embed = buildSuggestionEmbed(
    suggestion,
    author ? author.tag ?? author.username : `<@${suggestion.user_id}>`,
    author ? author.displayAvatarURL() : null
  );

  await message.edit({ embeds: [embed] }).catch(() => null);
}

// Posts a brand new message with the updated embed (color + ✅/❌ next to the
// number in the title) — used for approve/reject, which post an updated copy
// without touching/deleting the original message.
async function repostSuggestion(guild, suggestion) {
  const channel = guild.channels.cache.get(suggestion.channel_id);
  if (!channel) return;

  const author = await guild.client.users.fetch(suggestion.user_id).catch(() => null);

  const embed = buildSuggestionEmbed(
    suggestion,
    author ? author.tag ?? author.username : `<@${suggestion.user_id}>`,
    author ? author.displayAvatarURL() : null
  );

  await channel.send({ embeds: [embed] });
}

// Updates the text of a suggestion (only allowed, at the command level, for
// its own author while it's still pending) and refreshes the posted embed.
async function editContent(guild, number, newContent) {
  const suggestion = await getSuggestion(guild.id, number);
  if (!suggestion) return null;

  await db.execute({
    sql: 'UPDATE suggestions SET content = ? WHERE guild_id = ? AND number = ?',
    args: [newContent, guild.id, number],
  });

  suggestion.content = newContent;
  await refreshEmbed(guild, suggestion);
  return suggestion;
}

// Marks a suggestion as approved/rejected and posts an updated copy (color +
// ✅/❌ next to the number in the title) without deleting the original
// message. The row is kept in the database (not deleted) so future
// suggestions keep numbering correctly instead of reusing/skipping numbers.
async function setStatus(guild, number, status, decidedById) {
  const suggestion = await getSuggestion(guild.id, number);
  if (!suggestion) return null;

  const decidedAt = Date.now();
  await db.execute({
    sql: 'UPDATE suggestions SET status = ?, decided_by = ?, decided_at = ? WHERE guild_id = ? AND number = ?',
    args: [status, decidedById, decidedAt, guild.id, number],
  });

  suggestion.status = status;
  suggestion.decided_by = decidedById;
  suggestion.decided_at = decidedAt;

  await repostSuggestion(guild, suggestion);

  return suggestion;
}

async function listPending(guildId) {
  const result = await db.execute({
    sql: "SELECT * FROM suggestions WHERE guild_id = ? AND status = 'pending' ORDER BY number ASC",
    args: [guildId],
  });
  return result.rows;
}

// This user's own still-pending suggestions — used by /suggestion remove to figure out
// which one they mean when they don't specify a number.
async function listPendingForUser(guildId, userId) {
  const result = await db.execute({
    sql: "SELECT * FROM suggestions WHERE guild_id = ? AND user_id = ? AND status = 'pending' ORDER BY number ASC",
    args: [guildId, userId],
  });
  return result.rows;
}

// Deletes a suggestion entirely: removes its posted message (if any) and its DB row.
// Used both for a user removing their own pending suggestion, and for a mod removing
// any suggestion from the list.
async function removeSuggestion(guild, number) {
  const suggestion = await getSuggestion(guild.id, number);
  if (!suggestion) return false;

  if (suggestion.message_id && suggestion.channel_id) {
    const channel = guild.channels.cache.get(suggestion.channel_id);
    if (channel) {
      const message = await channel.messages.fetch(suggestion.message_id).catch(() => null);
      if (message) await message.delete().catch(() => {});
    }
  }

  await db.execute({
    sql: 'DELETE FROM suggestions WHERE guild_id = ? AND number = ?',
    args: [guild.id, number],
  });
  return true;
}

module.exports = {
  UPVOTE_EMOJI,
  DOWNVOTE_EMOJI,
  getChannelId,
  setChannel,
  removeChannel,
  isEnabled,
  setEnabled,
  getSuggestion,
  getSuggestionByMessageId,
  createSuggestion,
  editContent,
  setStatus,
  listPending,
  listPendingForUser,
  removeSuggestion,
};

const { EmbedBuilder } = require('discord.js');
const repo = require('./highlightRepository');

class ValidationError extends Error {}

const MIN_WORD_LENGTH = 2;
const MAX_WORD_LENGTH = 100;
const MAX_WORDS_PER_USER = 25;
const CONTEXT_MESSAGES_BEFORE = 3;
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000; // don't re-notify the same user in the same channel more than once per 5 minutes
const EMBED_COLOR = 0xf1c40f;

// Per-guild cache of every user's highlight words, with a precompiled matcher regex for
// each — this runs against every single message in the server, so it's kept in memory
// rather than hitting the database per message. Rebuilt whenever a word is added or
// removed. Structure: Map<guildId, Array<{ userId, word, regex }>>.
const wordCache = new Map();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(word) {
  // Word-boundary match so "cat" doesn't fire on "category" — works for whole phrases
  // too, since \b only needs to anchor the two ends of the full string.
  return new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
}

async function refreshGuildCache(guildId) {
  const rows = await repo.getAllWordsInGuild(guildId);
  wordCache.set(
    guildId,
    rows.map((r) => ({ userId: r.user_id, word: r.word, regex: buildMatcher(r.word) }))
  );
}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

// --- Words ---

function assertValidWord(word) {
  const trimmed = word.trim();
  if (trimmed.length < MIN_WORD_LENGTH || trimmed.length > MAX_WORD_LENGTH) {
    throw new ValidationError(`A highlight word/phrase must be between ${MIN_WORD_LENGTH} and ${MAX_WORD_LENGTH} characters.`);
  }
  return trimmed;
}

const CHANNEL_MODES = ['exclude', 'include'];

async function addWord(guildId, userId, wordInput) {
  const word = assertValidWord(wordInput);
  const existing = await repo.getWordsForUser(guildId, userId);
  if (existing.some((w) => w.toLowerCase() === word.toLowerCase())) {
    throw new ValidationError(`You're already highlighting "${word}".`);
  }
  if (existing.length >= MAX_WORDS_PER_USER) {
    throw new ValidationError(`You can highlight at most ${MAX_WORDS_PER_USER} words/phrases.`);
  }
  await repo.addWord(guildId, userId, word);
  await refreshGuildCache(guildId);
  return word;
}

async function removeWord(guildId, userId, word) {
  const removedCount = await repo.removeWord(guildId, userId, word);
  if (removedCount > 0) {
    await refreshGuildCache(guildId);
  }
  return removedCount;
}

async function getWordsForUser(guildId, userId) {
  return repo.getWordsForUser(guildId, userId);
}

// --- Ignore lists ---

async function toggleIgnoredChannel(guildId, userId, channelId) {
  return repo.toggleIgnoredChannel(guildId, userId, channelId);
}

async function getChannelMode(guildId, userId) {
  return repo.getChannelMode(guildId, userId);
}

async function setChannelMode(guildId, userId, mode) {
  if (!CHANNEL_MODES.includes(mode)) {
    throw new ValidationError(`Mode must be one of: ${CHANNEL_MODES.join(', ')}.`);
  }
  await repo.setChannelMode(guildId, userId, mode);
}

async function toggleIgnoredUser(guildId, userId, ignoredUserId) {
  if (ignoredUserId === userId) {
    throw new ValidationError("You can't ignore yourself — your own messages never trigger your own highlights anyway.");
  }
  return repo.toggleIgnoredUser(guildId, userId, ignoredUserId);
}

async function getIgnoredChannels(guildId, userId) {
  return repo.getIgnoredChannels(guildId, userId);
}

async function getIgnoredUsers(guildId, userId) {
  return repo.getIgnoredUsers(guildId, userId);
}

// --- Matching / notification ---

function buildContextLines(messages, triggerMessage) {
  const lines = messages.map((m) => `**${m.author.tag}:** ${truncate(m.content || '*(no text)*', 120)}`);
  lines.push(`**${triggerMessage.author.tag}:** ${truncate(triggerMessage.content, 120)}`);
  return lines.join('\n');
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

async function notifyUser(client, guild, message, userId, matchedWords) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const priorMessages = await message.channel.messages
    .fetch({ limit: CONTEXT_MESSAGES_BEFORE, before: message.id })
    .catch(() => null);
  const contextMessages = priorMessages ? [...priorMessages.values()].reverse() : [];

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: `Highlight in #${message.channel.name} (${guild.name})` })
    .setDescription(buildContextLines(contextMessages, message))
    .addFields({ name: 'Matched', value: matchedWords.map((w) => `\`${w}\``).join(', ') })
    .addFields({ name: 'Jump to message', value: message.url })
    .setTimestamp(message.createdAt);

  await user.send({ embeds: [embed] }).catch((err) => {
    console.warn(`[highlight] Could not DM user ${userId} (DMs likely closed):`, err.message);
  });
}

async function handleMessage(message) {
  if (message.author?.bot) return;
  if (!message.content) return;
  if (!(await isEnabled(message.guild.id))) return;

  if (!wordCache.has(message.guild.id)) {
    await refreshGuildCache(message.guild.id);
  }
  const entries = wordCache.get(message.guild.id) ?? [];
  if (entries.length === 0) return;

  // Group every word that matched by the user it belongs to, so someone with several
  // matching words in one guild still only gets ONE notification for this message, not
  // one per word.
  const matchesByUser = new Map();
  for (const { userId, word, regex } of entries) {
    if (userId === message.author.id) continue; // never notify on your own messages
    if (regex.test(message.content)) {
      if (!matchesByUser.has(userId)) matchesByUser.set(userId, []);
      matchesByUser.get(userId).push(word);
    }
  }
  if (matchesByUser.size === 0) return;

  for (const [userId, matchedWords] of matchesByUser) {
    const ignoredUsers = await repo.getIgnoredUsers(message.guild.id, userId);
    if (ignoredUsers.includes(message.author.id)) continue;

    const channelMode = await repo.getChannelMode(message.guild.id, userId);
    const channelList = await repo.getIgnoredChannels(message.guild.id, userId);
    if (channelMode === 'exclude' && channelList.includes(message.channelId)) continue;
    if (channelMode === 'include' && !channelList.includes(message.channelId)) continue;

    const lastNotified = await repo.getLastNotified(message.guild.id, userId, message.channelId);
    if (lastNotified && Date.now() - lastNotified < NOTIFY_COOLDOWN_MS) continue;

    await notifyUser(message.client, message.guild, message, userId, matchedWords);
    await repo.setLastNotified(message.guild.id, userId, message.channelId, Date.now());
  }
}

module.exports = {
  ValidationError,
  isEnabled,
  setEnabled,
  addWord,
  removeWord,
  getWordsForUser,
  toggleIgnoredChannel,
  getChannelMode,
  setChannelMode,
  toggleIgnoredUser,
  getIgnoredChannels,
  getIgnoredUsers,
  handleMessage,
  MAX_WORDS_PER_USER,
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const repo = require('./starboardRepository');
const config = require('../../config/config');
const { startOfCurrentYear, zonedTimeToUtc } = require('../../utils/timezoneDate');

class ValidationError extends Error {}

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 1000;
const MAX_EMOJIS = 10;
const EMBED_COLOR = 0xffd166;

// Optional per-starboard filter on what kind of message qualifies. "media" here means
// image/GIF/video content (attachments or link embeds), regardless of caption text.
const CONTENT_TYPES = {
  any: 'Any message',
  text_only: 'Text only (no image/GIF/video)',
  image: 'Images only',
  gif: 'GIFs only',
  video: 'Videos only',
  media: 'Any media (image, GIF or video)',
  text_and_media: 'Text + media (needs both)',
};
const DEFAULT_CONTENT_TYPE = 'any';

// Special sentinel accepted in the "emojis" field: counts a reaction with ANY emoji,
// instead of requiring one of a specific set.
const ANY_EMOJI = 'any';
const ANY_EMOJI_DISPLAY_FALLBACK = '⭐'; // shown on the starboard post's top line when in "any" mode

// The emoji the bot auto-reacts with on its own starboard repost, so people can keep
// starring a message right from the starboard channel itself.
const REPOST_AUTO_STAR_EMOJI = '⭐';

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

// --- Emoji parsing ---
// Accepts unicode emojis and Discord custom emoji (<:name:id> / <a:name:id>), separated
// by whitespace and/or commas, e.g. "⭐ 🔥, <:hype:123456789012345678>", or the special
// value "any" (used alone) to count a reaction with any emoji at all.
function parseEmojis(input) {
  const trimmedInput = input.trim();
  if (trimmedInput.toLowerCase() === ANY_EMOJI) {
    return [ANY_EMOJI];
  }

  const tokens = trimmedInput
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new ValidationError('Provide at least one emoji to count (e.g. "⭐", "⭐ 🔥", or "any").');
  }
  if (tokens.some((t) => t.toLowerCase() === ANY_EMOJI)) {
    throw new ValidationError('"any" can\'t be combined with other emojis — use it on its own to count a reaction with any emoji.');
  }
  if (tokens.length > MAX_EMOJIS) {
    throw new ValidationError(`You can configure at most ${MAX_EMOJIS} emojis per starboard.`);
  }

  const customEmojiPattern = /^<a?:\w{2,32}:\d{17,20}>$/;
  const seen = new Set();
  const deduped = [];

  for (const token of tokens) {
    const isCustom = customEmojiPattern.test(token);
    // Loose check for unicode emojis: reject plain ASCII/alphanumeric text, since that's
    // almost certainly a typo rather than an emoji (real unicode emojis are multi-byte).
    const looksLikeUnicodeEmoji = !isCustom && /[^\x00-\x7F]/.test(token);

    if (!isCustom && !looksLikeUnicodeEmoji) {
      throw new ValidationError(
        `"${token}" doesn't look like a valid emoji. Use a unicode emoji (⭐) or a custom server emoji (right-click it → "Copy Emoji" if using a client that supports it, or type it directly and Discord will convert it).`
      );
    }

    const key = emojiKeyFromToken(token);
    if (seen.has(key)) continue; // silently dedupe repeats
    seen.add(key);
    deduped.push(token);
  }

  return deduped;
}

function emojiKeyFromToken(token) {
  const customMatch = token.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
  return customMatch ? customMatch[1] : token;
}

function emojiKeyFromReactionEmoji(emoji) {
  return emoji.id ?? emoji.name;
}

function formatEmojisForDisplay(tokens) {
  if (tokens.length === 1 && tokens[0] === ANY_EMOJI) return 'Any emoji';
  return tokens.join(' ');
}

// --- Validation helpers ---

function assertValidThreshold(threshold) {
  if (!Number.isInteger(threshold) || threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD) {
    throw new ValidationError(`Threshold must be a whole number between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}.`);
  }
}

function assertValidContentType(contentType) {
  if (!Object.prototype.hasOwnProperty.call(CONTENT_TYPES, contentType)) {
    throw new ValidationError(`Unknown content type "${contentType}".`);
  }
}

function assertCanPostInChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    throw new ValidationError(
      `I need "View Channel" and "Send Messages" permissions in ${channel} to post starboard messages there.`
    );
  }
}

function assertCanReadChannel(guild, channel) {
  const botMember = guild.members.me;
  const perms = channel.permissionsFor(botMember);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
    throw new ValidationError(`I need "View Channel" and "Read Message History" permissions in ${channel} to watch reactions there.`);
  }
}

// --- CRUD used by the /starboard command handlers ---

async function create(guild, name, watchChannel, postChannel, threshold, emojisInput, contentType, createdBy) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ValidationError('Give this starboard a name.');
  }
  if (watchChannel.id === postChannel.id) {
    throw new ValidationError("The watch channel and the post channel can't be the same channel.");
  }

  assertValidThreshold(threshold);
  const resolvedContentType = contentType ?? DEFAULT_CONTENT_TYPE;
  assertValidContentType(resolvedContentType);
  const emojis = parseEmojis(emojisInput);
  assertCanReadChannel(guild, watchChannel);
  assertCanPostInChannel(guild, postChannel);

  const existing = await repo.getByName(guild.id, trimmedName);
  if (existing) {
    throw new ValidationError(`A starboard named "${trimmedName}" already exists in this server. Use \`/starboard edit\` to change it.`);
  }

  await repo.createStarboard(
    guild.id,
    trimmedName,
    watchChannel.id,
    postChannel.id,
    threshold,
    JSON.stringify(emojis),
    resolvedContentType,
    createdBy
  );

  return { name: trimmedName, emojis, contentType: resolvedContentType };
}

async function edit(guild, name, updates) {
  const board = await repo.getByName(guild.id, name);
  if (!board) {
    throw new ValidationError(`No starboard named "${name}" found in this server.`);
  }

  const fields = {};

  if (updates.watchChannel) {
    assertCanReadChannel(guild, updates.watchChannel);
    fields.watch_channel_id = updates.watchChannel.id;
  }
  if (updates.postChannel) {
    assertCanPostInChannel(guild, updates.postChannel);
    fields.post_channel_id = updates.postChannel.id;
  }
  const finalWatchId = fields.watch_channel_id ?? board.watch_channel_id;
  const finalPostId = fields.post_channel_id ?? board.post_channel_id;
  if (finalWatchId === finalPostId) {
    throw new ValidationError("The watch channel and the post channel can't be the same channel.");
  }

  if (updates.threshold !== undefined) {
    assertValidThreshold(updates.threshold);
    fields.threshold = updates.threshold;
  }
  if (updates.contentType !== undefined) {
    assertValidContentType(updates.contentType);
    fields.content_type = updates.contentType;
  }
  let emojis;
  if (updates.emojisInput) {
    emojis = parseEmojis(updates.emojisInput);
    fields.emojis = JSON.stringify(emojis);
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('Provide at least one field to change.');
  }

  await repo.updateStarboard(guild.id, name, fields);
  return { ...board, ...fields, emojis: emojis ?? JSON.parse(board.emojis) };
}

async function remove(guildId, name) {
  return repo.removeStarboard(guildId, name);
}

async function listAll(guildId) {
  return repo.getAllInGuild(guildId);
}

async function getNamesList(guildId) {
  const boards = await repo.getAllInGuild(guildId);
  return boards.map((b) => b.name);
}

// --- Content-type classification ---
// Looks at attachments (uploaded files) and embeds (link previews, e.g. a pasted
// Tenor/YouTube link) to figure out what kind of content a message carries.
function classifyMessage(message) {
  const hasText = !!(message.content && message.content.trim().length > 0);

  const attachments = [...message.attachments.values()];
  const isGifAttachment = (a) => a.contentType === 'image/gif' || /\.gif$/i.test(a.name || '');
  const hasGifAttachment = attachments.some(isGifAttachment);
  const hasImageAttachment = attachments.some((a) => a.contentType?.startsWith('image/') && !isGifAttachment(a));
  const hasVideoAttachment = attachments.some((a) => a.contentType?.startsWith('video/'));

  const embeds = message.embeds || [];
  const isGifEmbedUrl = (url) => !!url && (/\.gif(\?|$)/i.test(url) || /tenor\.com|giphy\.com/i.test(url));
  const hasGifEmbed = embeds.some((e) => isGifEmbedUrl(e.image?.url) || isGifEmbedUrl(e.url));
  const hasVideoEmbed = embeds.some((e) => !!e.video);
  const hasImageEmbed = embeds.some((e) => !!e.image && !isGifEmbedUrl(e.image.url));

  return {
    hasText,
    hasImage: hasImageAttachment || hasImageEmbed,
    hasGif: hasGifAttachment || hasGifEmbed,
    hasVideo: hasVideoAttachment || hasVideoEmbed,
    get hasMedia() {
      return this.hasImage || this.hasGif || this.hasVideo;
    },
  };
}

function matchesContentType(message, contentType) {
  const c = classifyMessage(message);
  switch (contentType) {
    case 'text_only':
      return c.hasText && !c.hasMedia;
    case 'image':
      return c.hasImage;
    case 'gif':
      return c.hasGif;
    case 'video':
      return c.hasVideo;
    case 'media':
      return c.hasMedia;
    case 'text_and_media':
      return c.hasText && c.hasMedia;
    case 'any':
    default:
      return true;
  }
}

// --- Embed / message formatting ---

function buildStarboardEmbed(message, count) {
  const descriptionParts = [];
  if (message.content) descriptionParts.push(message.content.slice(0, 4000));
  descriptionParts.push(`[Original message](${message.url})`);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: message.author?.tag ?? 'Unknown user',
      iconURL: message.author?.displayAvatarURL?.() ?? undefined,
    })
    .setDescription(descriptionParts.join('\n\n'))
    .setFooter({ text: `#${message.channel?.name ?? 'unknown-channel'}` })
    .setTimestamp(message.createdAt);

  const imageAttachment = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (imageAttachment) embed.setImage(imageAttachment.url);
  else {
    const embedImage = message.embeds.find((e) => e.image || e.thumbnail);
    if (embedImage) embed.setImage(embedImage.image?.url ?? embedImage.thumbnail?.url);
  }

  return embed;
}

// Top line shown above the embed: just the star count, so it visibly ticks up/down live
// as reactions are added or removed, without repeating info already in the embed footer.
function formatStarLine(board, count) {
  const emojiTokens = JSON.parse(board.emojis);
  const displayEmoji = emojiTokens[0] === ANY_EMOJI ? ANY_EMOJI_DISPLAY_FALLBACK : emojiTokens[0];
  return `${displayEmoji} **${count}**`;
}

// --- Reaction tracking (called from the messageReactionAdd/Remove events) ---

// Creates/updates/removes the starboard post for one board/message pair, given the
// already-computed total vote count. Returns 'created' | 'updated' | 'removed' |
// 'unchanged' | 'failed', so callers (like the lookback scan) can track outcomes
// without a second round-trip to re-check state.
async function syncStarboardPost(guild, board, message, count) {
  const post = await repo.getPost(board.id, message.id);

  if (count < board.threshold) {
    if (post) {
      const postChannel = await guild.channels.fetch(board.post_channel_id).catch(() => null);
      const starMessage = postChannel ? await postChannel.messages.fetch(post.starboard_message_id).catch(() => null) : null;
      if (starMessage) await starMessage.delete().catch(() => {});
      await repo.deletePost(board.id, message.id);
      return 'removed';
    }
    return 'unchanged';
  }

  if (post) {
    const postChannel = await guild.channels.fetch(board.post_channel_id).catch(() => null);
    const starMessage = postChannel ? await postChannel.messages.fetch(post.starboard_message_id).catch(() => null) : null;

    if (starMessage) {
      await starMessage
        .edit({ content: formatStarLine(board, count), embeds: [buildStarboardEmbed(message, count)] })
        .catch(() => {});
      await repo.updatePostCount(board.id, message.id, count);
      return 'updated';
    }

    // The starboard message was deleted by hand (or the channel is gone): forget the
    // record so it's free to be recreated below, since the message still qualifies.
    await repo.deletePost(board.id, message.id);
  }

  const postChannel = await guild.channels.fetch(board.post_channel_id).catch(() => null);
  if (!postChannel || !postChannel.isTextBased()) return 'failed';

  try {
    const sent = await postChannel.send({
      content: formatStarLine(board, count),
      embeds: [buildStarboardEmbed(message, count)],
    });
    // Auto-react with a star on the bot's own repost, so people can keep starring the
    // message right from the starboard channel — further reactions on THIS message
    // boost the count too (see handleStarboardPostReactionChange below).
    await sent.react(REPOST_AUTO_STAR_EMOJI).catch((err) => {
      console.warn(`[starboard] Could not auto-react to the starboard post for board "${board.name}":`, err.message);
    });
    await repo.upsertPost(guild.id, board.id, message.id, message.channelId, sent.id, count);
    return 'created';
  } catch (err) {
    console.warn(`[starboard] Could not post to the starboard channel for board "${board.name}" in guild ${guild.id}:`, err.message);
    return 'failed';
  }
}

// Counts distinct (non-bot, non-author) users who reacted to the ORIGINAL message with
// any of the board's configured emojis. Doesn't touch the starboard post — just a count.
// `minNeeded` is how much THIS function's result alone needs to reach for the message's
// overall total to qualify (board.threshold minus any repost boost already known) — lets
// the caller skip the expensive part entirely when it's not needed:
//   - minNeeded <= 0: the repost boost alone already meets the threshold, no need to
//     look at the original reactions at all.
//   - otherwise, the raw (pre-dedup) reaction counts Discord already includes on the
//     message are a guaranteed UPPER BOUND on the true qualifying count (dedup/exclusion
//     can only ever reduce it) — if even that can't reach minNeeded, there's no need to
//     fetch the actual list of who reacted, which is one Discord API call per matching
//     reaction and by far the most expensive part of checking each message.
async function countOriginalReactions(board, message, minNeeded = board.threshold) {
  if (!matchesContentType(message, board.content_type)) return 0;
  if (minNeeded <= 0) return 0;

  const emojiTokens = JSON.parse(board.emojis);
  const matchingReactions =
    emojiTokens[0] === ANY_EMOJI
      ? [...message.reactions.cache.values()]
      : [...message.reactions.cache.values()].filter((r) =>
          emojiTokens.map(emojiKeyFromToken).includes(emojiKeyFromReactionEmoji(r.emoji))
        );

  const upperBound = matchingReactions.reduce((sum, r) => sum + r.count, 0);
  if (upperBound < minNeeded) return 0;

  const userIds = new Set();
  for (const reaction of matchingReactions) {
    const users = await reaction.users.fetch().catch(() => null);
    if (!users) continue;
    for (const user of users.values()) {
      if (user.bot) continue;
      if (message.author && user.id === message.author.id) continue; // no self-starring
      userIds.add(user.id);
    }
  }

  return userIds.size;
}

// Counts distinct non-bot users who reacted with the star emoji on the starboard's OWN
// repost of a message — this is the "keep starring it from the starboard channel"
// boost. Excluding bots naturally excludes the bot's own seed reaction, without relying
// on a fragile "-1" assumption.
async function countRepostBoost(repostMessage) {
  const starReaction = repostMessage.reactions.cache.find(
    (r) => emojiKeyFromReactionEmoji(r.emoji) === REPOST_AUTO_STAR_EMOJI
  );
  if (!starReaction) return 0;

  const users = await starReaction.users.fetch().catch(() => null);
  if (!users) return 0;

  let count = 0;
  for (const user of users.values()) {
    if (user.bot) continue;
    count++;
  }
  return count;
}

// Computes a message's full current count (reactions on the original + any boost from
// people re-starring its already-posted repost) without touching the DB/starboard post —
// shared by the normal live-sync path and the lookback "top N" selection, which needs to
// know every candidate's count before deciding who actually gets posted.
async function computeFullCount(guild, board, message) {
  // Repost boost is checked FIRST (a single cheap DB lookup, versus one Discord API call
  // per matching reaction below) so countOriginalReactions can know exactly how much it
  // still needs to find, and skip fetching reaction users entirely for messages that
  // obviously can't reach that regardless — this is the single biggest cost in a lookback
  // scan across a large channel, where the vast majority of messages don't qualify.
  const existingPost = await repo.getPost(board.id, message.id);
  let repostBoost = 0;
  if (existingPost) {
    const postChannel = await guild.channels.fetch(board.post_channel_id).catch(() => null);
    const repostMessage = postChannel
      ? await postChannel.messages.fetch(existingPost.starboard_message_id).catch(() => null)
      : null;
    if (repostMessage) repostBoost = await countRepostBoost(repostMessage);
  }

  const originalCount = await countOriginalReactions(board, message, board.threshold - repostBoost);
  return originalCount + repostBoost;
}

async function countAndSync(guild, board, message) {
  const count = await computeFullCount(guild, board, message);
  return syncStarboardPost(guild, board, message, count);
}

// Called on every messageReactionAdd/Remove for a message in a channel that at least
// one starboard is watching. Re-syncs every matching board for that message.
async function handleReactionChange(reaction, guild) {
  if (!(await repo.isEnabled(guild.id))) return;

  const boards = await repo.getBoardsWatchingChannel(guild.id, reaction.message.channelId);
  if (boards.length === 0) return;

  let message;
  try {
    message = await reaction.message.fetch();
  } catch {
    return; // message (or channel) no longer exists
  }

  for (const board of boards) {
    await countAndSync(guild, board, message).catch((err) =>
      console.error(`[starboard] Error syncing board "${board.name}" for message ${message.id}:`, err)
    );
  }
}

// Called on every messageReactionAdd/Remove for a message that turns out to be a
// starboard's own repost of something (i.e. someone reacted to the copy sitting in the
// post channel, not the original). Recomputes the combined total and re-syncs.
async function handleStarboardPostReactionChange(reaction, guild) {
  const post = await repo.getPostByStarboardMessageId(reaction.message.id);
  if (!post) return; // not a tracked starboard repost

  const board = await repo.getById(post.starboard_id);
  if (!board || board.guild_id !== guild.id) return;
  if (!(await repo.isEnabled(guild.id))) return;

  const watchChannel = await guild.channels.fetch(board.watch_channel_id).catch(() => null);
  const originalMessage = watchChannel
    ? await watchChannel.messages.fetch(post.original_message_id).catch(() => null)
    : null;
  if (!originalMessage) return; // original message is gone; leave the existing post as-is

  await countAndSync(guild, board, originalMessage).catch((err) =>
    console.error(`[starboard] Error syncing board "${board.name}" from a repost reaction (message ${originalMessage.id}):`, err)
  );
}

// Called on messageDelete: removes every starboard post that pointed at the deleted
// original message, across every board, so a starred-then-deleted message doesn't stay
// visible on the starboard forever.
async function handleMessageDelete(message) {
  if (!message.guildId) return;

  const posts = await repo.getPostsForOriginalMessage(message.guildId, message.id);
  for (const post of posts) {
    const board = await repo.getById(post.starboard_id);
    if (board) {
      const postChannel = await message.client.channels.fetch(board.post_channel_id).catch(() => null);
      const starMessage = postChannel ? await postChannel.messages.fetch(post.starboard_message_id).catch(() => null) : null;
      if (starMessage) await starMessage.delete().catch(() => {});
    }
    await repo.deletePost(post.starboard_id, post.original_message_id);
  }
}

// --- Lookback (/starboard lookback) ---

const LOOKBACK_DEFAULT_LIMIT = 200;
const LOOKBACK_MAX_LIMIT = 1000;
// Higher ceiling used for date-bounded lookbacks (since_year_start / since_date), since a
// long stretch of history can easily exceed the normal message-count limit above. Still
// bounded, so a runaway-active channel can't turn this into an unbounded scan.
const LOOKBACK_YEAR_HARD_CAP = 20000;
const MESSAGE_FETCH_PAGE_SIZE = 100; // Discord's own per-call cap
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DISCORD_EPOCH_MS = 1420070400000n; // 2015-01-01T00:00:00.000Z
const MAX_LOOKBACK_CHANNELS = 5; // 1 primary watch channel + up to 4 extras
const MAX_LOOKBACK_TOP_N = 100;

// Builds a Discord snowflake for a given UTC instant. Not a real object's ID — just a
// synthetic cursor Discord's API accepts as a `before` value, letting a scan start from
// an arbitrary point in time instead of only "now".
function timestampToSnowflake(timestampMs) {
  const ms = BigInt(Math.floor(timestampMs)) - DISCORD_EPOCH_MS;
  return (ms << 22n).toString();
}

// Fetches up to `limit` messages in `channel`, newest first, paginating through
// Discord's 100-per-call cap. Stops early (without throwing) if it runs out of history
// or loses read access partway through.
// - `sinceTimestamp` (optional): stop once a message older than this instant is reached,
//   excluding it and anything older from the result.
// - `untilTimestampExclusive` (optional): start from just before this instant instead of
//   from the most recent message, so the scan only covers a specific window.
async function fetchMessagesUntil(channel, { limit, sinceTimestamp, untilTimestampExclusive }) {
  const collected = [];
  let before = untilTimestampExclusive !== undefined ? timestampToSnowflake(untilTimestampExclusive) : undefined;

  while (collected.length < limit) {
    const pageSize = Math.min(MESSAGE_FETCH_PAGE_SIZE, limit - collected.length);
    const batch = await channel.messages.fetch({ limit: pageSize, before }).catch(() => null);
    if (!batch || batch.size === 0) break;

    let reachedCutoff = false;
    for (const message of batch.values()) {
      if (sinceTimestamp !== undefined && message.createdTimestamp < sinceTimestamp) {
        reachedCutoff = true;
        break; // batch is newest-first, so everything from here on is even older
      }
      collected.push(message);
      if (collected.length >= limit) break;
    }

    before = batch.last().id;
    if (batch.size < pageSize || reachedCutoff) break;
  }

  return collected;
}

// Parses "DD/MM/YY" or "DD/MM/YYYY" into midnight of that date, in the bot's configured
// timezone. A 2-digit year follows the common pivot: 00–79 -> 20xx, 80–99 -> 19xx.
// `optionName` is only used to make the error message point at the right command option.
function parseDayMonthYear(input, optionName) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(input.trim());
  if (!match) {
    throw new ValidationError(`Invalid date for "${optionName}". Use DD/MM/YY or DD/MM/YYYY — e.g. 15/03/25 or 15/03/2025.`);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) {
    year += year <= 79 ? 2000 : 1900;
  }

  // Reject calendar-impossible dates (e.g. 31/02/25) instead of silently rolling over.
  const roundTrip = new Date(year, month - 1, day);
  const isValidCalendarDate =
    roundTrip.getFullYear() === year && roundTrip.getMonth() === month - 1 && roundTrip.getDate() === day;
  if (!isValidCalendarDate) {
    throw new ValidationError(`"${input}" isn't a valid date.`);
  }

  return zonedTimeToUtc(year, month - 1, day, 0, 0, 0, config.timezone);
}

function parseSinceDate(input) {
  const midnight = parseDayMonthYear(input, 'since_date');
  if (midnight.getTime() > Date.now()) {
    throw new ValidationError(`"${input}" is in the future.`);
  }
  return midnight;
}

// `until_date` is inclusive of the whole day, so the actual cutoff used for fetching is
// midnight of the FOLLOWING day (exclusive upper bound).
function parseUntilDate(input) {
  const midnight = parseDayMonthYear(input, 'until_date');
  return new Date(midnight.getTime() + ONE_DAY_MS);
}

// Scans a single channel and applies the lookback logic to every (non-bot) message in
// it, accumulating into `stats`. Shared by every channel a lookback covers.
async function scanChannelForLookback(guild, scanBoard, channel, fetchOptions, stats) {
  // fetchMessagesUntil paginates newest-first (that's how Discord's API and the cutoff
  // logic work), but the scan itself processes oldest-to-newest — so starboard posts (and
  // their embeds' timestamps) appear in the same order the messages were actually sent.
  const messages = await fetchMessagesUntil(channel, fetchOptions);
  messages.reverse();

  for (const message of messages) {
    if (message.author?.bot) continue;
    stats.scanned++;

    // A single message failing (a transient Discord/Turso hiccup, a message that
    // vanished mid-scan, ...) must not abort the whole lookback — log it, count it, and
    // keep going. Without this, one bad message used to silently cut the scan short.
    try {
      const result = await countAndSync(guild, scanBoard, message);
      if (result === 'created') stats.qualified++;
    } catch (err) {
      stats.errors++;
      console.error(`[starboard] Lookback error on message ${message.id} (board "${scanBoard.name}"):`, err);
    }
  }
}

// Same scan as above, but for "top N" mode: computes each qualifying message's count and
// collects it as a candidate instead of posting immediately — nothing is posted until
// every scanned channel has been checked and the actual top N (across all of them) is
// known, since the ranking has to be global, not per-channel.
async function scanChannelForCandidates(guild, scanBoard, channel, fetchOptions, stats, candidates) {
  const messages = await fetchMessagesUntil(channel, fetchOptions);
  messages.reverse();

  for (const message of messages) {
    if (message.author?.bot) continue;
    stats.scanned++;

    try {
      const count = await computeFullCount(guild, scanBoard, message);
      if (count >= scanBoard.threshold) {
        candidates.push({ message, count });
      }
    } catch (err) {
      stats.errors++;
      console.error(`[starboard] Lookback error on message ${message.id} (board "${scanBoard.name}"):`, err);
    }
  }
}

// Scans a starboard's watch channel (and, optionally, extra channels) for messages that
// already qualify but haven't been picked up yet — the most recent `limit` messages by
// default, or a date-bounded window using `sinceDateInput`/`sinceYearStart` (start) and
// `untilDateInput` (end). Also supports one-off overrides — `contentType`, `emojisInput`,
// `threshold` — that apply only to this scan, without touching the starboard's saved
// configuration. This backfills a starboard that was just created, or catches up on
// messages missed while offline, instead of only reacting to things going forward.
async function runLookback(
  guild,
  name,
  {
    limit = LOOKBACK_DEFAULT_LIMIT,
    sinceYearStart = false,
    sinceDateInput,
    untilDateInput,
    contentType,
    emojisInput,
    threshold,
    extraChannels = [],
    topN,
  } = {}
) {
  const board = await repo.getByName(guild.id, name);
  if (!board) {
    throw new ValidationError(`No starboard named "${name}" found in this server.`);
  }
  if (!(await repo.isEnabled(guild.id))) {
    throw new ValidationError('The Starboard feature is currently disabled in this server.');
  }
  if (sinceYearStart && sinceDateInput) {
    throw new ValidationError('Use either "since_year_start" or "since_date", not both.');
  }
  if (extraChannels.length > MAX_LOOKBACK_CHANNELS - 1) {
    throw new ValidationError(`You can scan at most ${MAX_LOOKBACK_CHANNELS} channels in one lookback.`);
  }
  if (topN !== undefined && (!Number.isInteger(topN) || topN < 1 || topN > MAX_LOOKBACK_TOP_N)) {
    throw new ValidationError(`"top" must be a whole number between 1 and ${MAX_LOOKBACK_TOP_N}.`);
  }

  // All value-only validation happens up front, before any Discord/DB calls beyond the
  // board lookup above — so a bad option value fails fast without wasting API calls.
  const overrides = {};
  if (contentType !== undefined) {
    assertValidContentType(contentType);
    overrides.content_type = contentType;
  }
  if (emojisInput !== undefined) {
    overrides.emojis = JSON.stringify(parseEmojis(emojisInput));
  }
  if (threshold !== undefined) {
    assertValidThreshold(threshold);
    overrides.threshold = threshold;
  }
  const scanBoard = Object.keys(overrides).length > 0 ? { ...board, ...overrides } : board;

  let sinceTimestamp;
  if (sinceDateInput) {
    sinceTimestamp = parseSinceDate(sinceDateInput).getTime();
  } else if (sinceYearStart) {
    sinceTimestamp = startOfCurrentYear(config.timezone).getTime();
  }

  let untilTimestampExclusive;
  if (untilDateInput) {
    untilTimestampExclusive = parseUntilDate(untilDateInput).getTime();
    if (sinceTimestamp !== undefined && untilTimestampExclusive <= sinceTimestamp) {
      throw new ValidationError('"until_date" must be after "since_date"/the start of the year.');
    }
  }

  // Resolve every channel to scan: the board's own watch channel plus any extras,
  // deduplicated (an admin might accidentally list the watch channel again).
  const channelIds = [...new Set([board.watch_channel_id, ...extraChannels.map((c) => c.id)])];
  const channels = [];
  const inaccessibleChannelIds = [];
  for (const channelId of channelIds) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      channels.push(channel);
    } else {
      inaccessibleChannelIds.push(channelId);
    }
  }
  if (channels.length === 0) {
    throw new ValidationError('None of the channels for this lookback could be accessed — check the bot still has access to them.');
  }

  const fetchOptions = {
    limit: sinceTimestamp !== undefined ? LOOKBACK_YEAR_HARD_CAP : limit,
    sinceTimestamp,
    untilTimestampExclusive,
  };

  const stats = {
    scanned: 0,
    qualified: 0,
    errors: 0,
    channelsScanned: channels.length,
    inaccessibleChannelIds,
    contentType: scanBoard.content_type,
    emojis: JSON.parse(scanBoard.emojis),
    threshold: scanBoard.threshold,
    topN,
  };

  if (topN !== undefined) {
    // "Top N" mode: nothing gets posted until every channel has been scanned and counted,
    // since the ranking has to be decided across all of them together, not per-channel.
    const candidates = [];
    for (const channel of channels) {
      await scanChannelForCandidates(guild, scanBoard, channel, fetchOptions, stats, candidates);
    }

    // Highest count first; a stable sort keeps ties in the order they were scanned
    // (oldest-first), which is as good a tiebreaker as any.
    candidates.sort((a, b) => b.count - a.count);

    // Ties AT the cutoff are all included, so this can post more than topN messages if
    // several are tied for the last spot — e.g. asking for the top 10 with three-way tie
    // for 10th place posts all 12.
    let selected = candidates;
    if (candidates.length > topN) {
      const cutoffCount = candidates[topN - 1].count;
      selected = candidates.filter((c) => c.count >= cutoffCount);
    }

    for (const { message, count } of selected) {
      try {
        const result = await syncStarboardPost(guild, scanBoard, message, count);
        if (result === 'created') stats.qualified++;
      } catch (err) {
        stats.errors++;
        console.error(`[starboard] Lookback error posting message ${message.id} (board "${scanBoard.name}"):`, err);
      }
    }

    stats.candidatesFound = candidates.length;
    stats.posted = selected.length;
  } else {
    for (const channel of channels) {
      await scanChannelForLookback(guild, scanBoard, channel, fetchOptions, stats);
    }
  }

  return stats;
}

module.exports = {
  ValidationError,
  CONTENT_TYPES,
  DEFAULT_CONTENT_TYPE,
  LOOKBACK_DEFAULT_LIMIT,
  LOOKBACK_MAX_LIMIT,
  MAX_LOOKBACK_CHANNELS,
  MAX_LOOKBACK_TOP_N,
  isEnabled,
  setEnabled,
  create,
  edit,
  remove,
  listAll,
  getNamesList,
  formatEmojisForDisplay,
  handleReactionChange,
  handleStarboardPostReactionChange,
  handleMessageDelete,
  runLookback,
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const repo = require('./themesRepository');
const config = require('../../config/config');

// Straight copy of qotdManager.js — same validation/scheduling/posting logic, just posting
// a "Tema del giorno" embed instead of a question. See that file for the reasoning behind
// the design choices (live-computed exhaustion, poll-based scheduler instead of dynamic
// cron expressions).

const MAX_THEME_LENGTH = 500;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_INTERVAL_HOURS = 24 * 30; // 30 days — sanity cap, not a real-world limit

class ValidationError extends Error {}

// --- Feature toggle ---

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

async function getConfig(guildId) {
  return repo.getConfig(guildId);
}

// --- Config setters (validated) ---

async function setChannel(guild, channel) {
  const botMember = guild.members.me;
  const canPost = botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  if (!canPost) {
    throw new ValidationError(`Non ho i permessi per scrivere in ${channel}.`);
  }
  await repo.setChannel(guild.id, channel.id);
}

async function setRole(guildId, role) {
  // `null` clears the ping entirely — the role is optional (post without a mention).
  await repo.setRole(guildId, role ? role.id : null);
}

async function setSchedule(guildId, { scheduleMode, dailyTime, intervalHours }) {
  if (scheduleMode === 'daily') {
    if (!dailyTime || !HHMM_RE.test(dailyTime)) {
      throw new ValidationError('Orario non valido — usa il formato HH:mm (es. 09:00).');
    }
    await repo.setSchedule(guildId, { scheduleMode: 'daily', dailyTime, intervalHours: null });
  } else if (scheduleMode === 'interval') {
    const hours = Number(intervalHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_INTERVAL_HOURS) {
      throw new ValidationError(`Il numero di ore deve essere un intero tra 1 e ${MAX_INTERVAL_HOURS}.`);
    }
    await repo.setSchedule(guildId, { scheduleMode: 'interval', dailyTime: null, intervalHours: hours });
  } else {
    throw new ValidationError('Modalità di programmazione non valida.');
  }
}

// --- Themes CRUD ---

function validateThemeText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new ValidationError('Il tema non può essere vuoto.');
  if (trimmed.length > MAX_THEME_LENGTH) throw new ValidationError(`Il tema non può superare ${MAX_THEME_LENGTH} caratteri.`);
  return trimmed;
}

async function listThemes(guildId) {
  return repo.listThemes(guildId);
}

async function addTheme(guildId, text) {
  const theme = validateThemeText(text);
  await repo.addTheme(guildId, theme, 'manual');
}

async function editTheme(guildId, id, text) {
  const theme = validateThemeText(text);
  const affected = await repo.updateThemeText(guildId, id, theme);
  if (affected === 0) throw new ValidationError('Tema non trovato.');
}

async function removeTheme(guildId, id) {
  await repo.removeTheme(guildId, id);
}

async function reorderThemes(guildId, orderedIds) {
  await repo.reorderThemes(guildId, orderedIds);
}

// --- Posting ---

// Builds the same {dateKey, hhmm} pair the schedule check compares against, entirely
// from Intl (no extra dependency) — same technique as src/utils/timezoneDate.js, just
// formatting "now" instead of converting a wall-clock date.
function nowPartsInTimezone(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) === 24 ? '00' : parts.hour;
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${hour}:${parts.minute}` };
}

function dateKeyOf(timestamp, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Posts whichever theme the queue's cursor currently points to, regardless of schedule —
// used both by the scheduler (once it's decided a post is due) and by /themes post (an
// explicit "post the next one right now").
async function postNext(client, guildId) {
  const cfg = await repo.getConfig(guildId);
  if (!cfg.channel_id) return { posted: false, reason: 'no_channel_configured' };

  const themes = await repo.listThemes(guildId);
  if (themes.length === 0) return { posted: false, reason: 'no_themes' };

  const cursor = Math.min(cfg.next_position, themes.length);
  if (cursor >= themes.length) return { posted: false, reason: 'exhausted' };

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { posted: false, reason: 'guild_not_found' };

  const channel = guild.channels.cache.get(cfg.channel_id);
  if (!channel) return { posted: false, reason: 'channel_not_found' };

  const botMember = guild.members.me;
  const canPost =
    botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  if (!canPost) return { posted: false, reason: 'missing_permission' };

  const theme = themes[cursor];
  const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle('🎨 Tema del giorno').setDescription(theme.theme);

  await channel.send({
    content: cfg.role_id ? `<@&${cfg.role_id}>` : undefined,
    embeds: [embed],
    allowedMentions: cfg.role_id ? { roles: [cfg.role_id] } : { parse: [] },
  });

  await repo.markPosted(guildId, cursor + 1);
  return { posted: true, theme, remaining: themes.length - cursor - 1 };
}

// Checked by the scheduler for every enabled guild — decides whether it's time to post,
// based on the configured schedule, then delegates to postNext if so.
async function checkAndPostIfDue(client, guildId) {
  if (!(await repo.isEnabled(guildId))) return { posted: false, reason: 'disabled' };

  const cfg = await repo.getConfig(guildId);
  if (!cfg.channel_id) return { posted: false, reason: 'no_channel_configured' };

  const timeZone = config.timezone;
  const { dateKey, hhmm } = nowPartsInTimezone(timeZone);

  let due = false;
  if (cfg.schedule_mode === 'daily') {
    const lastPostedDateKey = cfg.last_posted_at ? dateKeyOf(cfg.last_posted_at, timeZone) : null;
    due = Boolean(cfg.daily_time) && hhmm >= cfg.daily_time && lastPostedDateKey !== dateKey;
  } else if (cfg.schedule_mode === 'interval') {
    const intervalMs = (cfg.interval_hours || 0) * 60 * 60 * 1000;
    due = intervalMs > 0 && (!cfg.last_posted_at || Date.now() - cfg.last_posted_at >= intervalMs);
  }

  if (!due) return { posted: false, reason: 'not_due' };
  return postNext(client, guildId);
}

// Runs the due-check for every guild that has Themes enabled with a channel configured —
// called by themesScheduler on its polling interval.
async function checkAllDue(client) {
  const guildIds = await repo.getAllConfiguredGuildIds();
  for (const guildId of guildIds) {
    try {
      const result = await checkAndPostIfDue(client, guildId);
      if (result.posted) {
        console.log(`[themes] Posted the next theme in guild ${guildId} (${result.remaining} left in the queue).`);
      } else if (result.reason === 'exhausted') {
        console.warn(`[themes] Guild ${guildId}'s theme queue is exhausted — posting paused until more are added.`);
      }
    } catch (err) {
      console.error(`[themes] Error checking/posting for guild ${guildId}:`, err);
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
  setSchedule,
  listThemes,
  addTheme,
  editTheme,
  removeTheme,
  reorderThemes,
  postNext,
  checkAndPostIfDue,
  checkAllDue,
};

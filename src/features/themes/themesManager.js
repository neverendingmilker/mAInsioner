const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const repo = require('./themesRepository');
const config = require('../../config/config');

// Straight copy of qotdManager.js — same validation/scheduling/posting logic, just posting
// a "Tema del giorno" embed instead of a question. See that file for the reasoning behind
// the design choices (public-CSV-only sheet import, live-computed exhaustion, poll-based
// scheduler instead of dynamic cron expressions).

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

// --- Google Sheet import ---
// Deliberately only supports a published-CSV link (Google Sheets: File → Condividi →
// Pubblica sul web → CSV) — no Google API credentials needed, just a plain fetch(). Which
// column holds the theme and whether the first row is a header are both figured out from
// the sheet's own content instead of assumed — see chooseThemeColumn/firstRowIsHeader.

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function setSheetUrl(guildId, url) {
  const trimmed = (url || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new ValidationError('Il link deve essere un URL valido (http:// o https://).');
  }
  await repo.setSheetUrl(guildId, trimmed);
  return trimmed;
}

// Picks ONE column to use for the whole sheet, instead of the longest cell independently
// per row — a per-row pick can jump between columns if some row's metadata cell happens
// to be long, while the real theme column stays consistent. The theme column is whichever
// one is both populated in most rows and long on average — an id/category/date column is
// short and/or sparse next to it either way.
function chooseThemeColumn(rows) {
  const numCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  let bestCol = 0;
  let bestScore = -1;
  for (let c = 0; c < numCols; c++) {
    const cells = rows.map((r) => (r[c] || '').trim()).filter((v) => v.length > 0);
    if (cells.length === 0) continue;
    const avgLen = cells.reduce((sum, v) => sum + v.length, 0) / cells.length;
    const score = avgLen * cells.length; // rewards a column that's both long AND consistently filled
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}

// Once the theme column is known, decides whether ITS first cell is a header label
// ("Tema", "Idea del giorno", ...) or already real data — rather than always assuming a
// header row is present. A header reads as a short label; real theme text is virtually
// always noticeably longer, so a first cell much shorter than the rest of that same
// column is the signal to skip it.
function firstRowIsHeader(columnValues) {
  const [first, ...rest] = columnValues;
  const restValues = rest.filter((v) => v.length > 0);
  if (!first || restValues.length === 0) return false; // nothing to compare against — assume it's data
  const avgRestLen = restValues.reduce((sum, v) => sum + v.length, 0) / restValues.length;
  return avgRestLen > 0 && first.length < avgRestLen * 0.6;
}

// Fetches the CSV, skips rows already present (exact text match, case-insensitive) so
// syncing repeatedly doesn't create duplicates, and appends the rest at the end of the
// queue (in sheet order).
async function syncFromSheet(guildId, url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new ValidationError(`Impossibile raggiungere il link: ${err.message}`);
  }
  if (!response.ok) {
    throw new ValidationError(`Il link ha risposto con un errore (HTTP ${response.status}).`);
  }

  const text = await response.text();
  const rows = parseCsv(text).filter((r) => r.some((cell) => (cell || '').trim().length > 0));
  const themeCol = chooseThemeColumn(rows);
  const columnValues = rows.map((r) => (r[themeCol] || '').trim());
  const dataValues = firstRowIsHeader(columnValues) ? columnValues.slice(1) : columnValues;
  const candidates = dataValues.filter((v) => v.length > 0);

  const existing = new Set((await repo.listThemes(guildId)).map((t) => t.theme.trim().toLowerCase()));
  const seenInBatch = new Set();
  let imported = 0;

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (existing.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    if (candidate.length > MAX_THEME_LENGTH) continue; // silently skip absurdly long cells
    await repo.addTheme(guildId, candidate, 'sheet');
    imported++;
  }

  return { imported, total: candidates.length, skipped: candidates.length - imported };
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
  setSheetUrl,
  syncFromSheet,
  postNext,
  checkAndPostIfDue,
  checkAllDue,
};

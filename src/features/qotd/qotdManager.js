const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const repo = require('./qotdRepository');
const config = require('../../config/config');

const MAX_QUESTION_LENGTH = 500;
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

// --- Questions CRUD ---

function validateQuestionText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new ValidationError('La domanda non può essere vuota.');
  if (trimmed.length > MAX_QUESTION_LENGTH) throw new ValidationError(`La domanda non può superare ${MAX_QUESTION_LENGTH} caratteri.`);
  return trimmed;
}

async function listQuestions(guildId) {
  return repo.listQuestions(guildId);
}

async function addQuestion(guildId, text) {
  const question = validateQuestionText(text);
  await repo.addQuestion(guildId, question, 'manual');
}

async function editQuestion(guildId, id, text) {
  const question = validateQuestionText(text);
  const affected = await repo.updateQuestionText(guildId, id, question);
  if (affected === 0) throw new ValidationError('Domanda non trovata.');
}

async function removeQuestion(guildId, id) {
  await repo.removeQuestion(guildId, id);
}

async function reorderQuestions(guildId, orderedIds) {
  await repo.reorderQuestions(guildId, orderedIds);
}

// --- Google Sheet import ---
// Deliberately only supports a published-CSV link (Google Sheets: File → Condividi →
// Pubblica sul web → CSV) — no Google API credentials needed, just a plain fetch(). The
// first row is always treated as a header and skipped; the first column of every row
// after that becomes one question.

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

// Picks whichever cell in a sheet row actually holds the question, without assuming a
// fixed column (sheets often have it alongside a row number, category, or timestamp
// column). A question reads as a question — prefer a cell ending in "?", the strongest
// signal available; if the longest of those has a tie, or no cell ends in "?" at all
// (e.g. imperative-style prompts), fall back to the longest cell overall, since metadata
// columns are still reliably shorter than real question text either way.
function pickQuestionCell(row) {
  const cells = row.map((cell) => (cell || '').trim()).filter((v) => v.length > 0);
  if (cells.length === 0) return '';
  const questionCells = cells.filter((v) => v.endsWith('?'));
  const pool = questionCells.length > 0 ? questionCells : cells;
  return pool.reduce((longest, v) => (v.length > longest.length ? v : longest), '');
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
  const rows = parseCsv(text);
  const dataRows = rows.slice(1); // first row is always treated as a header
  const candidates = dataRows.map(pickQuestionCell).filter((v) => v.length > 0);

  const existing = new Set((await repo.listQuestions(guildId)).map((q) => q.question.trim().toLowerCase()));
  const seenInBatch = new Set();
  let imported = 0;

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (existing.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    if (candidate.length > MAX_QUESTION_LENGTH) continue; // silently skip absurdly long cells
    await repo.addQuestion(guildId, candidate, 'sheet');
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

// Posts whichever question the queue's cursor currently points to, regardless of
// schedule — used both by the scheduler (once it's decided a post is due) and by
// /qotd post (an explicit "post the next one right now").
async function postNext(client, guildId) {
  const cfg = await repo.getConfig(guildId);
  if (!cfg.channel_id) return { posted: false, reason: 'no_channel_configured' };

  const questions = await repo.listQuestions(guildId);
  if (questions.length === 0) return { posted: false, reason: 'no_questions' };

  const cursor = Math.min(cfg.next_position, questions.length);
  if (cursor >= questions.length) return { posted: false, reason: 'exhausted' };

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { posted: false, reason: 'guild_not_found' };

  const channel = guild.channels.cache.get(cfg.channel_id);
  if (!channel) return { posted: false, reason: 'channel_not_found' };

  const botMember = guild.members.me;
  const canPost =
    botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  if (!canPost) return { posted: false, reason: 'missing_permission' };

  const question = questions[cursor];
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('❓ Domanda del giorno').setDescription(question.question);

  await channel.send({
    content: cfg.role_id ? `<@&${cfg.role_id}>` : undefined,
    embeds: [embed],
    allowedMentions: cfg.role_id ? { roles: [cfg.role_id] } : { parse: [] },
  });

  await repo.markPosted(guildId, cursor + 1);
  return { posted: true, question, remaining: questions.length - cursor - 1 };
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

// Runs the due-check for every guild that has QOTD enabled with a channel configured —
// called by qotdScheduler on its polling interval.
async function checkAllDue(client) {
  const guildIds = await repo.getAllConfiguredGuildIds();
  for (const guildId of guildIds) {
    try {
      const result = await checkAndPostIfDue(client, guildId);
      if (result.posted) {
        console.log(`[qotd] Posted the next question in guild ${guildId} (${result.remaining} left in the queue).`);
      } else if (result.reason === 'exhausted') {
        console.warn(`[qotd] Guild ${guildId}'s question queue is exhausted — posting paused until more are added.`);
      }
    } catch (err) {
      console.error(`[qotd] Error checking/posting for guild ${guildId}:`, err);
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
  listQuestions,
  addQuestion,
  editQuestion,
  removeQuestion,
  reorderQuestions,
  setSheetUrl,
  syncFromSheet,
  postNext,
  checkAndPostIfDue,
  checkAllDue,
};

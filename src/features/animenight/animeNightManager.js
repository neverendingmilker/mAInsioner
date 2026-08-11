const repo = require('./animeNightRepository');

class ValidationError extends Error {}

// Splits "Naruto, One Piece / Bleach" into ["Naruto", "One Piece", "Bleach"]
function splitTitles(rawInput) {
  return rawInput
    .split(/[,/]/)
    .map((title) => title.trim())
    .filter((title) => title.length > 0);
}

function formatISODate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Turns the ISO date stored in the DB (YYYY-MM-DD) back into DD/MM/YYYY for display.
function formatDisplayDate(isoDate) {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

// Accepts "DD/MM" or "DD/MM/YYYY", or the words "today"/"yesterday"; defaults to
// today if nothing is given at all.
function parseWatchedDate(dateInput) {
  if (!dateInput || !dateInput.trim()) {
    return formatISODate(new Date());
  }

  const normalized = dateInput.trim().toLowerCase();
  if (normalized === 'today') {
    return formatISODate(new Date());
  }
  if (normalized === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return formatISODate(yesterday);
  }

  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(dateInput.trim());
  if (!match) {
    throw new ValidationError(
      'Invalid date format. Use DD/MM, DD/MM/YYYY, "today" or "yesterday" — e.g. 23/10, 23/10/2026, today.'
    );
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();

  const date = new Date(year, month - 1, day);
  const isValidCalendarDate =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  if (!isValidCalendarDate) {
    throw new ValidationError('Invalid date.');
  }

  return formatISODate(date);
}

async function addAnime(guildId, rawTitles, dateInput, addedBy) {
  const titles = splitTitles(rawTitles);
  if (titles.length === 0) {
    throw new ValidationError('No valid anime titles found. Separate multiple titles with a comma or a slash.');
  }

  const watchedDate = parseWatchedDate(dateInput);
  await repo.addEntries(guildId, titles, watchedDate, addedBy);

  return { titles, watchedDate };
}

// order: 'alphabetical' (default) or 'date' (most recently watched first)
async function getSortedList(guildId, order) {
  const rows = await repo.getAllEntries(guildId);

  return [...rows].sort((a, b) => {
    if (order === 'date') {
      if (a.watched_date !== b.watched_date) return b.watched_date.localeCompare(a.watched_date);
      return a.title.localeCompare(b.title);
    }
    return a.title.localeCompare(b.title);
  });
}

async function getLast(guildId, count) {
  return repo.getLastEntries(guildId, count);
}

// A "session" is every anime that shares the same watched_date (e.g. "Mystery Anime
// Night 3"). Session numbers are NOT stored: they're computed on the fly from the
// chronological order of distinct dates, so they always stay correct even if a
// session's date is later edited/moved.
async function getSessionsList(guildId) {
  const rows = await repo.getAllEntries(guildId);

  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.watched_date)) byDate.set(row.watched_date, []);
    byDate.get(row.watched_date).push(row.title);
  }

  const sortedDates = [...byDate.keys()].sort(); // ISO "YYYY-MM-DD" sorts chronologically as-is

  return sortedDates.map((date, i) => {
    const titles = byDate.get(date);
    return {
      number: i + 1,
      date,
      titles,
      label: `Mystery Anime Night ${i + 1} — ${formatDisplayDate(date)} (${titles.length} anime)`,
    };
  });
}

// Edits an existing session: replaces its anime list, moves it to a new date, or both.
// At least one of newTitlesRaw / newDateInput must be given.
async function editSession(guildId, sessionDate, newTitlesRaw, newDateInput, editedBy) {
  if (!newTitlesRaw && !newDateInput) {
    throw new ValidationError('Provide at least a new list of titles or a new date to change.');
  }

  const existing = await repo.getEntriesForDate(guildId, sessionDate);
  if (existing.length === 0) {
    throw new ValidationError("That session doesn't exist (it may have just been edited or removed).");
  }

  const finalDate = newDateInput ? parseWatchedDate(newDateInput) : sessionDate;

  if (newTitlesRaw) {
    const titles = splitTitles(newTitlesRaw);
    if (titles.length === 0) {
      throw new ValidationError('No valid anime titles found. Separate multiple titles with a comma or a slash.');
    }
    await repo.replaceSession(guildId, sessionDate, finalDate, titles, editedBy);
    return { titles, date: finalDate };
  }

  // Only the date is changing: keep the existing titles untouched.
  await repo.updateSessionDate(guildId, sessionDate, finalDate);
  return { titles: existing.map((e) => e.title), date: finalDate };
}

// Removes exactly one anime entry (by its row id) from whichever session it belongs
// to — the rest of that session is left untouched.
async function removeAnime(guildId, entryId) {
  const allEntries = await repo.getAllEntries(guildId);
  const entry = allEntries.find((e) => String(e.id) === String(entryId));
  if (!entry) {
    throw new ValidationError("That entry doesn't exist (it may have just been removed).");
  }

  await repo.removeEntry(guildId, entry.id);
  return { title: entry.title, date: entry.watched_date };
}

// Flat list of every individual anime entry (across every session), formatted for
// autocomplete on /animenight remove — most recently added ones surface first.
async function getAllEntriesList(guildId) {
  const rows = await repo.getAllEntries(guildId);
  return rows
    .slice()
    .sort((a, b) => Number(a.added_at) - Number(b.added_at))
    .map((row) => ({
      id: row.id,
      label: `${row.title} — ${formatDisplayDate(row.watched_date)}`,
    }));
}

module.exports = {
  ValidationError,
  addAnime,
  removeAnime,
  getSortedList,
  getLast,
  getSessionsList,
  getAllEntriesList,
  editSession,
  formatDisplayDate,
  isEnabled: repo.isEnabled,
  setEnabled: repo.setEnabled,
};

const repo = require('./birthdayRepository');
const { parseDurationToSeconds } = require('../../utils/duration');

const DAYS_PER_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb allows the leap-year margin
const MIN_REMOVE_AFTER_SECONDS = 10; // requested minimum: 10 seconds
const MAX_REMOVE_AFTER_SECONDS = 30 * 86400; // 30 days

class ValidationError extends Error {}

function validateDate(day, month, year) {
  if (month < 1 || month > 12) {
    throw new ValidationError('Month must be a number between 1 and 12.');
  }
  if (day < 1 || day > DAYS_PER_MONTH[month - 1]) {
    throw new ValidationError('Invalid day for the selected month.');
  }
  if (year !== null && year !== undefined) {
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
      throw new ValidationError('Invalid year.');
    }
  }
}

async function addBirthday(guildId, userId, day, month, year = null) {
  validateDate(day, month, year);
  await repo.upsertBirthday(guildId, userId, day, month, year);
}

async function removeBirthday(guildId, userId) {
  await repo.deleteBirthday(guildId, userId);
}

async function getBirthday(guildId, userId) {
  return repo.getBirthday(guildId, userId);
}

async function setBirthdayRole(guildId, roleId) {
  await repo.setBirthdayRole(guildId, roleId);
}

async function setBirthdayChannel(guildId, channelId) {
  await repo.setBirthdayChannel(guildId, channelId);
}

// Accepts strings like "10s", "5m", "24h", "3d" (seconds/minutes/hours/days).
async function setRemoveAfterDuration(guildId, durationInput) {
  let seconds;
  try {
    seconds = parseDurationToSeconds(durationInput);
  } catch (err) {
    throw new ValidationError(err.message);
  }

  if (seconds < MIN_REMOVE_AFTER_SECONDS || seconds > MAX_REMOVE_AFTER_SECONDS) {
    throw new ValidationError('The timer must be between 10s and 30d.');
  }

  await repo.setRemoveAfterSeconds(guildId, seconds);
}

async function getGuildConfig(guildId) {
  return repo.getGuildConfig(guildId);
}

async function isEnabled(guildId) {
  return repo.isEnabled(guildId);
}

async function setEnabled(guildId, enabled) {
  await repo.setEnabled(guildId, enabled);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Computes the next date on which a birthday falls (today included) and how many days are left.
// February 29th, on non-leap years, is celebrated on the 28th.
function nextOccurrence(day, month, today) {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const buildDate = (year) => {
    const realDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
    return new Date(year, month - 1, realDay);
  };

  let candidate = buildDate(todayMidnight.getFullYear());
  if (candidate < todayMidnight) {
    candidate = buildDate(todayMidnight.getFullYear() + 1);
  }

  const daysUntil = Math.round((candidate - todayMidnight) / (1000 * 60 * 60 * 24));
  return { date: candidate, daysUntil };
}

// All birthdays in a guild, grouped by calendar month (January first, December last)
// and sorted by day within each month — NOT by how soon they're coming up.
async function getBirthdaysGroupedByMonth(guildId, today = new Date()) {
  const rows = await repo.getAllBirthdaysInGuild(guildId);

  const withDates = rows
    .map((row) => {
      const { date, daysUntil } = nextOccurrence(row.day, row.month, today);
      return { userId: row.user_id, day: row.day, month: row.month, year: row.year, date, daysUntil };
    })
    .sort((a, b) => a.month - b.month || a.day - b.day);

  const groups = [];
  let currentMonth = null;

  for (const entry of withDates) {
    if (entry.month !== currentMonth) {
      groups.push({ monthLabel: MONTH_NAMES[entry.month - 1], entries: [] });
      currentMonth = entry.month;
    }
    groups[groups.length - 1].entries.push(entry);
  }

  return groups;
}

module.exports = {
  ValidationError,
  addBirthday,
  removeBirthday,
  getBirthday,
  setBirthdayRole,
  setBirthdayChannel,
  setRemoveAfterDuration,
  getGuildConfig,
  isEnabled,
  setEnabled,
  getBirthdaysGroupedByMonth,
  // exposed for the scheduler
  repo,
};

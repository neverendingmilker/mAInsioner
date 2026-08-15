// Shared by create.js and createSelf.js.
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');
const config = require('../../../config/config');
const { zonedTimeToUtc } = require('../../../utils/timezoneDate');

const EXPIRES_AT_FORMAT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

// `expires_in_hours` and `expires_at` are two ways to say the same thing (Discord's API
// only understands a duration in seconds, not an absolute date) — this resolves either
// one into the seconds-from-now value createAssignedInvite actually wants, throwing a
// ValidationError for anything that can't be turned into a valid future duration.
function resolveMaxAgeSeconds(expiresInHours, expiresAt) {
  if (expiresInHours != null && expiresAt) {
    throw new inviteTrackerManager.ValidationError('Specify either `expires_in_hours` or `expires_at`, not both.');
  }

  if (expiresInHours != null) {
    return { maxAgeSeconds: expiresInHours * 3600, expiresAtDate: new Date(Date.now() + expiresInHours * 3600 * 1000) };
  }

  if (expiresAt) {
    const match = expiresAt.trim().match(EXPIRES_AT_FORMAT);
    if (!match) {
      throw new inviteTrackerManager.ValidationError(
        '`expires_at` has to look like `YYYY-MM-DD HH:mm` (e.g. `2026-08-20 18:00`), in Europe/Rome time.'
      );
    }
    const [, year, month, day, hour, minute] = match;
    const expiresAtDate = zonedTimeToUtc(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, config.timezone);
    const maxAgeSeconds = Math.round((expiresAtDate.getTime() - Date.now()) / 1000);
    if (maxAgeSeconds <= 0) {
      throw new inviteTrackerManager.ValidationError('That date/time is in the past.');
    }
    return { maxAgeSeconds, expiresAtDate };
  }

  return { maxAgeSeconds: undefined, expiresAtDate: null };
}

// Accepts a bare code ("abc123"), a full link ("https://discord.gg/abc123"), or one
// with the old-style path ("https://discord.com/invite/abc123") and returns just the code.
function extractInviteCode(input) {
  const trimmed = input.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const segments = trimmed.split('/');
  return segments[segments.length - 1].split('?')[0];
}

module.exports = { resolveMaxAgeSeconds, extractInviteCode };

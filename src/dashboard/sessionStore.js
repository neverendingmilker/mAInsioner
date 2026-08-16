const session = require('express-session');
const db = require('../database/db');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // fallback if a session somehow has no cookie.maxAge
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// express-session Store backed by the same Turso DB every other feature already uses,
// instead of express-session's default MemoryStore. MemoryStore loses every logged-in
// session the moment the process restarts — which on Render happens on every redeploy AND
// every wake-up from the free plan's inactivity sleep — forcing a fresh Discord login each
// time even though the browser's own cookie is still perfectly valid. This one survives
// restarts, so a login actually lasts as long as the cookie says it does.
class SqlSessionStore extends session.Store {
  constructor() {
    super();
    this._cleanup();
    this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
    this._cleanupTimer.unref?.(); // don't hold the process open just for this
  }

  async _cleanup() {
    try {
      await db.ready;
      await db.client.execute({ sql: 'DELETE FROM dashboard_sessions WHERE expires_at < ?', args: [Date.now()] });
    } catch (err) {
      console.error('[dashboard] Session cleanup failed:', err.message);
    }
  }

  async get(sid, callback) {
    try {
      await db.ready;
      const result = await db.client.execute({ sql: 'SELECT data, expires_at FROM dashboard_sessions WHERE sid = ?', args: [sid] });
      const row = result.rows[0];
      if (!row || Number(row.expires_at) < Date.now()) {
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      await db.ready;
      const maxAge = sessionData.cookie?.maxAge;
      const expiresAt = Date.now() + (typeof maxAge === 'number' ? maxAge : DEFAULT_MAX_AGE_MS);
      await db.client.execute({
        sql: `INSERT INTO dashboard_sessions (sid, data, expires_at)
              VALUES (?, ?, ?)
              ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
        args: [sid, JSON.stringify(sessionData), expiresAt],
      });
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await db.ready;
      await db.client.execute({ sql: 'DELETE FROM dashboard_sessions WHERE sid = ?', args: [sid] });
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  // Called on every request when the session middleware is configured with `rolling:
  // true` (see server.js) — pushes the expiry back out without re-writing the session
  // data itself, so an admin who's actively using the dashboard never gets logged out.
  async touch(sid, sessionData, callback) {
    try {
      await db.ready;
      const maxAge = sessionData.cookie?.maxAge;
      const expiresAt = Date.now() + (typeof maxAge === 'number' ? maxAge : DEFAULT_MAX_AGE_MS);
      await db.client.execute({ sql: 'UPDATE dashboard_sessions SET expires_at = ? WHERE sid = ?', args: [expiresAt, sid] });
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }
}

module.exports = { SqlSessionStore };

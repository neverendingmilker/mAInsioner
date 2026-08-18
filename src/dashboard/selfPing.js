const http = require('http');
const https = require('https');

// Render's free tier suspends a Web Service after ~15 minutes with no incoming HTTP
// request — and since the bot and dashboard share this one process/port (see
// server.js's own comment on why), that suspension also freezes every node-cron
// scheduler living in it: Bump Reminder's every-minute due-check, QOTD/Themes' 8h poll,
// Birthday/Incident's daily one. A reminder due while the process is asleep simply never
// fires until something else (e.g. someone opening the dashboard) wakes it back up.
//
// README.md previously documented pointing an EXTERNAL uptime pinger (e.g. cron-job.org)
// at /healthz as the fix for this — that still works, but depends on the person hosting
// the bot having actually set one up and kept it running. This makes the service keep
// itself awake instead, so a forgotten/broken external ping doesn't silently reintroduce
// the same bug. RENDER_EXTERNAL_URL is set automatically by Render on every Web Service;
// outside Render (local dev, a different host) this just logs once and does nothing —
// an external ping (or nothing, for local dev) still works exactly as before.
const PING_INTERVAL_MS = 10 * 60 * 1000; // comfortably under Render's ~15 min idle window

function start() {
  const baseUrl = process.env.RENDER_EXTERNAL_URL;
  if (!baseUrl) {
    console.log('[keepalive] RENDER_EXTERNAL_URL not set — skipping self-ping (expected outside Render; an external uptime ping still works as a fallback).');
    return;
  }

  const target = `${baseUrl.replace(/\/$/, '')}/healthz`;
  const client = target.startsWith('https:') ? https : http;

  function ping() {
    client
      .get(target, (res) => {
        res.resume(); // drain the response body so the socket is freed
      })
      .on('error', (err) => {
        // Not fatal — just means this one ping didn't land in time to matter; the next
        // one 10 minutes later tries again.
        console.warn('[keepalive] Self-ping failed (not fatal):', err.message);
      });
  }

  setInterval(ping, PING_INTERVAL_MS);
  console.log(`[keepalive] Self-ping started (every ${PING_INTERVAL_MS / 60000} min) → ${target}`);
}

module.exports = { start };

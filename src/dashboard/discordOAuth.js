const config = require('../config/config');

const DISCORD_API = 'https://discord.com/api/v10';

// Must exactly match a redirect registered for this app in the Discord Developer Portal
// (OAuth2 → Redirects). Derived from the incoming request rather than a hardcoded env var,
// so it keeps working if the dashboard's URL ever changes — just re-register it on Discord's
// side too. Requires `app.set('trust proxy', ...)` for req.protocol to reflect the original
// scheme when running behind Render's reverse proxy.
function getRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/auth/discord/callback`;
}

// Only asks for `identify` (id, username, avatar) — who's asking, not what servers they're
// in. Whether they're allowed in is decided server-side afterward, by checking their actual
// Administrator permission in the target guild via the bot's own token (see routes/auth.js).
function buildAuthorizeUrl(req) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: 'identify',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.dashboard.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord user fetch failed: ${res.status}`);
  return res.json();
}

module.exports = { getRedirectUri, buildAuthorizeUrl, exchangeCode, fetchDiscordUser };

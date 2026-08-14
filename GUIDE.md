# mAInsioner — User Guide

Every feature can be turned on/off with `/disablefeature feature:<pick one> enabled:true|false` (Admin only), or with that feature's own `disable` subcommand — same on/off flag either way. `/verbal` shares its toggle with `/warning`.

---

## 🎬 Anime Night (`/animenight`)

Tracks a "Mystery Anime Night" watch list, grouped into dated sessions.

- **`/animenight add`** `Admin` — Adds one or more anime to a session (creates it if the date doesn't exist yet).
- **`/animenight edit`** `Admin` — Edits an existing session's titles and/or date (autocomplete).
- **`/animenight remove`** `Admin` — Removes an entire session (autocomplete, numbered chronologically).
- **`/animenight list`** `Everyone` — Lists all sessions, oldest or newest first.
- **`/animenight last`** `Everyone` — Shows the anime from the most recent session.

## 🔁 Autoresponder (`/autoresponder`)

Auto-reacts with emoji to every message in a channel (including threads), with optional content filters and a "redirect to a bot's repost" mode.

- **`/autoresponder add`** `Admin` — Sets up a channel: emoji list, optional filters (attachment/video link/X link), optional redirect-to-bot window.
- **`/autoresponder edit`** `Admin` — Changes settings for an already-configured channel; anything omitted keeps its current value. Autocomplete shows configured channels with a preview.
- **`/autoresponder remove`** `Admin` — Removes it from a channel (same autocomplete).
- **`/autoresponder list`** `Admin` — Lists every configured channel.

## 🎂 Birthdays (`/birthday`)

Assigns a role on someone's birthday and removes it after a set time.

- **`/birthday add`** `Everyone` (Mod for others) — Sets your own birthday, or someone else's if you're a Mod.
- **`/birthday edit`** `Everyone` (Mod for others) — Same rule, for editing.
- **`/birthday remove`** `Everyone` (Mod for others) — Same rule, for removing.
- **`/birthday config`** `Mod` — Sets the birthday role, how long it stays on, and an optional announcement channel.
- **`/birthday list`** `Everyone` — Lists every stored birthday, grouped by month.

## 🔗 Booster Links (`/boosterlink`)

Tracks custom perk roles given to boosters, so they auto-remove when the boost ends.

- **`/boosterlink add`** `Mod` — Links a role to a booster.
- **`/boosterlink edit`** `Mod` — Re-points an existing link to a different role (autocomplete on user/role).
- **`/boosterlink remove`** `Mod` — Stops tracking a link (doesn't remove the role itself).
- **`/boosterlink list`** `Mod` — Lists tracked links, optionally filtered by user. Ephemeral.
- **`/boosterlink exempt`** `Mod` — Manages roles exempt from auto-removal.
- **`/boosterlink disable`** `Admin` — Turns the feature on/off.

## 🔎 Combined Role Search (`/comboroles`)

- **`/comboroles search`** `Mod` — Shows users who have **all** the given roles, optionally excluding anyone with one of up to three "BUT" roles. Paginated.
- **`/comboroles disable`** `Admin` — Turns the feature on/off.

## 📋 Command List (`/commandlist`)

`Mod` — Shows every bot command, who can use it (Admin/Mod/Everyone), and its options (required ones have no brackets). Pulled live from the commands, so it can't drift out of date.

## 🍕 GoosePizza (`/goosepizza`)

A passive word-triggered responder — several independent trigger/channel/emoji combos per server, each reacting or replying when its trigger word/phrase appears.

- **`/goosepizza add`** `Admin` — Creates a trigger: name, word/phrase, emoji, mode (react or reply), channels.
- **`/goosepizza edit`** `Admin` — Changes an existing trigger's word/emoji/mode (autocomplete shows current values).
- **`/goosepizza channels`** `Admin` — Changes which channels a trigger watches.
- **`/goosepizza remove`** `Admin` — Deletes a trigger.
- **`/goosepizza list`** `Admin` — Lists every trigger.
- **`/goosepizza disable`** `Admin` — Turns one trigger, or the whole feature, on/off.

## 🔦 Highlight (`/highlight`)

Personal keyword watcher — get DM'd (with context) when someone says a word/phrase from your list, anywhere in the server. Everyone can use it; `disable` is Admin only.

- **`/highlight add`** — Adds a word/phrase (2–100 chars, up to 25). Matched case-insensitively on word boundaries. Never triggers on your own messages.
- **`/highlight remove`** — Removes one (autocomplete over your list).
- **`/highlight list`** — Shows your words, channel list + mode, and ignored users.
- **`/highlight ignorechannel`** — Toggles a channel on/off your list.
- **`/highlight mode`** — Switches whether that list means "everywhere except these" (default) or "only these".
- **`/highlight ignoreuser`** — Toggles a user on/off your ignore list.
- **`/highlight disable`** `Admin` — Turns the feature on/off.

Notifications: a DM with a couple messages of context, the trigger itself, matched word(s), and a jump link. Capped at one notification per channel every 5 minutes.

## 🍯 Honeypot (`/honeypot`)

`Admin`. Turns a channel into a trap: posts a message with a button, then kicks anyone who isn't Mod/Admin the moment they write there, react to anything there, or click the button.

- **`/honeypot add`** — Sets up the trap channel and posts the bait message (custom text/button label optional).
- **`/honeypot remove`** — Removes the trap and deletes the bait message.
- **`/honeypot list`** — Lists active honeypot channels.
- **`/honeypot disable`** — Turns the feature on/off.

## 🪧 Incident Counter (`/incident`)

Keeps a "days since last incident" sign updated in a channel, auto-incrementing daily.

- **`/incident channel`** `Admin` — Sets which channel shows the sign.
- **`/incident set`** `Admin` — Manually sets the day count.
- **`/incident reset`** `Admin` — Resets to 0 (an incident just happened).
- **`/incident disable`** `Admin` — Turns the feature on/off.

## 🔐 MFA Roles (`/mfaroles`)

`Admin`. Security audit: lists roles with at least one permission Discord requires 2FA for (server-wide and per-channel overrides). `ignore_bots:true` skips bot-owned roles.

## 🛡️ Mod Access (`/modaccess`)

`Admin`. Broader companion to `/mfaroles` — also flags commonly-assumed "mod" permissions (Audit Log, Nicknames, Expressions, Timeout) that aren't actually 2FA-gated, and catches per-channel overrides granted to individual people, not just roles.

## 🖐️ Reaction Limit (`/reactionlimit`)

Caps how many times each person can react per thread — configurable per channel (1–100, default 5). Mods/Admins always exempt.

- **`/reactionlimit add`** `Admin` — Sets the limit for a channel's threads (and optional starter-message exclusion).
- **`/reactionlimit edit`** `Admin` — Changes settings for an already-configured channel (autocomplete shows the current limit).
- **`/reactionlimit remove`** `Admin` — Removes it from a channel.
- **`/reactionlimit list`** `Admin` — Lists every configured channel.
- **`/reactionlimit disable`** `Admin` — Turns the feature on/off.

## 🔗 Role Links (`/rolelink`)

Losing role1 automatically removes role2 (optionally the reverse too).

- **`/rolelink add`** `Admin` — Creates a link, one or more target roles at once, optional two-way removal.
- **`/rolelink edit`** `Admin` — Changes an existing link (autocomplete over configured ones).
- **`/rolelink remove`** `Admin` — Removes a link (same autocomplete).
- **`/rolelink list`** `Mod` — Lists all configured links.
- **`/rolelink disable`** `Admin` — Turns the feature on/off.

## ⏳ Slowmode (`/slowmode`)

Per-person posting cooldown per channel, beyond Discord's own 6h slowmode cap. Mods/Admins always exempt.

- **`/slowmode add`** `Mod` — Sets the cooldown (e.g. `12h`, `1d`, `3d`, min 1 minute).
- **`/slowmode remove`** `Mod` — Removes it (autocomplete shows configured channels).
- **`/slowmode list`** `Admin` — Lists every configured channel.
- **`/slowmode disable`** `Admin` — Turns the feature on/off.

## ⭐ Starboard (`/starboard`)

Reposts messages that collect enough reactions to a dedicated channel. A server can run several independent starboards.

- **`/starboard add`** `Admin` — Name, watch channel, post channel, threshold, emoji(s), optional content-type filter.
- **`/starboard edit`** `Admin` — Changes any setting for an existing board (autocomplete shows current values).
- **`/starboard remove`** `Admin` — Deletes a board.
- **`/starboard list`** `Everyone` — Lists all boards.
- **`/starboard lookback`** `Admin` — Scans past messages for ones that already qualify (by count, or since a date — no upper limit on how far back).
- **`/starboard disable`** `Admin` — Turns the feature on/off.

## 📌 Sticky Messages (`/sticky`)

Keeps a message pinned to the bottom of a channel, reposting it after new activity.

- **`/sticky`** `Admin` (right-click a message → Apps → **Sticky: Add**) — Sets up (or replaces) the sticky message for a channel.
- **`/sticky edit`** `Admin` — Or right-click → **Sticky: Edit** (opens a modal).
- **`/sticky remove`** `Admin` — Or right-click → **Sticky: Remove**.
- **`/sticky list`** `Everyone` — Lists active sticky messages.

## 💡 Suggestions (`/suggestion`)

Users submit suggestions; Admins approve/deny.

- **`/suggestion`** `Everyone` — Submits one.
- **`/suggestion edit`** `Everyone` — Edits one of your own still-pending suggestions.
- **`/suggestion remove`** `Everyone` (any, for Admins) — Removes your own pending suggestion, or (Admins) any suggestion by number.
- **`/suggestion list`** `Everyone` — Lists suggestions still awaiting a decision.
- **`/suggestion approve`** / **`/suggestion reject`** `Admin` — Decides one (also doable by reacting to the suggestion message, or right-click → Apps → Approve/Reject).
- **`/suggestion channel`** `Admin` — Sets (or clears) where suggestions get posted.
- **`/suggestion disable`** `Admin` — Turns the feature on/off.

## ✅ Verification (`/verify`)

- **`/verify config`** `Admin` — Sets the role per type (sub/domme/maledom), a shared role to remove, the report channel, and an optional extra "allowed" role.
- **`/verify sub`**, **`/verify domme`**, **`/verify maledom`** `Mod` — Verifies a user: assigns the role, removes the shared one, keeps the three exclusive, posts a report.
- **`/verify subroles`** `Admin` — Optional extra: a set of up to 6 roles plus a default. If a member verified as Sub has none of them, the default gets assigned automatically.
- **`/verify edit`** `Mod` — Edits a user's last report.
- **`/verify disable`** `Admin` — Turns the feature on/off.

## 🔢 WaifuWar LR (`/waifuwarlr`)

Post an image, then a digit-only message: each digit maps to an emoji, swapping the bot's reactions on that image and deleting the digit message.

- **`/waifuwarlr add`** `Admin` — Sets up a channel.
- **`/waifuwarlr setdigit`** `Admin` — Maps digit(s) to emoji(s) (comma-separated, paired by position). Autocomplete previews current mappings.
- **`/waifuwarlr removedigit`** `Admin` — Removes a mapping.
- **`/waifuwarlr remove`** `Admin` — Removes a channel entirely.
- **`/waifuwarlr list`** `Admin` — Lists configured channels and their mappings.
- **`/waifuwarlr disable`** `Admin` — Turns the feature on/off.

## ⚠️ Warnings (`/warn`, `/verbal`, `/warning`)

Formal warnings escalate a user through two configured roles; verbals are logged with no role.

- **`/warn`** `Mod` — Issues a formal warning (auto-escalates).
- **`/verbal`** `Mod` — Logs a verbal warning.
- **`/warning config`** `Admin` — Sets the two escalation roles and log channel.
- **`/warning edit`** `Mod` — Edits a warning/verbal you issued yourself.
- **`/warning update`** `Admin` — Refreshes the posted warnings-list embed with current formatting/content.
- **`/warning disable`** `Admin` — Shared toggle with `/verbal`.

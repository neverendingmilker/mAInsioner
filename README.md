# mAInsioner — Discord Bot

Discord bot with a "separate compartments" architecture: each feature has its own folder with commands, business logic, and data access, fully independent from the others. Single Turso (libSQL) database, hosted on Render.

## Architecture

```
src/
  commands/    "Discord" layer — slash command definitions, one folder per feature
    <feature>/
      index.js       (SlashCommandBuilder + subcommands, routes to handlers, autocomplete)
      handlers/       (one file per subcommand)
  features/    Business logic layer, independent of Discord's API shape
    <feature>/
      <feature>Manager.js     (validation, core logic)
      <feature>Repository.js  (SQL queries for that feature's tables)
  database/
    db.js       (single Turso client, createTables() + migrate(), run on every boot)
  events/       (discord.js gateway event handlers: messageCreate, interactionCreate, reactions, etc.)
  utils/        (shared helpers: pagination, duration parsing, per-channel message queue, timezone dates, Mod role check)
  config/
    config.js
  index.js      (bot entrypoint)
  deploy-commands.js  (registers slash commands with Discord, runs before index.js on every start)
```

Feature folders (alphabetical): animenight, autoresponder, birthday, boosterlinks, comboroles, goosepizza, highlight, honeypot, incident, invitetracker, reactionlimit, rolelinks, serverbackup, slowmode, starboard, sticky, suggestion, verify, waifuwarlr, warning. Plus standalone single-file commands with no subcommands: 2faroles, commandlist, disablefeature, modrole, modroles, verbal, warn (shares its data with warning).

Right-click (Apps menu) commands: **Sticky: Add/Edit/Remove**, **Suggestion: Approve/Reject** — thin wrappers that resolve context from the clicked message, calling the same handlers as their slash-command equivalents.

## Setup

1. **Create the Discord application**: https://discord.com/developers/applications → new app → "Bot" → create the bot, copy the **Token**. In "General Information" copy the **Application ID** (= CLIENT_ID).
2. Enable **Server Members Intent** and **Message Content Intent** under Bot → Privileged Gateway Intents (Server Members: assigning/removing roles, reading members. Message Content: GoosePizza's trigger words, starboard's text filters — without it several features silently do nothing even though the bot is online).
3. Generate an invite link (OAuth2 → URL Generator), scopes `bot` + `applications.commands`, permissions at least `Manage Roles`, `Kick Members`, `Send Messages`, `Use Application Commands`. Invite the bot.
   - ⚠️ The bot's role must be **higher** than any role it needs to assign/remove (birthday role, verify roles, booster-linked roles, etc.).
4. **Create a database on Turso** (https://turso.tech): create an account + database, copy the **Database URL** (`libsql://...`) and an **Auth Token**.
5. Copy `.env.example` to `.env`, fill in `DISCORD_TOKEN`, `CLIENT_ID`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET` (see [Web Dashboard](#web-dashboard) — required, the process won't start without them).
6. `npm install`
7. `npm start` — registers slash commands globally (so every server the bot is later invited to gets them, no per-server step needed — can take up to ~1h to first propagate), then connects to Discord and starts the dashboard.
8. In each server the bot joins, an Admin should run `/modrole role:<role>` to set that server's Mod role — until it's set, only Administrators count as Mod there.

Every feature can be turned on/off with `/disablefeature feature:<pick one> enabled:true|false` (Admin only), or that feature's own `disable` subcommand — same flag either way. `/verbal` shares its toggle with `/warning`.

The bot can be invited to and used from more than one server at once — see [Web Dashboard](#web-dashboard) for how the dashboard picks which one you're managing. All data (config, per-feature settings, logs) is kept in the one shared Turso database, isolated per server internally; there's no separate database per server.

## Web Dashboard

Server-rendered (Express + EJS) web dashboard, running in the **same process and port** as the bot — it's what now satisfies Render's "Web Service needs an open HTTP port" requirement (previously a bare status page). Login is Discord OAuth2, gated to whoever has the **Administrator** permission OR the server's configured **Mod** role (`/modrole`) in at least one server the bot is in; no separate account system.

- **Setup**: Discord Developer Portal → your app → OAuth2 → add a redirect `https://<your-render-url>/auth/discord/callback`, copy the **Client Secret** into `DISCORD_CLIENT_SECRET`. Set `SESSION_SECRET` to any long random string (signs the session cookie).
- **Multi-server**: at login, access is checked against every server the bot is currently in (no `guilds` OAuth scope needed — done server-side with the bot's own token). Someone with access to exactly one server goes straight to its overview; access to more than one shows a server picker first (`/select-server`, also reachable anytime via the sidebar's "Cambia server" link, each entry tagged Admin/Mod) and manages one at a time, switchable without logging out.
- **Health check / keep-alive ping**: point Render's health check path (and any external uptime ping, e.g. cron-job.org) at `/healthz`, not `/` — the root path now requires login.
- **Login persistence**: sessions are stored in the same Turso DB (`dashboard_sessions` table, `src/dashboard/sessionStore.js`), not in memory — a redeploy or a free-plan sleep/wake cycle no longer forces a fresh Discord login. Cookie lasts 30 days and slides forward on every active request (`rolling: true`); expired rows are swept every 6h. Access and the server list are only re-checked at login, not on every request, so a permission/role change elsewhere takes effect on the next login rather than immediately.
- **Mod access (opt-in per feature)**: Admins always have full access everywhere. A Mod only sees/reaches whichever feature pages an Admin has explicitly shared by turning the **"Admin only"** item off in that feature's header button group (`src/dashboard/modAccess.js`, `dashboard_mod_access` table) — unshared features don't even show up in a Mod's sidebar. The label never changes: colored (active) means mods are locked out, uncolored (inactive) means the feature is shared with them — it's the colored/active state that flips, not the wording. On a shared feature a Mod has the exact same read/write access as an Admin (add/edit/remove, etc.) — the one exception is the feature's on/off item and its base config (channel/role/schedule), which stay Admin-only even there, enforced centrally in `requireDashboardAccess` (`src/dashboard/middleware/requireAdmin.js`) rather than per-page. Tool pages (Ruoli & Permessi, Permessi per canale — see below) are always Admin-only, with no opt-in. Requires a Mod role to actually be configured via `/modrole` — with none set, only Administrators can log in, same as before this feature existed.
- **Shell**: sidebar listing every feature (from the same registry `/disablefeature` uses, so it can't drift), and an overview page with basic stats (member count, features enabled/total, Honeypot kick total, bot uptime) for whichever server is currently selected.
- **Per-feature config pages**: features get their own dashboard page one at a time — see `src/dashboard/sidebarData.js`'s `FEATURE_PAGES` map for which ones have one so far. A feature without an entry there just shows in an Admin's sidebar as "coming soon" (Mods never see unshared or page-less features listed at all).
  - **Anime Night** — toggle, sessions grouped by watch date (each session = every anime watched that day), add titles to a new or existing date, and a "Modifica" section per session to replace its whole title list and/or move it to a new date. Removing a session deletes every title in it, not just one. Its two cards ("Sessioni" and "Aggiungi anime") use the standard card grid/resize/reorder described below.
  - **Autoresponder** — toggle, list/add/remove per-channel auto-reactions (one or more emoji, optional content filters — attachment/video link/X link — and an optional "redirect to bot" window), inline edit re-using the same add form. Applying it to threads/forums instead of a plain channel still requires `/autoresponder add` on Discord.
  - **Birthday** — toggle, configure the birthday role/removal timer/greeting channel (any combination, same merge behavior as `/birthday config`), list of all saved birthdays grouped by month with a days-until label, add a birthday for any member (a role-assignment/greeting catch-up runs immediately if today happens to be the date, same as the slash commands). Each saved birthday has an "Edit" section instead of a bare remove button — change its date in place (re-runs that same catch-up if it's now today), or remove it from there; someone who's since left the server can only be removed, not edited.
  - **Booster Links** — toggle, list/remove custom perk roles tracked per booster and inline edit to re-point a link to a different role; new links are added from Discord with `/boosterlink add` (same bot-role-above-the-linked-role check either way). Losing the booster role removes the linked role and marks the link **paused** rather than deleting it — a "In pausa" badge and note show on the dashboard — and it comes back automatically the moment they boost again; a link only actually disappears if a Mod removes it. A separate panel lists roles exempt from that pause/removal entirely — the picker there is a multi-select, so several roles can be marked exempt in one submit. Each linked member's name also shows a **Mod** badge (reads the server's own `/modrole` setting, live) and/or an **OG/Fren** badge, if they currently hold whichever role was set as OG/Fren (there's no dashboard control for this anymore — the config card was removed, so it can only be changed directly in the database).
  - **Combined Role Search** — toggle, plus a live search tool (not a saved list): pick up to 3 required roles and up to 2 "BUT" excluded roles, results show every matching member. Same underlying lookup as `/comboroles search`; more than 3 required/2 excluded roles at once still needs the Discord command.
  - **GoosePizza** — toggle, list/add/remove triggers (a name, trigger text, emoji, response mode — comment or react — and which channels it watches), inline edit that can change every field including the channel list at once. Per-trigger enable/disable, independent of the feature-wide toggle.
  - **Honeypot** — toggle, trap channels list/add/remove, live-edit a trap's message/button/emoji (with a visual emoji picker: default set plus the server's own custom emoji), move a trap to a different channel, kick log.
  - **Incident Counter** — toggle, current count and sign channel shown at a glance, change the posting channel, manually set the counter or reset it to 0 — each action reposts the sign image immediately, same as the slash commands.
  - **Invite Tracker** — toggle, configure the default channel new invites open into, top-10 leaderboard, list of every assigned invite with its live usage/expiry (fetched from Discord, not just the DB) and a revoke button, create a brand-new invite for a member (max uses/expiry in hours) or credit an already-existing one by pasting its code/link. Self-service one-per-member invites and per-invite channel overrides still require the Discord commands.
  - **Question of the Day** — toggle, configure the posting channel/optional ping role and the schedule (a fixed daily time or every N hours), add questions manually, drag-and-drop the queue to reorder it (also the posting order), inline edit/remove per question, a "Svuota coda" button to clear the whole queue at once, and a warning banner when the queue is exhausted (posting pauses automatically, resumes as soon as more questions are added — no reshuffle/loop). `/qotd` now mirrors most of this on Discord too (add/edit/remove a question, channel, role, a manual post, and a list of what's queued) — only the schedule itself and drag-and-drop reordering stay dashboard-only.
  - **Reaction Limit** — toggle, list/add/remove per-channel reaction limits for that channel's threads (max reactions per person, with an option to exclude the thread's starter message), inline edit re-using the same add form. Thread-level overrides still require `/reactionlimit add` on Discord.
  - **Role Links** — toggle, list/add/remove role1 → role2 links (losing role1 removes role2, optionally the other way too), inline edit that can change either role or the direction. Linking role1 to several roles at once still requires `/rolelink add` on Discord.
  - **Server Backup** — toggle, list of backups taken on this server (label, date, who made it, asset counts), create a new one (roles/channels/members/assets or all), restore with a confirmation preview page showing any bot/integration roles that would be skipped, plus a lower-risk "sync roles only" action for members who joined after a restore. Only shows/restores backups taken on the currently-selected server, even though a backup can technically be restored onto any server the bot is in via the Discord command.
  - **Slowmode** — toggle, list/add/remove per-channel post cooldowns (e.g. one message every 12h), inline edit re-using the same add form. Applying it to individual threads instead of a whole channel still requires `/slowmode add` on Discord.
  - **Sticky Messages** — toggle, list/add/remove per-channel sticky messages with their repost delay, inline edit re-using the same add form (fixed a bug in the process: editing used to leave the old sticky message behind and post a duplicate instead of replacing it — now fixed for both the dashboard and `/sticky edit` on Discord). Applying it to a single thread instead of a whole channel still requires `/sticky add` on Discord.
  - **Suggestions** — toggle, configure the posting channel, list of pending suggestions with approve/reject/remove and an inline "Modifica" for the text. Approving/rejecting posts an updated copy rather than editing the original message, same as the Discord command; creating a suggestion is still Discord-only (the dashboard is for moderating, not submitting).
  - **Themes** — a copy of Question of the Day (toggle, channel/role/schedule, drag-and-drop reorderable queue, exhaustion banner), posting a "🎨 Tema del giorno" instead of a question, with its own fully independent channel/role/schedule/queue. `/themes post` and `/themes status` mirror `/qotd`'s Discord-side commands.
  - **WaifuWar LR** — toggle, list/add/remove channels set up for reaction codes, and per-channel digit→emoji mappings (add/overwrite several at once by comma-separating both, remove one at a time). Posting an image then a digits-only message still only works live on Discord (that part reads real messages/attachments as they're posted) — the dashboard only manages the channel list and the mapping, not the runtime behavior itself.
  - **Warnings** — toggle, configure the two escalation roles and the posting channel, and a single form to issue either a warning (automatic role escalation, still works by raw ID for someone who's left) or a role-less verbal note (requires a current member) — a type picker chooses which, and the user field doubles as a search box: type a name to filter suggestions from the live member list, or paste/type an ID directly (needed either way for someone who's left, since only a warning accepts that). Also a recent activity table, and a "your own warnings" section to edit the reason/date of whatever you personally issued (matches `/warning edit`'s own-issuer-only rule). There's still no way to delete a warning — that's true of the Discord commands too, not a dashboard limitation.

Every feature page's header shares the same controls (`src/dashboard/views/partials/featureToggle.ejs`), rendered as one connected button group — colored (active) or the default muted color (inactive), driven by CSS `:has(input:checked)` on a hidden checkbox behind each item, no JS needed for the styling itself. Labels are fixed English strings; only the color changes. Admin-only items where noted:

- **Active** — the feature's own on/off, submits the instant you click it.
- **Admin only** (Admin-only) — see "Mod access" above; colored/active keeps the feature Admin-only, uncolored/inactive also shares it with Mods.
- **Edit** (Admin-only to change) — freezes that feature's own add/edit/remove/reorder forms without touching Active or base config (channel/role/schedule) when switched to inactive; a locked feature keeps doing whatever it already does (QOTD keeps posting, Honeypot keeps trapping), only the dashboard's CRUD forms for its list are blocked, for Admin and Mod alike, until an Admin makes it active again. A Mod sees the same button too, but as a disabled, read-only indicator — enough to see whether the feature is currently locked, not to change it.
- **Reorder** (Admin-only) — the panel sections on that page ("cards") sit on an invisible grid (up to 3 columns, unlimited rows); clicking Reorder toggles between browsing normally and rearranging/resizing them. Grab a card's handle (⣿, top-left) to drag it to a different cell — a dashed outline shows every empty cell while dragging, and the cell under the cursor turns green if it's free or red if it's already taken; releasing over a taken cell just snaps the card back to where it was (nothing ever swaps or auto-shifts to make room). If the spot you're dropping onto is just too small for the card's current size (a neighbor, or the edge of the grid, is in the way) it shrinks automatically to whatever fits there instead of being kept out of reach — it only ever refuses the drop outright when the exact cell under the card would land on top of another card. That also means you can leave a cell deliberately empty anywhere — between two cards, or as a gap before one further down — it simply stays empty, no filler element involved. Each card also grows a resize grip on its bottom-right corner: dragging it changes width (column span) in whole steps and height completely freely, both clamped the moment they'd grow into another card's cells (so resizing can shrink other cards' visible room but never overlaps them). Height also keeps the magnetic snap from before — get a card's edge close to another visible card's edge and it locks onto that exact height, with the snap releasing again the moment you keep dragging past it. Shrink a card below what its own content needs and it scrolls internally instead of spilling past its edges. Switching Reorder back off only saves if something was actually dragged or resized while it was active. Changing the column count (below) reshapes the grid, so it re-packs every card densely at that point — this is the one action that doesn't preserve deliberately-left gaps, since the grid it was arranged on no longer exists in the same shape. Everything is saved to **this browser's own `localStorage`**, keyed by feature — not shared server-side, on purpose, so no one else's Admin session or device shows your layout; only an Admin's own browser can set it in the first place, and it doesn't follow that Admin to a different device.
- **1 Col / 2 Cols / 3 Cols** (everyone) — chooses how many columns that page's card grid uses. Not Admin-only, since it's a personal viewing preference, not shared data — also saved to this browser's own `localStorage`, per feature.

Every per-item row across these lists (a channel, a link, a session, …) shares the same two icon buttons in its own header: a pencil (✎) for "Modifica", opening a small popover with that item's edit form right under the button (a native `<details>`/`<summary>`), and a red X (✕) for "Rimuovi", always the same color regardless of the item. Where an item has nothing to edit (just a one-off remove/revoke action) only the red X shows. Opening a different item's "Modifica" popover closes whichever one was already open (`public/detailsAutoClose.js`, loaded on every dashboard page from `partials/footer.ejs`) — only one at a time, dashboard-wide.

## Available commands

Alphabetical by feature. `Admin` = Administrator permission. `Mod` = the server's configured Mod role, or Administrator (a few older commands still check a raw Discord permission instead — noted where that's the case). `Everyone` = no restriction.

### Anime Night (`/animenight`)
- `add title:<...> date:<DD/MM/YY>` `Admin` — adds one or more anime (comma-separated) to a session; creates the session if that date is new.
- `edit session:<...> [titles] [date]` `Admin` — edits an existing session (autocomplete).
- `remove session:<...>` `Admin` — removes an entire session (autocomplete, numbered chronologically).
- `list [order]` `Everyone` — lists all sessions.
- `last` `Everyone` — shows the most recent session's anime.

### Autoresponder (`/autoresponder`)
- `add channel:<#channel> emojis:<...> [require_attachment] [require_video_link] [require_x_link] [redirect_to_bot_id] [redirect_window_seconds]` `Admin` — reacts with emoji to every message in a channel/its threads, with optional content filters and a redirect mode (react to a specific bot's repost instead, within a time window).
- `edit channel:<...> [...]` `Admin` — updates an existing channel's settings; anything omitted keeps its current value. `channel` autocompletes over configured ones with a preview.
- `remove channel:<...>` `Admin` — removes it (same autocomplete).
- `list` `Admin` — lists every configured channel.

### Birthdays (`/birthday`)
- `add day:<...> month:<...> [year] [user]` `Everyone` (Mod for `user`) — sets your own birthday, or someone else's if you're a Mod.
- `edit [...] [user]` `Everyone` (Mod for `user`) — same rule, editing.
- `remove [user]` `Everyone` (Mod for `user`) — same rule, removing.
- `config [role] [remove_after] [channel]` `Admin` — sets the birthday role, how long it stays assigned, and an optional announcement channel.
- `list` `Everyone` — lists all stored birthdays, grouped by month.

### Booster Links (`/boosterlink`)
- `add user:<@user> role:<role>` `Mod` — links a custom perk role to a booster, so it's removed (and the link paused, not deleted) when their boost ends, and restored automatically if they boost again.
- `edit user:<...> old_role:<...> new_role:<role>` `Mod` — re-points a link to a different role (autocomplete on user/role).
- `remove user:<...> [role]` `Mod` — stops tracking a link entirely (or all of a user's links if `role` omitted), paused or not; doesn't remove the role itself if they currently have it.
- `list [user]` `Mod` — lists tracked links, flagging paused ones, ephemeral.
- `exempt add/remove/list` `Admin` — manages roles exempt from the pause/removal.
- `disable` `Admin` — turns the feature on/off.

### Combined Role Search (`/comboroles`)
- `search role1..role5 [but1..but3]` `Mod` — shows users who have **all** the given roles, optionally excluding anyone with one of up to three "BUT" roles. Paginated.
- `disable` `Admin` — turns the feature on/off.

### Command List (`/commandlist`)
`Mod` — shows every command, who can use it, and its options (required ones unbracketed). Generated live from the command definitions.

### Disable Feature (`/disablefeature`)
`Admin` — universal on/off switch: `feature:<pick one> enabled:true|false`. Equivalent to that feature's own `disable` subcommand.

### GoosePizza (`/goosepizza`)
- `add name:<...> trigger:<...> emoji:<...> mode:<react|message> channels:<...>` `Admin` — creates an independent trigger: word/phrase → emoji, in one mode, watching one or more channels.
- `edit name:<...> [trigger] [emoji] [mode]` `Admin` — changes an existing trigger (autocomplete shows current word/emoji/mode).
- `channels name:<...>` `Admin` — changes which channels a trigger watches (picker UI).
- `remove name:<...>` `Admin` — deletes a trigger.
- `list` `Admin` — lists every trigger.
- `disable enabled:<...> [name]` `Admin` — with `name`, toggles just that trigger; without, the whole feature.

### Highlight (`/highlight`)
Personal keyword watcher — DM'd (with context) when someone says a word/phrase from your own list, anywhere in the server. `disable` is Admin only; everything else is per-user and open to everyone.
- `add word:<...>` — 2–100 characters, up to 25 words. Matched case-insensitively on word boundaries. Never triggers on your own messages.
- `remove word:<...>` — autocomplete over your own list.
- `list` — your words, channel list + mode, ignored users.
- `ignorechannel channel:<#channel>` — toggles a channel on/off your list.
- `mode mode:<...>` — switches whether that list means "everywhere except these" (default) or "only these".
- `ignoreuser user:<@user>` — toggles a user on/off your ignore list.
- `disable` `Admin` — turns the feature on/off.

Notifications: a DM embed with a couple messages of context, the trigger message, matched word(s), and a jump link. Capped at one notification per channel every 5 minutes.

### Honeypot (`/honeypot`)
`Admin`. Traps a channel: posts a message with a button, then kicks anyone who isn't Mod/Admin the instant they post there, react to anything there, or click the button. Their post gets deleted too if that's what triggered the kick.
- `add channel:<#channel> [message] [button_label] [emoji]` — sets up the trap and posts the bait message; `emoji`, if given, makes the bot react to its own message with it as extra bait (not required — any reaction already triggers a kick). That reaction gets removed again after it's used to catch someone.
- `edit channel:<...> [new_channel] [message] [button_label] [emoji] [remove_emoji]` — updates an existing trap; anything omitted keeps its current value (autocomplete over active traps). `new_channel` moves the trap there (deletes the old bait message, posts a new one); `remove_emoji` clears the reaction emoji instead of setting a new one.
- `remove channel:<...>` — removes the trap, deletes the bait message if present (autocomplete over active traps).
- `list` — lists active honeypot channels.
- `log` — total kick count plus the 10 most recent (who, how, when).
- `disable` — turns the feature on/off.

Needs **Kick Members** server-wide, plus View Channel/Send Messages in the target channel.

### Incident Counter (`/incident`)
- `channel channel:<#channel>` `Admin` — sets which channel shows the "days since" sign.
- `set count:<...>` `Admin` — manually sets the count.
- `reset` `Admin` — resets to 0.
- `disable` `Admin` — turns the feature on/off.

Auto-increments daily via a scheduled job; the sign image is rendered with `@napi-rs/canvas`.

### Invite Tracker (`/invites`)
`leaderboard`/`user`/`create_self`/`revoke` are open to everyone (the latter two limited to your own invite); `list` is `Mod`; `channel`/`create`/`disable` are `Admin`/`Mod`/`Admin` respectively. Tracks which invite each new member used and by whom it was created, so you know who's bringing people in.
- `channel channel:<#channel>` `Admin` — sets the single server-wide channel that `create`/`create_self` open new invites into (they no longer pick a channel per-invite).
- `create user:<@user> [max_uses] [expires_in_hours or expires_at]` `Mod` — makes a brand-new invite into the configured channel, credited to `user`, no matter who actually shares/clicks it, with no limit on how many. `expires_at` takes an exact `YYYY-MM-DD HH:mm` (Europe/Rome) instead of a relative `expires_in_hours` — pick one, both are capped at Discord's own 7-day max age.
- `create user:<@user> code:<invite or link>` `Mod` — instead of making a new one, credits `user` with an invite you already created yourself (max_uses/expiry don't apply — those are fixed at creation and can't be changed after the fact). Only joins from that point on count; past uses aren't retroactive.
- `create_self` — makes your own invite into the configured channel with default settings (unlimited uses, never expires); no options at all, no `user` to mix up: a separate command rather than a permission branch inside `create`, so it's clear upfront rather than something you find out from an error. Limited to one active self-made invite at a time — a second attempt is rejected until the first is `revoke`d. Also needs **Create Invite** for yourself in the configured channel (not just the bot's), so it can't be used as a backdoor into a channel you couldn't normally invite people to. For custom limits/expiry, or crediting an invite you already made elsewhere, ask a Mod to do it for you with `create`.
- `leaderboard` — top inviters, "still here now" vs "total ever joined".
- `list` `Mod` — every currently assigned invite (code, who it's credited to, uses, expiry) in one place — an overview, as opposed to `user`'s one-person view.
- `revoke code:<...>` — deletes a previously assigned invite (autocomplete over active ones). Mods/Admin can revoke anyone's; everyone else only their own (the undo for `create_self`'s one-at-a-time limit).
- `user [user]` — same stats for one person (defaults to yourself), plus any active invite links credited to them.
- `disable` `Admin` — turns the feature on/off.

Needs **Manage Server** (to see the server's invites) and **Create Invite** in the channel set via `channel`. `create`/`create_self` fail with a clear error until an Admin has run `channel` at least once. Works out which invite was used by diffing use counts on join — a `create`d invite is attributed to whoever it was assigned to; a normal invite someone made themselves is attributed to them, same as before. Also covers the server's vanity URL, if it has one; joins via Discovery/widget, or where two invites changed in the same instant, can't be attributed and are recorded with no inviter.

### Mod Role (`/modrole`)
`Admin` — `[role]`. Sets which role counts as `Mod` for this server (the single setting every `Mod`-gated command/check in the bot reads, per-server since the bot can run on more than one); with no `role` given, shows the one currently configured instead — or says none is set yet, in which case only Administrators count as Mod.

### Permission Audits (`/2faroles`, `/modroles`)

Two related security-audit commands, always documented together. Both `Admin`, both take an optional `[ignore_bots]`.

- `/2faroles [ignore_bots]` — lists roles with at least one permission Discord requires 2FA for (server-wide + per-channel overrides). Doesn't check member-specific overrides (see `/modroles`).
- `/modroles [ignore_bots]` — broader than `/2faroles`: also flags commonly-assumed "mod" permissions that aren't actually 2FA-gated (Audit Log, Nicknames, Expressions, Timeout), and catches per-channel overrides granted to individual people, not just roles.

Both are also on the dashboard (`/roleaudit`, sidebar → "Strumenti") — same live queries against the server's current roles/channels, an `ignore_bots` checkbox instead of a slash option, and results as a page instead of an ephemeral embed. Unlike every other dashboard page, it's not a toggleable feature (no `FEATURES` entry, no on/off state) — it's a read-only tool, so it's not in `sidebarData.js`'s `FEATURE_PAGES` map but in its own separate `TOOL_PAGES`/"Strumenti" section instead.

Dashboard-only, no slash command equivalent: **Channel Permissions** (`/channelpermissions`, sidebar → "Strumenti" → "Permessi per canale") is a full read-write editor for per-channel permission overwrites, mirroring Discord's own "Advanced permissions" panel — a channel list, the roles/members that have an override on the selected channel, and a three-state (deny/neutral/allow) editor for every permission relevant to that channel type (general/text/voice + a always-shown moderation set). No manager either — reads/writes `channel.permissionOverwrites` directly. Saving is blocked, with a clear error, if it would grant the bot a permission it doesn't itself hold on that channel (same restriction Discord enforces server-side).

### Question of the Day (`/qotd`)
Posts a question from a configured, reorderable queue on a schedule (fixed daily time or every N hours), optionally pinging a role. The schedule itself and drag-and-drop queue reordering are still dashboard-only (sidebar → "Question of the Day") — everything else (adding/editing/removing a question, the channel, the pinged role, forcing a post, checking what's queued) also works from Discord now, same as most other features.
- `add question:<...>` `Mod` — adds a question to the queue.
- `channel channel:<#channel>` `Mod` — sets which channel questions post in.
- `disable` `Admin` — turns the feature on/off.
- `edit question:<...> text:<...>` `Mod` — changes an existing question's text (autocomplete over the current queue).
- `list` `Mod` — lists every question still waiting to be posted.
- `post` `Mod` — posts the next question in the queue right now, regardless of the schedule.
- `remove question:<...>` `Mod` — removes a question from the queue (autocomplete).
- `role [role]` `Mod` — sets (or, omitted, clears) the role pinged when a new question posts.
- `status` `Mod` — shows the current configuration, queue size, and the next question preview.

### Reaction Limit (`/reactionlimit`)
Caps reactions per person per thread — configurable per channel (1–100, default 5). Mods/Admins exempt.
- `add channel:<#channel> [limit] [ignore_first_post]` `Admin` — sets the limit for a channel's threads.
- `edit channel:<...> [limit] [ignore_first_post]` `Admin` — updates an existing one (autocomplete shows the current limit); omitted fields keep their value.
- `remove channel:<...>` `Admin` — removes it (same autocomplete).
- `list` `Admin` — lists every configured channel.
- `disable` `Admin` — turns the feature on/off.

### Role Links (`/rolelink`)
Losing role1 auto-removes role2 (optionally the reverse too).
- `add role1:<role> role2..role5 viceversa:<...>` `Admin` — creates a link, one or more target roles at once.
- `edit link:<...> [new_role1] [new_role2] [viceversa]` `Admin` — changes an existing link (autocomplete over configured links).
- `remove link:<...>` `Admin` — removes a link (same autocomplete).
- `list` `Mod` — lists all configured links.
- `disable` `Admin` — turns the feature on/off.

### Server Backup (`/serverbackup`)
`Admin` only. Snapshots the server's roles (+ which members held which, by ID), categories, channels (names, colors/settings, and permission overwrites), emoji, stickers, and soundboard sounds (actual files, downloaded and stored). Backups aren't tied to one server: any is restorable on any server the bot is in, including an empty one, which is the main way to test a backup safely without touching the real server.
- `create [label] [what]` — saves a snapshot; `what` picks the scope (`all` default, `roles`, `channels`, or `assets` for emoji/stickers/soundboard).
- `list` — lists every saved backup, across all servers the bot backs up.
- `members backup:<...>` — just the member role reassignment part of a restore, nothing else — no role/channel creation attempts, no confirmation prompt. For catching up whoever joined *after* the last restore already ran (they were skipped as "not yet joined" back then); much cheaper than re-running the whole `restore`.
- `restore backup:<...> [what]` — recreates whatever's missing from a backup (autocomplete over saved ones); matches roles/emoji/stickers/soundboard sounds by name and channels by name+type+category, so it never deletes or overwrites anything already there — safe to run more than once. `what` restores a narrower scope than what was backed up if you want. Role hierarchy is restored best-effort (can't move a role above the bot's own). Needs **Manage Roles**, **Manage Channels**, and/or **Manage Guild Expressions**, depending on scope.
- `disable` — turns the feature on/off.

Members already present in the target server get their roles reassigned automatically during `restore` (matched by their Discord user ID, additive only — never removes a role). Anyone from the backup who hasn't joined yet is just skipped — use `members` afterward (instead of a full `restore`) to pick up whoever's joined since.

Bot/integration/booster ("managed") roles are never recreated — Discord owns those, the API can't create a lookalike. Invite other bots to the target server **before** restoring: their own managed role gets created automatically with the right name, and any channel overwrite that referenced it in the backup then resolves correctly. If some are still missing, `restore` lists them and asks for confirmation before proceeding — say no and go invite them first, or proceed and that one overwrite is just silently skipped (no error, no fake role).

Restored emoji, stickers, and soundboard sounds get brand-new Discord IDs — old messages that used the originals still show as broken, since there's no way to reuse the old ID.

### Slowmode (`/slowmode`)
Per-person posting cooldown per channel, beyond Discord's own 6h cap. Mods/Admins exempt.
- `add channel:<#channel> duration:<...>` `Mod` — sets the cooldown (`12h`, `1d`, `3d`, ..., min 1 minute).
- `remove channel:<...>` `Mod` — removes it (autocomplete over configured channels).
- `list` `Admin` — lists every configured channel.
- `disable` `Admin` — turns the feature on/off.

### Starboard (`/starboard`)
Reposts messages that collect enough reactions to a dedicated channel — several independent boards per server.
- `add name:<...> watch_channel:<#channel> post_channel:<#channel> threshold:<...> emojis:<...> [content_type]` `Admin` — creates a board.
- `edit name:<...> [...]` `Admin` — changes any setting (autocomplete shows current values).
- `remove name:<...>` `Admin` — deletes a board.
- `list` `Everyone` — lists all boards.
- `lookback name:<...> [limit|since_date|since_year_start] [...]` `Admin` — scans past messages for ones that already qualify; date-based scans have no upper limit on how far back.
- `disable` `Admin` — turns the feature on/off.

### Sticky Messages (`/sticky`)
- `add channel:<#channel> content:<...>` `Admin` (or right-click a message → Apps → **Sticky: Add**) — pins a message to the bottom of a channel, reposted after new activity.
- `edit channel:<...> content:<...>` `Admin` (or right-click → **Sticky: Edit**, modal) — edits it.
- `remove channel:<...>` `Admin` (or right-click → **Sticky: Remove**).
- `list` `Everyone` — lists active sticky messages.

### Suggestions (`/suggestion`)
- `add suggestion:<...>` `Everyone` — submits one.
- `edit number:<...> suggestion:<...>` `Everyone` — edits your own pending suggestion.
- `remove number:<...>` `Everyone` (any, for Admins) — removes your own pending suggestion, or any by number if Admin.
- `list` `Everyone` — lists suggestions awaiting a decision.
- `approve` / `reject number:<...>` `Admin` — decides one (or react to the suggestion message, or right-click → Apps → Approve/Reject).
- `channel [channel]` `Admin` — sets (or clears) where suggestions get posted.
- `disable` `Admin` — turns the feature on/off.

### Themes (`/themes`)
Copy of Question of the Day's mechanics (queue, schedule), posting a "Tema del giorno" instead of a question — fully independent queue/channel/role/schedule. Config is dashboard-only (sidebar → "Themes").
- `disable` `Admin` — turns the feature on/off.
- `post` `Admin` — posts the next theme in the queue right now, regardless of the schedule.
- `status` `Admin` — shows the current configuration, queue size, and the next theme preview.

### Verification (`/verify`)
- `config [verified_sub] [verified_domme] [verified_maledom] [remove] [channel] [allowedrole]` `Admin` — sets the role per type, a shared role to remove, the report channel, and an optional extra allowed role.
- `sub` / `domme` / `maledom` `Mod` — verifies a user: assigns the role, removes the shared one, keeps the three types mutually exclusive, posts a report.
- `subroles role_1:<role> default_role:<role> [role_2..role_6]` `Admin` — optional: a set of up to 6 roles + a default. If a member verified as Sub has none of them, the default is assigned automatically.
- `edit user:<@user>` `Mod` — edits the fields of a user's last report.
- `disable` `Admin` — turns the feature on/off.

### WaifuWar LR (`/waifuwarlr`)
Post an image, then a digit-only message: each digit maps to an emoji, swapping the bot's reactions on that image and deleting the digit message.
- `add channel:<#channel>` `Admin` — sets up a channel.
- `setdigit channel:<...> digit:<...> emoji:<...>` `Admin` — maps digit(s) to emoji(s), comma-separated, paired by position. Autocomplete previews current mappings.
- `removedigit channel:<...> digit:<...>` `Admin` — removes a mapping.
- `remove channel:<...>` `Admin` — removes a channel entirely.
- `list` `Admin` — lists configured channels and their mappings.
- `disable` `Admin` — turns the feature on/off.

### Warnings (`/warn`, `/verbal`, `/warning`)
Formal warnings escalate a user through two configured roles; verbals are logged with no role.
- `/warn user_id:<...> reason:<...> [date]` `Mod` — issues a formal warning (auto-escalates).
- `/verbal user:<@user> reason:<...> [date]` `Mod` — logs a verbal warning.
- `/warning config [role_1] [role_2] [channel]` `Admin` — sets the two escalation roles and log channel.
- `/warning edit warning:<...> [reason] [date]` `Mod` — edits a warning/verbal you issued yourself.
- `/warning update` `Admin` — refreshes the posted warnings-list embed.
- `/warning disable` `Admin` — shared toggle with `/verbal`.

## Hosting

Must stay **connected 24/7** (not an on-demand webapp) — avoid hosting that sleeps the process on inactivity. The database is external (Turso), so data survives restarts regardless of where the process runs.

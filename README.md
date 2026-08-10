# Modular Discord Bot

Discord bot with a "separate compartments" architecture: each feature has its own folder with commands, business logic, and data access, fully independent from the others.

## Architecture

```
src/
  commands/         <- "Discord" layer: slash command definitions
    birthday/
      index.js       (defines /birthday and its subcommands, calls the handlers)
      handlers/
        add.js
        config.js    (role + removal timer + greeting channel, merged into one subcommand)
        list.js
    animenight/
      index.js       (defines /animenight and its subcommands + autocomplete, calls the handlers)
      handlers/
        add.js
        list.js
        last.js
        edit.js
    verify/
      index.js       (defines /verify config, sub, domme, maledom)
      handlers/
        config.js    (configures the give/remove roles for the 3 types + report channel, merged into one subcommand)
        verifyAction.js (shared logic used by sub/domme/maledom, not a subcommand itself)
    goosepizza/
      index.js       (defines /goosepizza channel, emoji, trigger)
      handlers/
        channel.js
        emoji.js
        trigger.js
    incident/
      index.js       (defines /incident channel, setnumber, reset)
      handlers/
        channel.js
        setnumber.js
        reset.js
    boosterlinks/
      index.js       (defines /boosterlink link, unlink, list, exempt add/remove/list)
      handlers/
        link.js
        unlink.js
        list.js
        exempt.js
    rolelinks/
      index.js       (defines /rolelink link, unlink, list, toggle)
      handlers/
        link.js
        unlink.js
        list.js
        toggle.js
    starboard/
      index.js       (defines /starboard create, edit, remove, list, lookback + autocomplete)
      handlers/
        create.js
        edit.js
        remove.js
        list.js
        lookback.js            (shows the channel picker/"run now" button)
        lookbackInteractions.js (handles the picker's follow-up interactions, runs the scan)
    warning/
      index.js       (defines /warning give, roles, channel + autocomplete)
      handlers/
        give.js
        roles.js
        channel.js
    verbal/
      index.js       (defines /verbal, standalone command)
  features/         <- "Business logic" layer: one folder per feature
    birthday/
      birthdayManager.js     (validation and rules)
      birthdayRepository.js  (SQL queries)
      birthdayScheduler.js   (cron job: assigns/removes the role, sends greetings)
    animenight/
      animeNightManager.js     (validation, title/date parsing, sessions, sorting)
      animeNightRepository.js  (SQL queries)
    verify/
      verifyManager.js     (validation and rules)
      verifyRepository.js  (SQL queries)
    goosepizza/
      goosepizzaManager.js     (validation, config, passive trigger handling)
      goosepizzaRepository.js  (SQL queries)
    incident/
      incidentManager.js     (validation + posts/refreshes the sign in Discord)
      incidentRepository.js  (SQL queries)
      incidentImage.js       (renders the sign PNG with the current count, via @napi-rs/canvas)
      incidentScheduler.js   (cron job: +1 every day at midnight)
      assets/                (base sign image + font, ported from the original Python bot)
    boosterlinks/
      boosterLinkManager.js     (validation + auto-removal logic, feature on/off toggle)
      boosterLinkRepository.js  (SQL queries: links + per-guild enabled flag)
    rolelinks/
      roleLinkManager.js     (validation + cascading removal logic, incl. "viceversa")
      roleLinkRepository.js  (SQL queries)
    starboard/
      starboardManager.js     (validation, emoji parsing, reaction counting, embed/post building, lookback)
      starboardRepository.js  (SQL queries: per-guild boards + tracked posts)
      lookbackSessions.js     (in-memory state between the lookback channel picker and its follow-up)
    warning/
      warningManager.js     (validation, role assignment, embed building/updating)
      warningRepository.js  (SQL queries: per-guild config + warning entries)
  database/
    db.js           <- Turso database connection, schema for all features
  events/           <- Discord events (clientReady, interactionCreate...)
  utils/            <- automatic loaders for commands and events, shared helpers (duration parsing, pagination)
  config/
    config.js       <- reads environment variables
  index.js          <- entry point
  deploy-commands.js<- script to register slash commands
```

To add a **new feature** in the future (e.g. moderation, welcome messages, etc.):
1. Create `src/features/featurename/` with its logic and its tables in `db.js`.
2. Create `src/commands/featurename/index.js` exporting `{ data, execute }` (it's loaded automatically, no manual registration needed).
3. If it needs a periodic job, create a scheduler and hook it up in `src/events/ready.js`.

No existing file needs to change to add a feature (except the optional scheduler hookup in `ready.js`).

## Setup

1. **Create the Discord application**: go to https://discord.com/developers/applications, create a new app, go to "Bot" and create the bot, copy the **Token**. In "General Information" copy the **Application ID** (= CLIENT_ID).
2. Enable the privileged **Server Members Intent** in Bot -> Privileged Gateway Intents (needed to assign/remove roles and read members).
3. Generate the invite link in OAuth2 -> URL Generator, scopes `bot` + `applications.commands`, permissions at least `Manage Roles`, `Send Messages`, `Use Application Commands`. Invite the bot to your server.
   - ⚠️ The bot's role must be **higher** than the "birthday" role in the role list, otherwise it won't be able to assign/remove it.
4. **Create the database on Turso** (https://turso.tech, web dashboard, nothing to install): create an account, create a new database, and from its page copy the **Database URL** (starts with `libsql://...`) and create/copy an **Auth Token**.
5. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `CLIENT_ID`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (and optionally `GUILD_ID` for instant testing on your own server).
6. Install dependencies:
   ```
   npm install
   ```
7. Start the bot:
   ```
   npm start
   ```
   (it registers the slash commands automatically on every start, then connects to Discord)

## Available commands (birthday feature)

- `/birthday add day:<1-31> month:<1-12> [year] [user]` — anyone can save their own birthday. If today happens to be that date, the birthday role is assigned right away. The optional `user` option lets an **admin (Manage Roles permission)** set someone else's birthday instead of their own.
- `/birthday remove [user]` — anyone can remove their own saved birthday. The optional `user` option lets an **admin (Manage Roles permission)** remove someone else's instead.
- `/birthday config [role] [removeafter] [channel]` — **admin (Manage Roles permission)**: configures any combination of the three settings in one call:
  - `role:<@role>` — the role to assign on someone's birthday. Also checks the bot's role hierarchy and immediately assigns the role to anyone already celebrating today.
  - `removeafter:<duration>` — after how long to remove the role. Accepts a number followed by a unit: `s` (seconds), `m` (minutes), `h` (hours), `d` (days) — e.g. `30s`, `10m`, `24h`, `3d`. Minimum 10 seconds, maximum 30 days, default 24h.
  - `channel:<#channel>` — the text channel where automatic birthday greetings are posted. Also greets anyone already celebrating today, right away.
- `/birthday list` — shows an embed with every birthday in the server, grouped by calendar month **starting from January** (not by who's coming up soonest), sorted by day within each month; each entry still shows a day countdown to its next occurrence.

Every day at midnight (timezone set via `TZ` in `.env`) the bot checks who's celebrating and assigns the role / posts the greeting automatically; a periodic check (every 10 seconds, to support the short timers above) removes the role once the configured timer has expired. The role and the greeting are also triggered immediately (without waiting for midnight) whenever someone adds a birthday that happens to be today, or when an admin configures the role/channel while someone is already celebrating. The role and the greeting are independent of each other — a server can use either, both, or neither.

## Available commands (Mystery Anime Night feature)

- `/animenight add titles:<...> [date]` — **admin (Manage Roles permission)**: adds one or more anime to the watched list. Separate multiple titles with a comma or a slash, e.g. `Naruto, One Piece / Bleach`. The optional `date` accepts `DD/MM`, `DD/MM/YYYY`, `today`, or `yesterday`; defaults to today if omitted entirely. Every distinct date is a "session" (e.g. "Mystery Anime Night 3"), numbered chronologically.
- `/animenight list [order]` — shows the watch list as an embed **grouped by session** (10 sessions per page), paginated with ◀ Previous / Next ▶ buttons once there are more than 10. Sessions always appear in chronological order; `order` only controls how titles are sorted *within* each session — `alphabetical` (default) or `added` (the order they were added in).
- `/animenight last` — shows every anime from the most recent Mystery Anime Night **session** (i.e. the latest distinct date), not just the last few inserted rows. Also paginated if that session has many entries.
- `/animenight edit session:<...> [titles] [date]` — **admin**: edits an existing session. The `session` option has autocomplete — start typing and Discord suggests matching sessions (e.g. "Mystery Anime Night 3 — 23/10/2026 (5 anime)"), most recent first. Provide `titles` to replace the whole anime list for that session, `date` to move it to a different day (moving it onto an existing session's date merges the two), or both. Session numbers are computed dynamically from chronological order, so they stay correct even after edits.

## Available commands (Verify feature)

All `/verify` subcommands require the **Manage Roles** permission.

- `/verify config [verified_sub] [subremove] [verified_domme] [dommeremove] [verified_maledom] [maledomremove] [channel]` — configures any combination of the following in one call:
  - `verified_sub` / `verified_domme` / `verified_maledom` — the role assigned by `/verify sub`, `/verify domme`, `/verify maledom` respectively.
  - `subremove` / `dommeremove` / `maledomremove` — an **optional** role to strip from the member (if they currently have it) when that command is run — e.g. remove a generic "Unverified" or "Findomme" role once the specific Verified role is granted.
  - `channel:<#channel>` — the text channel where verification reports are posted (report format: TBD).
- `/verify sub user:<@user>` / `/verify domme user:<@user>` / `/verify maledom user:<@user>` — assigns the configured "give" role for that type (no-op if the member already has it), and removes the configured "remove" role for that type if the member currently holds it.

Each of the three types is independent — e.g. running `/verify domme` never touches the sub or maledom roles unless you explicitly configured them to overlap. The bot's role must be higher than every role it needs to touch (both give and remove), otherwise it reports which one it couldn't apply instead of failing silently. Running `/verify sub|domme|maledom` before `/verify config` has been set up for that type replies with a reminder instead of doing anything.

## Available commands (Incident feature)

Ported from a separate Python bot: a "Days since last incident" sign, kept up to date as an image in a Discord channel. All subcommands require the **Administrator** permission.

- `/incident channel channel:<#channel>` — sets the channel where the sign is posted. Also posts the sign right away with whatever count is currently set (0 the first time).
- `/incident setnumber numero:<0-100000>` — manually sets the counter to a specific number and refreshes the sign.
- `/incident reset` — sets the counter back to 0 (i.e. "an incident just happened") and refreshes the sign.

Every day at midnight (same `TZ` used by the birthday feature) the counter is incremented by 1 and the sign is regenerated, for every guild that has a channel configured. Only one sign message is ever visible at a time: posting a new one deletes the previous one first. Unlike the original bot (a 24h loop timed from the last restart), the daily increment now runs at a fixed time regardless of restarts, and does **not** also fire once at every startup — so restarting the bot never double-counts a day.

## Available commands (Custom role feature)

Tracks custom perk roles manually given to server boosters, so they get auto-removed if the person stops boosting. All subcommands require the **Manage Roles** permission.

- `/boosterlink link user:<user> role:<role>` — links a custom role to a booster.
- `/boosterlink unlink user:<user> role:<role>` — stops tracking that link (does **not** remove the role itself). `role` is optional: omit it to untrack every role linked to that user at once.
- `/boosterlink list [user]` — lists tracked links, optionally filtered to one user.
- `/boosterlink toggle enabled:<true/false>` — enables or disables auto-removal for the whole server with a single command. Existing links are kept while disabled; nothing is removed until it's turned back on.

Listens on Discord's `guildMemberUpdate` event: whenever a member who had the server's Booster role no longer has it (boost expired, manually removed, etc.), every custom role linked to them is removed and the link is deleted. Requires the bot's own role to sit above the linked role in the role list.

Exempt roles: `/boosterlink exempt add role:<role>` / `remove` / `list` manage a per-server list of roles that skip the auto-removal entirely — a member only needs **one** of the configured exempt roles (not all of them at once) to be skipped, even if they have linked custom roles and lose the Booster role.

## Available commands (Role link feature)

Generic version of the same idea, not tied to boosting: links any two roles so that losing one auto-removes the other. Requires the **Manage Roles** permission.

- `/rolelink link role1:<role> role2:<role> [viceversa:<true/false>]` — losing `role1` removes `role2`. If `viceversa` is `true` (default `false`), losing `role2` also removes `role1`.
- `/rolelink unlink role1:<role> role2:<role>` — removes that link (same role order as when it was created).
- `/rolelink list` — lists all configured role links in the server.
- `/rolelink toggle enabled:<true/false>` — enables or disables role link auto-removal for the whole server.

Also listens on `guildMemberUpdate`, same mechanism as the booster-link feature above. The bot's own role must sit above both roles involved in a link.

## Available commands (Starboard feature)

Collects popular messages (by reaction count) and reposts them to a dedicated channel. A server can have several starboards, each with its own watch channel, post channel, threshold, emoji and content-type filter — e.g. one board watching `#general` and posting to `#starboard`, and a separate one watching `#memes` and posting only images to `#best-memes`. All subcommands require the **Manage Server** permission.

- `/starboard create name:<...> watch_channel:<#channel> post_channel:<#channel> threshold:<1-1000> emojis:<...> [content_type]` — creates a new starboard. `emojis` accepts one or more emojis (unicode or custom server emojis), separated by spaces or commas, e.g. `⭐` or `⭐ 🔥` — or the special value `any`, which counts a reaction with *any* emoji instead of specific ones (can't be combined with actual emojis). `watch_channel` and `post_channel` must be different channels. `content_type` is optional (see below), defaulting to "Any message".
- `/starboard edit name:<...> [watch_channel] [post_channel] [threshold] [emojis] [content_type]` — updates any combination of an existing starboard's settings. The `name` option has autocomplete. Providing `emojis` replaces the whole list, it doesn't add to it (also accepts `any`, same rules as above).
- `/starboard remove name:<...>` — deletes a starboard's configuration. Already-posted messages are left alone but stop being tracked/updated.
- `/starboard list` — shows every starboard configured in the server, with its watch/post channels, threshold, emojis and content-type filter.
- `/starboard lookback name:<...> [limit:1-1000, default 200] [since_year_start:true|false] [since_date:DD/MM/YY] [until_date:DD/MM/YY] [content_type] [emojis] [threshold]` — scans messages of the starboard's watch channel for ones that already qualify. By default it scans the most recent `limit` messages. `since_year_start:true` instead scans everything back to **midnight, January 1st of the current year** (in the bot's configured timezone). `since_date:<DD/MM/YY or DD/MM/YYYY>` scans back to midnight of a **specific date** instead — e.g. `since_date:15/03/25`; `since_year_start` and `since_date` can't be combined. `until_date:<DD/MM/YY or DD/MM/YYYY>` stops the scan at the end of a specific date, so combined with `since_date` you get a **precise timeframe** — e.g. `since_date:01/06/25 until_date:30/06/25` scans only that month; `until_date` must be after the start of the range. Whenever a date-based start (`since_year_start`/`since_date`) is used, `limit` is ignored (capped internally at 20,000 messages as a safety ceiling); `until_date` on its own (no start given) instead bounds the normal `limit`-based scan to end at that date, e.g. "the last 500 messages before this date". Messages are processed oldest-first, so starboard posts appear in the same order the messages were actually sent. The optional `content_type`, `emojis` and `threshold` let you check something different than what the starboard is normally configured for, just for this one scan, without touching its saved settings. After running the command, the bot shows a **channel picker** (a native Discord select menu listing every channel in the server) so you can optionally add up to 4 extra channels to the same scan, plus a "Run now" button to scan just the starboard's own watch channel. This is useful right after creating a starboard (to backfill already-popular older messages) or to catch up on messages sent while the bot was offline. Internally it re-runs the normal counting/sync logic against each message's current reactions (so it can also *remove* a post if a message no longer qualifies). This can take a little while on a busy channel (fetching message history and the users behind each reaction — a long lookback can take several minutes), so the bot edits its message once scanning finishes rather than instantly. If checking an individual message fails (a transient Discord/database hiccup), that one message is skipped and the scan keeps going instead of stopping partway through — the final summary reports how many messages, if any, couldn't be checked, and running the same command again safely retries just those.

**Content-type filter** (`content_type` option) — restricts which messages are even eligible for a given starboard, regardless of reactions:
- `Any message` (default) — no restriction.
- `Text only` — must have text and no image/GIF/video.
- `Images only` / `GIFs only` / `Videos only` — must include that specific kind of attachment or link embed (a GIF is never counted as a plain image, and vice versa).
- `Any media` — image, GIF, or video, regardless of caption text.
- `Text + media` — needs both a text caption and an attachment.

A message qualifies for a starboard once **enough distinct people** have reacted to it with **at least one** of that board's configured emojis (reacting with more than one counted emoji only counts once per person; the message's own author reacting to their own message never counts). Once a message is reposted, the bot auto-reacts with ⭐ on its own copy in the starboard channel — further ⭐ reactions there (from anyone but the bot) add to the count too, so people can keep starring a message right from the starboard. The starboard post's count stays live as reactions are added or removed (on either the original message or the starboard's own copy) — and if it drops back below the threshold, the post is **removed** from the starboard (a starboard reflects what's currently popular). If the original message is deleted, the corresponding starboard post is deleted too. The bot needs "View Channel" + "Read Message History" in the watch channel, and "View Channel" + "Send Messages" in the post channel.

## Available commands (Warning feature)

Moderation notes on users. Two severities: a lightweight **verbal** warning (just a logged note) and a full **warning** (logged note + assigns one of two admin-configured roles). All subcommands require the **Moderate Members** permission.

- `/warning roles role_1:<role> role_2:<role>` — configures the two roles selectable when issuing a full warning. The bot's own role must sit above both, since it needs to be able to assign them.
- `/warning channel channel:<#channel>` — sets the channel where the warnings list is kept updated. Posting the list there for the first time happens right away.
- `/warning give user:<@user> reason:<...> role:<...>` — issues a full warning: assigns the chosen role (autocomplete offers only the two configured roles, by their current name) and logs the entry.
- `/verbal user:<@user> reason:<...>` — logs a verbal warning. No role is assigned; the standalone `/verbal` command mirrors `/warning give` without the role step.

Both commands update a single, continuously-edited embed in the configured channel (it's never reposted, just edited in place) titled **"Warnings"**, with a `Last update: <Month> <Day>, <Year> <time>` line at the top (the time is a live Discord timestamp, so it always shows correctly in each viewer's own timezone). Below that, every user with at least one entry gets a block:

```
@User
Warning - Reason - Date
Verbal - Reason - Date
```

Users are listed **most-recently-warned first** — issuing a new warning or verbal for someone moves their whole block back to the top of the list, regardless of where it was before. If the list grows past what a single Discord embed can hold, it's truncated with a note rather than erroring out.

## Available commands (GoosePizza feature)

A small passive fun feature: whenever anyone says a chosen word in a chosen channel, the bot automatically posts a chosen emoji as a new message in that channel. Nothing happens until a channel is configured. All subcommands require the **Manage Server** permission.

- `/goosepizza channel channel:<#channel>` — sets the channel to watch. Required before anything triggers.
- `/goosepizza emoji emoji:<...>` — sets which emoji gets posted; accepts a unicode emoji or a custom server emoji. Defaults to `<:pizza01:902913234959495188>`.
- `/goosepizza trigger text:<...>` — sets the word/phrase that triggers a response; matched case-insensitively as a substring anywhere in the message. Defaults to `"pizza"`.

To turn it off entirely for a server, use `/disablefeature feature:GoosePizza enabled:false` — same centralized toggle every other feature uses, rather than a separate on/off subcommand here.

## Hosting

The bot must stay **connected 24/7** (it's not an "on-demand" webapp), so avoid hosting that puts the process to sleep on inactivity without a way to "wake it up". The database is external (Turso), so the data stays safe no matter how/where the bot's process gets restarted.

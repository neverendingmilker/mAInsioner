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
    autoresponder/
      index.js       (defines /autoresponder add, remove, list, disable)
      handlers/
        add.js
        remove.js
        list.js
    verify/
      index.js       (defines /verify config, sub, domme, maledom)
      handlers/
        config.js    (configures the give/remove roles for the 3 types + report channel, merged into one subcommand)
        verifyAction.js (shared logic used by sub/domme/maledom, not a subcommand itself)
    goosepizza/
      index.js       (defines /goosepizza add, edit, channels, remove, list, disable + autocomplete)
      channelPicker.js (shared ChannelSelectMenu builder for add/channels)
      handlers/
        add.js
        edit.js
        channels.js            (shows the channel picker, pre-filled for edits)
        channelInteractions.js (handles the picker's follow-up selection)
        remove.js
        list.js
        disable.js
    incident/
      index.js       (defines /incident channel, set, reset, disable)
      handlers/
        channel.js
        set.js
        reset.js
    postlimit/
      index.js       (defines /postlimit add, remove, list, disable)
      handlers/
        add.js
        remove.js
        list.js
    reactionlimit/
      index.js       (defines /reactionlimit add, remove, list, disable)
      handlers/
        add.js
        remove.js
        list.js
    boosterlinks/
      index.js       (defines /boosterlink add, remove, edit, list, exempt add/remove/list, disable)
      handlers/
        add.js
        remove.js
        edit.js
        list.js
        exempt.js
    rolelinks/
      index.js       (defines /rolelink add, remove, edit, list, disable)
      handlers/
        add.js
        remove.js
        edit.js
        list.js
        roleInteractions.js (handles the role-picker follow-up for /rolelink add)
    starboard/
      index.js       (defines /starboard add, edit, remove, list, lookback + autocomplete)
      handlers/
        add.js
        edit.js
        remove.js
        list.js
        lookback.js            (runs the scan directly and reports the result — no picker/confirmation step)
    waifuwarlr/
      index.js       (defines /waifuwarlr add, remove, setdigit, removedigit, list, disable + autocomplete)
      handlers/
        add.js
        remove.js
        setdigit.js
        removedigit.js
        list.js
    warning/
      index.js       (defines /warning edit, config, update, disable + autocomplete)
      handlers/
        edit.js
        config.js
        update.js
    warn/
      index.js       (defines /warn, standalone command with role escalation logic)
    verbal/
      index.js       (defines /verbal, standalone command)
    sticky/
      index.js       (defines /sticky add, edit, remove, list, disable)
      handlers/
        add.js
        edit.js
        remove.js
        list.js
    commandlist/
      index.js            (defines /commandlist, a paginated table of every command + who can use it)
      commandManifest.js  (hand-maintained data: feature -> subcommands -> access tier + actual permission, plus the mod role ID)
    stickyContextAdd/
      index.js       (message context menu: right-click a message -> Apps -> "Sticky: Add")
    stickyContextEdit/
      index.js       (message context menu: right-click a message -> Apps -> "Sticky: Edit"; shows a modal pre-filled with the current text)
    stickyContextRemove/
      index.js       (message context menu: right-click a message -> Apps -> "Sticky: Remove")
    suggestionContextApprove/
      index.js       (message context menu: right-click a suggestion's posted message -> Apps -> "Suggestion: Approve")
    suggestionContextReject/
      index.js       (message context menu: right-click a suggestion's posted message -> Apps -> "Suggestion: Reject")
    shared/
      disableSubcommand.js  (shared "disable" subcommand builder + handler factory, used by every feature command below)
  features/         <- "Business logic" layer: one folder per feature
    birthday/
      birthdayManager.js     (validation and rules)
      birthdayRepository.js  (SQL queries)
      birthdayScheduler.js   (cron job: assigns/removes the role, sends greetings)
    animenight/
      animeNightManager.js     (validation, title/date parsing, sessions, sorting)
      animeNightRepository.js  (SQL queries)
    autoresponder/
      autoresponderManager.js     (validation, multi-emoji parsing, content-type filter matching, thread-to-parent-channel resolution, "redirect mode" timing, passive per-message reaction)
      autoresponderRepository.js  (SQL queries: per-channel emoji config + enabled toggle)
    verify/
      verifyManager.js     (validation and rules)
      verifyRepository.js  (SQL queries)
    goosepizza/
      goosepizzaManager.js     (validation, config, multi-trigger matching/response)
      goosepizzaRepository.js  (SQL queries: per-guild triggers + their channels + enabled toggle)
      goosepizzaChannelSessions.js (in-memory state between the channel picker and its follow-up)
    incident/
      incidentManager.js     (validation + posts/refreshes the sign in Discord)
      incidentRepository.js  (SQL queries)
      incidentImage.js       (renders the sign PNG with the current count, via @napi-rs/canvas)
      incidentScheduler.js   (cron job: +1 every day at midnight)
      assets/                (base sign image + font, ported from the original Python bot)
    postlimit/
      postLimitManager.js     (validation, exemption check, passive per-message enforcement)
      postLimitRepository.js  (SQL queries: per-channel limits + per-user last-allowed-message tracking)
    waifuwarlr/
      waifuWarLRManager.js     (validation, digit->emoji decoding, tracks each channel's most recent image, swaps its reactions and deletes the code message)
      waifuWarLRRepository.js  (SQL queries: per-channel setup + per-digit emoji mappings)
    reactionlimit/
      reactionLimitManager.js     (validation, exemption check, per-thread reaction counting/enforcement)
      reactionLimitRepository.js  (SQL queries: per-channel config + per-user-per-thread running count)
    boosterlinks/
      boosterLinkManager.js     (validation + auto-removal logic, feature on/off toggle)
      boosterLinkRepository.js  (SQL queries: links + per-guild enabled flag)
    rolelinks/
      roleLinkManager.js     (validation + cascading removal logic, incl. "viceversa")
      roleLinkRepository.js  (SQL queries)
    starboard/
      starboardManager.js     (validation, emoji parsing, reaction counting, embed/post building, lookback)
      starboardRepository.js  (SQL queries: per-guild boards + tracked posts)
    warning/
      warningManager.js     (validation, role escalation logic, embed building incl. the banned-after-role_2 list)
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
2. Enable the privileged **Server Members Intent** and **Message Content Intent** in Bot -> Privileged Gateway Intents (Server Members is needed to assign/remove roles and read members; Message Content is needed for GoosePizza's trigger word and for the starboard's text-based content filters/embed text — without it Discord always sends an empty `content`, so those features silently do nothing even though the bot itself is online and responding to slash commands).
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

Every feature below can be turned on/off for a server either with the universal `/disablefeature feature:<pick one> enabled:true|false` (Administrator only), or with that same feature's own `/<command> disable enabled:true|false` subcommand — both read/write the exact same on/off flag, so use whichever is more convenient. `/verbal` shares its on/off state with `/warning` rather than having its own.

## Available commands (birthday feature)

- `/birthday add day:<1-31> month:<1-12> [year] [user]` — anyone can save their own birthday. If today happens to be that date, the birthday role is assigned right away. The optional `user` option lets a **mod (Manage Roles permission)** set someone else's birthday instead of their own.
- `/birthday edit day:<1-31> month:<1-12> [year] [user]` — same as `add`, but requires that a birthday is already saved (points you at `/birthday add` otherwise). Same self/mod split as `add`.
- `/birthday remove [user]` — anyone can remove their own saved birthday. The optional `user` option lets a **mod (Manage Roles permission)** remove someone else's instead.
- `/birthday config [role] [removeafter] [channel]` — **mod (Manage Roles permission)**: configures any combination of the three settings in one call:
  - `role:<@role>` — the role to assign on someone's birthday. Also checks the bot's role hierarchy and immediately assigns the role to anyone already celebrating today.
  - `removeafter:<duration>` — after how long to remove the role. Accepts a number followed by a unit: `s` (seconds), `m` (minutes), `h` (hours), `d` (days) — e.g. `30s`, `10m`, `24h`, `3d`. Minimum 10 seconds, maximum 30 days, default 24h.
  - `channel:<#channel>` — the text channel where automatic birthday greetings are posted. Also greets anyone already celebrating today, right away.
- `/birthday list` — shows an embed with every birthday in the server, grouped by calendar month **starting from January** (not by who's coming up soonest), sorted by day within each month; each entry still shows a day countdown to its next occurrence.

Every day at midnight (timezone set via `TZ` in `.env`) the bot checks who's celebrating and assigns the role / posts the greeting automatically; a periodic check (every 10 seconds, to support the short timers above) removes the role once the configured timer has expired. The role and the greeting are also triggered immediately (without waiting for midnight) whenever someone adds a birthday that happens to be today, or when an admin configures the role/channel while someone is already celebrating. The role and the greeting are independent of each other — a server can use either, both, or neither.

## Available commands (Mystery Anime Night feature)

- `/animenight add titles:<...> [date]` — **admin only**: adds one or more anime to the watched list. Separate multiple titles with a comma or a slash, e.g. `Naruto, One Piece / Bleach`. The optional `date` accepts `DD/MM`, `DD/MM/YYYY`, `today`, or `yesterday`; defaults to today if omitted entirely. Every distinct date is a "session" (e.g. "Mystery Anime Night 3"), numbered chronologically.
- `/animenight remove entry:<...>` — **admin only**: removes a single anime entry (not a whole session). The `entry` option has autocomplete, listing individual anime with their session date.
- `/animenight list [order]` — shows the watch list as an embed **grouped by session** (10 sessions per page), paginated with ◀ Previous / Next ▶ buttons once there are more than 10. Sessions always appear in chronological order; `order` only controls how titles are sorted *within* each session — `alphabetical` (default) or `added` (the order they were added in).
- `/animenight last` — shows every anime from the most recent Mystery Anime Night **session** (i.e. the latest distinct date), not just the last few inserted rows. Also paginated if that session has many entries.
- `/animenight edit session:<...> [titles] [date]` — **admin only**: edits an existing session. The `session` option has autocomplete — start typing and Discord suggests matching sessions (e.g. "Mystery Anime Night 3 — 23/10/2026 (5 anime)"), most recent first. Provide `titles` to replace the whole anime list for that session, `date` to move it to a different day (moving it onto an existing session's date merges the two), or both. Session numbers are computed dynamically from chronological order, so they stay correct even after edits.

## Available commands (Verify feature)

`/verify config` requires the **Administrator** permission; every other subcommand requires **Manage Roles**, or the role configured via `/verify config allowedrole`.

- `/verify config [verified_sub] [subremove] [verified_domme] [dommeremove] [verified_maledom] [maledomremove] [channel] [allowedrole]` — **admin only**: configures any combination of the following in one call:
  - `verified_sub` / `verified_domme` / `verified_maledom` — the role assigned by `/verify sub`, `/verify domme`, `/verify maledom` respectively.
  - `subremove` / `dommeremove` / `maledomremove` — an **optional** role to strip from the member (if they currently have it) when that command is run — e.g. remove a generic "Unverified" or "Findomme" role once the specific Verified role is granted.
  - `channel:<#channel>` — the text channel where verification reports are posted (report format: TBD).
- `/verify sub user:<@user>` / `/verify domme user:<@user>` / `/verify maledom user:<@user>` — assigns the configured "give" role for that type (no-op if the member already has it), and removes the configured "remove" role for that type if the member currently holds it.

Each of the three types is independent — e.g. running `/verify domme` never touches the sub or maledom roles unless you explicitly configured them to overlap. The bot's role must be higher than every role it needs to touch (both give and remove), otherwise it reports which one it couldn't apply instead of failing silently. Running `/verify sub|domme|maledom` before `/verify config` has been set up for that type replies with a reminder instead of doing anything.

## Available commands (Incident feature)

Ported from a separate Python bot: a "Days since last incident" sign, kept up to date as an image in a Discord channel. All subcommands require the **Administrator** permission.

- `/incident channel channel:<#channel>` — sets the channel where the sign is posted. Also posts the sign right away with whatever count is currently set (0 the first time).
- `/incident set number:<0-100000>` — manually sets the counter to a specific number and refreshes the sign.
- `/incident reset` — sets the counter back to 0 (i.e. "an incident just happened") and refreshes the sign.

Every day at midnight (same `TZ` used by the birthday feature) the counter is incremented by 1 and the sign is regenerated, for every guild that has a channel configured. Only one sign message is ever visible at a time: posting a new one deletes the previous one first. Unlike the original bot (a 24h loop timed from the last restart), the daily increment now runs at a fixed time regardless of restarts, and does **not** also fire once at every startup — so restarting the bot never double-counts a day.

## Available commands (Custom role feature)

Tracks custom perk roles manually given to server boosters, so they get auto-removed if the person stops boosting. All subcommands require the **Manage Roles** permission.

- `/boosterlink add user:<user> role:<role>` — links a custom role to a booster.
- `/boosterlink remove user:<user> [role]` — stops tracking that link (does **not** remove the role itself). `role` is optional (autocomplete, shows only roles actually tracked for that user): omit it to untrack every role linked to that user at once.
- `/boosterlink edit user:<user> old_role:<...> new_role:<role>` — re-points an existing link to a different role, in one step. `old_role` has autocomplete showing only that user's currently-tracked roles.
- `/boosterlink list [user]` — lists tracked links, optionally filtered to one user.
- `/boosterlink disable enabled:<true/false>` — enables or disables auto-removal for the whole server with a single command. Existing links are kept while disabled; nothing is removed until it's turned back on.

Listens on Discord's `guildMemberUpdate` event: whenever a member who had the server's Booster role no longer has it (boost expired, manually removed, etc.), every custom role linked to them is removed and the link is deleted. Requires the bot's own role to sit above the linked role in the role list.

Exempt roles: `/boosterlink exempt add role:<role>` / `remove` / `list` manage a per-server list of roles that skip the auto-removal entirely — a member only needs **one** of the configured exempt roles (not all of them at once) to be skipped, even if they have linked custom roles and lose the Booster role.

## Available commands (Role link feature)

Generic version of the same idea, not tied to boosting: links any two roles so that losing one auto-removes the other. `list` requires **Manage Roles**; every other subcommand requires **Administrator**.

- `/rolelink add role1:<role> [viceversa:<true/false>]` — after running this, a role picker (native Discord multi-select, listing every role in the server) appears so you can choose **one or more** target roles at once; losing `role1` removes all of them. If `viceversa` is `true` (default `false`), losing any of the target roles also removes `role1`.
- `/rolelink remove role1:<role> role2:<role>` — removes that link (same role order as when it was created).
- `/rolelink edit role1:<role> role2:<role> [new_role1] [new_role2] [viceversa]` — identifies the link by its current `role1`/`role2`, then updates whichever of `new_role1`/`new_role2`/`viceversa` you provide.
- `/rolelink list` — lists all configured role links in the server.
- `/rolelink disable enabled:<true/false>` — enables or disables role link auto-removal for the whole server.

Also listens on `guildMemberUpdate`, same mechanism as the booster-link feature above. The bot's own role must sit above both roles involved in a link.

## Available commands (Starboard feature)

Collects popular messages (by reaction count) and reposts them to a dedicated channel. A server can have several starboards, each with its own watch channel, post channel, threshold, emoji and content-type filter — e.g. one board watching `#general` and posting to `#starboard`, and a separate one watching `#memes` and posting only images to `#best-memes`. `list` is open to everyone; every other subcommand requires **Administrator**.

- `/starboard add name:<...> watch_channel:<#channel> post_channel:<#channel> threshold:<1-1000> emojis:<...> [content_type]` — creates a new starboard. `emojis` accepts one or more emojis (unicode or custom server emojis), separated by spaces or commas, e.g. `⭐` or `⭐ 🔥` — or the special value `any`, which counts a reaction with *any* emoji instead of specific ones (can't be combined with actual emojis). `watch_channel` and `post_channel` must be different channels. `content_type` is optional (see below), defaulting to "Any message".
- `/starboard edit name:<...> [watch_channel] [post_channel] [threshold] [emojis] [content_type]` — updates any combination of an existing starboard's settings. The `name` option has autocomplete — each suggestion shows that board's current watch/post channels, threshold and emojis right in the label (e.g. "PostHoF — #general→#starboard-repost · 5+ ⭐"), so there's no need to run `/starboard list` first just to see what's currently set before deciding what to change. Providing `emojis` replaces the whole list, it doesn't add to it (also accepts `any`, same rules as above).
- `/starboard remove name:<...>` — deletes a starboard's configuration. Already-posted messages are left alone but stop being tracked/updated.
- `/starboard list` — shows every starboard configured in the server, with its watch/post channels, threshold, emojis and content-type filter.
- `/starboard lookback name:<...> [limit:1-1000, default 200] [since_year_start:true|false] [since_date:DD/MM/YY] [until_date:DD/MM/YY] [content_type] [emojis] [threshold]` — scans messages of the starboard's watch channel for ones that already qualify. Runs immediately once submitted — no extra picker or confirmation step. By default it scans the most recent `limit` messages *per channel*. `since_year_start:true` instead scans everything back to **midnight, January 1st of the current year** (in the bot's configured timezone). `since_date:<DD/MM/YY or DD/MM/YYYY>` scans back to midnight of a **specific date** instead — e.g. `since_date:15/03/25`; `since_year_start` and `since_date` can't be combined. `until_date:<DD/MM/YY or DD/MM/YYYY>` stops the scan at the end of a specific date, so combined with `since_date` you get a **precise timeframe** — e.g. `since_date:01/06/25 until_date:30/06/25` scans only that month; `until_date` must be after the start of the range. Whenever a date-based start (`since_year_start`/`since_date`) is used, `limit` is ignored (capped internally at 20,000 messages per channel as a safety ceiling); `until_date` on its own (no start given) instead bounds the normal `limit`-based scan to end at that date, e.g. "the last 500 messages before this date". Messages are processed oldest-first, so starboard posts appear in the same order the messages were actually sent. The optional `content_type`, `emojis` and `threshold` let you check something different than what the starboard is normally configured for, just for this one scan, without touching its saved settings. This is useful right after creating a starboard (to backfill already-popular older messages) or to catch up on messages sent while the bot was offline. Internally it re-runs the normal counting/sync logic against each message's current reactions (so it can also *remove* a post if a message no longer qualifies); checking who reacted is skipped entirely for messages that obviously can't reach the threshold even in the best case (based on Discord's own raw reaction counts, before excluding bots/self-reactions), which is normally the single biggest cost of a lookback and cuts it down substantially on a channel where most messages don't qualify. If checking an individual message fails (a transient Discord/database hiccup), that one message is skipped and the scan keeps going instead of stopping partway through — the final summary reports how many messages, if any, couldn't be checked, and running the same command again safely retries just those. Date-based scans (`since_year_start`/`since_date`) can still genuinely take longer than Discord's ~15-minute interaction window on a very busy channel — for those, the bot immediately replies with a brief "working on it" message instead of leaving the interaction hanging, and the actual result then arrives however it can: as a normal reply if the scan finishes in time, or by DM to the person who ran it if not (their DMs need to be open for that server).

**Content-type filter** (`content_type` option) — restricts which messages are even eligible for a given starboard, regardless of reactions:
- `Any message` (default) — no restriction.
- `Text only` — must have text and no image/GIF/video.
- `Images only` / `GIFs only` / `Videos only` — must include that specific kind of attachment or link embed (a GIF is never counted as a plain image, and vice versa).
- `Any media` — image, GIF, or video, regardless of caption text.
- `Text + media` — needs both a text caption and an attachment.

A message qualifies for a starboard once **enough distinct people** have reacted to it with **at least one** of that board's configured emojis (reacting with more than one counted emoji only counts once per person; the message's own author reacting to their own message never counts). Once a message is reposted, the bot auto-reacts with ⭐ on its own copy in the starboard channel — further ⭐ reactions there (from anyone but the bot) add to the count too, so people can keep starring a message right from the starboard. The starboard post's count stays live as reactions are added or removed (on either the original message or the starboard's own copy) — and if it drops back below the threshold, the post is **removed** from the starboard (a starboard reflects what's currently popular). If the original message is deleted, the corresponding starboard post is deleted too. The bot needs "View Channel" + "Read Message History" in the watch channel, and "View Channel" + "Send Messages" in the post channel.

## Available commands (Warning feature)

Moderation notes on users. Two severities: a lightweight **verbal** warning (just a logged note) and a full **warning** (logged note + auto-assigns one of two admin-configured escalation roles). `/warn` and `/warning edit` require **Moderate Members**; `/warning roles`, `channel`, `update` and `disable` require **Administrator**.

- `/warn user_id:<...> reason:<...> [date]` — warns a user by their **ID** (right-click → Copy User ID) rather than picking them from a member list, so it also works for people who've already left the server. Escalates automatically against the two roles configured via `/warning roles`: no role yet → assigns `role_1`; already has `role_1` → assigns `role_2`; already has `role_2` → assigns nothing, logs the warning anyway, and tells the moderator the team should discuss banning this user in chat instead. If the target isn't currently a member, the warning is still logged, just without any role check/assignment. The optional `date` (`DD/MM/YY` or `DD/MM/YYYY`) backdates it instead of using today; only ever a date, never a time.
- `/warning config [role_1] [role_2] [channel]` — **admin only**: configures any combination of the two escalation roles `/warn` uses (`role_1`/`role_2` must be given together — they're a pair) and/or the channel where the warnings list is kept updated. The bot's own role must sit above both configured roles, since it needs to be able to assign them.
- `/warning edit warning:<...> [reason] [date]` — edits one of **your own** previously-issued warnings/verbals (autocomplete only ever lists entries **you** issued — not other mods'). Change the reason and/or overwrite the date.
- `/warning update` — **admin only**: re-renders the warnings list embed against the current formatting/content logic, without waiting for a new warning to trigger a refresh — useful right after an update to the bot changes what the embed looks like.
- `/verbal user:<@user> reason:<...> [date]` — logs a verbal warning. No role is assigned; shares its enabled state and permission tier with `/warning`/`/warn`.

Each line in the embed shows the **name of the role that was actually assigned** for that entry (as a role mention) instead of a generic "Warning" label; verbals still show "Verbal", and a warning that didn't result in a role change (already maxed out, or the user wasn't a member) falls back to "Warning". If anyone who was ever escalated to `role_2` is later banned from the server, they're listed in a "🔨 Banned after final warning" section at the very bottom of the embed — this is read straight from Discord's own ban list (`GuildBanManager`), so it needs the bot to have the **Ban Members** permission; if it doesn't, that section is just silently omitted rather than erroring.

Both commands update a single, continuously-edited embed in the configured channel (it's never reposted, just edited in place) titled **"Warnings"**, with a `Last update: <Month> <Day>, <Year> <time>` line at the top (the time is a live Discord timestamp, so it always shows correctly in each viewer's own timezone). Below that, every user with at least one entry gets a block:

```
@User
Warning - Reason - Date
Verbal - Reason - Date
```

Users are listed **most-recently-warned first** — issuing a new warning or verbal for someone moves their whole block back to the top of the list, regardless of where it was before. If the list grows past what a single Discord embed can hold, it's truncated with a note rather than erroring out.

## Available commands (GoosePizza feature)

A small passive fun feature: whenever anyone says a chosen word in one of its chosen channels, the bot automatically responds with a chosen emoji — either as a new message, or as a reaction on the triggering message, depending on the configured mode. A server can have several independent triggers at once — different words, channels, emojis, and modes can all coexist, including more than one watching the same channel simultaneously (a message matching two different triggers fires both, independently) — and each trigger itself can watch more than one channel (up to 10). All subcommands require the **Administrator** permission.

- `/goosepizza add name:<...> trigger:<...> emoji:<...> mode:<Comment|React>` — starts creating a new trigger. `trigger` is matched case-insensitively as a substring anywhere in the message. `emoji` accepts a unicode emoji or a custom server emoji. `mode` is **Comment** (posts the emoji as a brand new message in the channel) or **React** (adds the emoji as a reaction directly on the triggering message, without posting anything new) — the permission the bot needs in each channel depends on which one you pick (Send Messages for Comment; Add Reactions + Read Message History for React). After running the command, a channel picker (a native Discord select menu listing every channel in the server, up to 10 selections) appears — the trigger is only actually created once at least one channel is chosen there.
- `/goosepizza edit name:<...> [trigger] [emoji] [mode]` — updates the word/phrase, emoji, and/or mode of an existing trigger. The `name` option has autocomplete. If `mode` changes, every channel the trigger currently watches is re-checked for the new mode's required permission. Doesn't touch which channels it watches — use `/goosepizza channels` for that.
- `/goosepizza channels name:<...>` — opens the same channel picker for an existing trigger, pre-filled with its current channels (shown as already selected); whatever you pick replaces the list entirely, so re-selecting the same ones plus a new one is how you add to it.
- `/goosepizza remove name:<...>` — deletes a trigger.
- `/goosepizza list` — shows every trigger configured in the server: its channels, trigger text, emoji, mode, and enabled/disabled state.
- `/goosepizza disable enabled:<true|false> [name]` — with `name` given (autocomplete), enables/disables just that one trigger without touching the others. Without `name`, it's a dedicated on/off switch for the whole feature (every trigger at once) — `/disablefeature feature:GoosePizza` controls that exact same all-triggers setting, so either works.


## Available commands (Post Limit feature)

Limits how often each person can post in a channel — for cooldowns longer than Discord's own slowmode (capped at 6 hours), or when you want it enforced consistently regardless of Discord's per-channel setting. Each channel gets its own independent duration. Discord doesn't offer a way to pre-approve a message before it's sent, so this works by deleting the message immediately after it's posted if the person is still on cooldown; their timestamp isn't touched by a blocked attempt, so repeatedly trying doesn't reset or extend the cooldown. Moderators (Manage Messages or Administrator permission) are always exempt — no separate configurable exempt-role list. All subcommands require the **Administrator** permission.

- `/postlimit add channel:<#channel> duration:<...>` — sets (or replaces) the limit for a channel. `duration` is a number followed by `s`/`m`/`h`/`d` (e.g. `12h`, `1d`, `3d`), minimum 1 minute.
- `/postlimit remove channel:<...>` — removes the limit from a channel. The `channel` option is autocompleted, only showing channels that currently have a limit (with the cooldown shown), instead of every channel in the server.
- `/postlimit list` — shows every channel with a limit configured, and what it is.
- `/postlimit disable enabled:<true|false>` — turns the whole feature on/off for the server; `/disablefeature feature:PostLimit` controls the same setting.

When someone is blocked, their message is deleted and a short notice is posted in the channel (mentioning them) with a live Discord relative timestamp (`<t:...:R>`) for when they can post again — no DMs sent. The notice auto-deletes itself after 20 seconds, so it doesn't linger.

## Available commands (Autoresponder feature)

Auto-reacts with one or more emojis to a chosen channel's messages, including messages posted in its threads (e.g. a forum's individual posts, or "room" threads under a shared parent) — no trigger word, unlike GoosePizza which only fires on a specific word. Each channel gets its own independent set of emojis and, optionally, its own content filter plus an optional redirect-to-bot mode. All subcommands require the **Administrator** permission.

- `/autoresponder add channel:<#channel> emojis:<...> [require_attachment] [require_video_link] [require_x_link] [redirect_to_bot_id] [redirect_window_seconds]` — sets (or replaces) the autoresponder for a channel. `emojis` accepts one or more unicode/custom server emojis, separated by spaces or commas (e.g. `🍕 🔥 ⭐`), up to 10 per channel; duplicates are silently deduped. The three boolean filters are all optional and off by default (reacts to every message, same as before this option existed): `require_attachment` matches messages with an image/gif/video attachment; `require_video_link` matches messages containing a video link (YouTube — `youtube.com/watch|shorts|live` and `youtu.be`); `require_x_link` matches messages linking an X/Twitter post, including the common embed-fixing mirror domains (`fxtwitter.com`, `vxtwitter.com`, `fixvx.com`, `fixupx.com`) alongside `x.com`/`twitter.com` themselves. Enabling more than one filter is an **OR**, not an AND — the message only needs to match one of the enabled filters to get a reaction. On top of the filters, `redirect_to_bot_id:<user ID>` + `redirect_window_seconds:<1-30>` switch on **redirect mode**: instead of reacting to a qualifying message right away, the bot waits up to the given window to see if the *specific* bot (by ID) posts in that same channel; if it does, the reaction is placed on **that bot's message** instead of the original poster's, and the original never gets one. If the specific bot doesn't post within the window, the original message gets the reaction as a fallback, same as normal mode would have. The bot is matched both by its normal user ID and by webhook ID — many "repost"/"embed fixer" services post through a Discord webhook rather than as a live bot, in which case the message's "author" is a per-webhook placeholder rather than the bot's real account, so both are checked to cover either setup. This bot's own messages are never reacted to, in any mode.

  This bot's own messages are never reacted to, in any mode — that exclusion doesn't depend on any of the above.
- `/autoresponder remove channel:<...>` — removes the autoresponder from a channel. The `channel` option is autocompleted, only showing channels that currently have an autoresponder (with its emojis previewed), instead of every channel in the server.
- `/autoresponder list` — shows every channel with an autoresponder configured, its emojis, and any active filter/pair/redirect mode.
- `/autoresponder disable enabled:<true|false>` — turns the whole feature on/off for the server; `/disablefeature feature:Autoresponder` controls the same setting.

Reactions are added in the order the emojis were given, and each one is applied independently — if one fails (e.g. a custom emoji the bot no longer has access to), the rest still go through.

## Available commands (WaifuWar LR feature)

In a chosen channel: post an image, then a follow-up message that's only digits (up to 9 of them, `require_attachment`-style detection via `image/*` content type on an attachment — video attachments don't count here, unlike Autoresponder's broader "media" check), and each digit gets decoded through that channel's digit→emoji mapping into a reaction. Those decoded emojis become the image's new reactions — every reaction the bot itself had previously added there is removed first — and the digit-only message is deleted right after. A digit with no mapping configured is silently skipped rather than erroring; repeated digits in the code only add their emoji once (Discord reactions are inherently deduplicated anyway). If a digit-only message shows up with no image posted since the channel was last "reset" (i.e. nothing pending), it's left alone — there's nothing to apply it to. Which image is "pending" is tracked in memory per channel, so a restart just means the very next code typed won't find anything to apply to until a new image is posted; harmless and self-correcting. All subcommands require the **Administrator** permission.

- `/waifuwarlr add channel:<#channel>` — sets up a channel for WaifuWar LR codes. Doesn't configure any digit mappings on its own — pair it with `setdigit` calls afterward. Requires the bot to already have **View Channel**, **Read Message History**, **Add Reactions** and **Manage Messages** in that channel — checked up front and rejected with a clear error if any are missing, rather than letting the setup succeed and then silently failing later. Manage Messages specifically because deleting the digit-code message means deleting someone else's message (the channel's writer), not one of the bot's own — reacting alone (View Channel/Read Message History/Add Reactions) isn't enough for that part.
- `/waifuwarlr setdigit channel:<...> digit:<...> emoji:<...>` — maps digit(s) to emoji(s) for a channel. Both `digit` and `emoji` accept either a single value or several separated by commas — when several, they're paired up by position (1st digit with 1st emoji, 2nd with 2nd, ...), so both lists need the same length; e.g. `digit:"7,8,9" emoji:"🟢,🟡,🔴"` sets all three at once. Re-running it for an already-mapped digit replaces that mapping. Every pair is validated before any of them are saved, so a mistake in one doesn't leave the channel's mapping half-applied. `channel` is autocompleted, only showing channels already set up for this feature.
- `/waifuwarlr removedigit channel:<...> digit:<...>` — removes a single digit's mapping, leaving the others intact. Both `channel` and `digit` are autocompleted (`digit` only lists digits that channel actually has mapped).
- `/waifuwarlr remove channel:<...>` — removes WaifuWar LR codes from a channel entirely, including every digit mapping for it. `channel` is autocompleted, only showing configured channels.
- `/waifuwarlr list` — shows every channel set up for this feature and its current digit → emoji mappings.
- `/waifuwarlr disable enabled:<true|false>` — turns the whole feature on/off for the server; `/disablefeature feature:WaifuWarLR` controls the same setting.

## Available commands (Reaction Limit feature)

Limits each person to a fixed **5 reactions per thread** in a chosen channel's threads (works on forum channels and regular text channels with threads) — a deliberately narrow feature that only does this one thing, no configurable count. Once someone reaches 5 counted reactions in a thread, any further reaction they add there is removed immediately; removing one of their own earlier reactions frees up a slot again (the running count lives in the database, not derived from Discord's own state, so it stays correct even across restarts). Moderators (Manage Messages or Administrator permission) are always exempt — no separate configurable exempt-role list. All subcommands require the **Administrator** permission.

- `/reactionlimit add channel:<#channel> [ignore_first_post:true|false]` — sets (or replaces) the limit for a channel's threads. `ignore_first_post` (default `false`) excludes reactions on each thread's starter/first message from the count entirely — handy for e.g. a forum where the opening post is meant to collect votes/reactions freely, while still capping reaction spam in the replies underneath it.
- `/reactionlimit remove channel:<...>` — removes the limit from a channel. The `channel` option is autocompleted, only showing channels that currently have a limit configured, instead of every channel in the server.
- `/reactionlimit list` — shows every channel with a limit configured.
- `/reactionlimit disable enabled:<true|false>` — turns the whole feature on/off for the server; `/disablefeature feature:ReactionLimit` controls the same setting.

## Hosting

The bot must stay **connected 24/7** (it's not an "on-demand" webapp), so avoid hosting that puts the process to sleep on inactivity without a way to "wake it up". The database is external (Turso), so the data stays safe no matter how/where the bot's process gets restarted.

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

Feature folders (alphabetical): animenight, autoresponder, birthday, boosterlinks, comboroles, goosepizza, highlight, honeypot, incident, reactionlimit, rolelinks, slowmode, starboard, sticky, suggestion, verify, waifuwarlr, warning. Plus standalone single-file commands with no subcommands: commandlist, disablefeature, 2faroles, modroles, verbal, warn (shares its data with warning).

Right-click (Apps menu) commands: **Sticky: Add/Edit/Remove**, **Suggestion: Approve/Reject** — thin wrappers that resolve context from the clicked message, calling the same handlers as their slash-command equivalents.

## Setup

1. **Create the Discord application**: https://discord.com/developers/applications → new app → "Bot" → create the bot, copy the **Token**. In "General Information" copy the **Application ID** (= CLIENT_ID).
2. Enable **Server Members Intent** and **Message Content Intent** under Bot → Privileged Gateway Intents (Server Members: assigning/removing roles, reading members. Message Content: GoosePizza's trigger words, starboard's text filters — without it several features silently do nothing even though the bot is online).
3. Generate an invite link (OAuth2 → URL Generator), scopes `bot` + `applications.commands`, permissions at least `Manage Roles`, `Kick Members`, `Send Messages`, `Use Application Commands`. Invite the bot.
   - ⚠️ The bot's role must be **higher** than any role it needs to assign/remove (birthday role, verify roles, booster-linked roles, etc.).
4. **Create a database on Turso** (https://turso.tech): create an account + database, copy the **Database URL** (`libsql://...`) and an **Auth Token**.
5. Copy `.env.example` to `.env`, fill in `DISCORD_TOKEN`, `CLIENT_ID`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (optionally `GUILD_ID` for instant per-guild command registration while testing).
6. `npm install`
7. `npm start` — registers slash commands, then connects to Discord.

Every feature can be turned on/off with `/disablefeature feature:<pick one> enabled:true|false` (Admin only), or that feature's own `disable` subcommand — same flag either way. `/verbal` shares its toggle with `/warning`.

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
- `add user:<@user> role:<role>` `Mod` — links a custom perk role to a booster, so it's auto-removed when their boost ends.
- `edit user:<...> old_role:<...> new_role:<role>` `Mod` — re-points a link to a different role (autocomplete on user/role).
- `remove user:<...> [role]` `Mod` — stops tracking a link (or all of a user's links if `role` omitted); doesn't remove the role itself.
- `list [user]` `Mod` — lists tracked links, ephemeral.
- `exempt add/remove/list` `Admin` — manages roles exempt from the auto-removal.
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
`leaderboard`/`user`/`create_self`/`revoke` are open to everyone (the latter two limited to your own invite); `list` is `Mod`; `create`/`disable` are `Mod`/`Admin` respectively. Tracks which invite each new member used and by whom it was created, so you know who's bringing people in.
- `create user:<@user> channel:<#channel> [max_uses] [expires_in_hours or expires_at]` `Mod` — makes a brand-new invite credited to `user`, no matter who actually shares/clicks it, with no limit on how many. `expires_at` takes an exact `YYYY-MM-DD HH:mm` (Europe/Rome) instead of a relative `expires_in_hours` — pick one, both are capped at Discord's own 7-day max age.
- `create user:<@user> code:<invite or link>` `Mod` — instead of making a new one, credits `user` with an invite you already created yourself (channel/max_uses/expiry don't apply — those are fixed at creation and can't be changed after the fact). Only joins from that point on count; past uses aren't retroactive.
- `create_self channel:<#channel> [max_uses] [expires_in_hours or expires_at]` — same as `create`, but always for yourself, with no `user` option to mix up: a separate command rather than a permission branch inside `create`, so it's clear upfront rather than something you find out from an error. Limited to one active self-made invite at a time — a second attempt is rejected until the first is `revoke`d. Also needs **Create Invite** for yourself in the target channel (not just the bot's), so it can't be used as a backdoor into channels you couldn't normally invite people to.
- `create_self code:<invite or link>` — same idea, credits yourself with an invite you already made elsewhere. Same one-at-a-time limit.
- `leaderboard` — top inviters, "still here now" vs "total ever joined".
- `list` `Mod` — every currently assigned invite (code, who it's credited to, uses, expiry) in one place — an overview, as opposed to `user`'s one-person view.
- `revoke code:<...>` — deletes a previously assigned invite (autocomplete over active ones). Mods/Admin can revoke anyone's; everyone else only their own (the undo for `create_self`'s one-at-a-time limit).
- `user [user]` — same stats for one person (defaults to yourself), plus any active invite links credited to them.
- `disable` `Admin` — turns the feature on/off.

Needs **Manage Server** (to see the server's invites) and **Create Invite** in whichever channels `create` targets. Works out which invite was used by diffing use counts on join — a `create`d invite is attributed to whoever it was assigned to; a normal invite someone made themselves is attributed to them, same as before. Also covers the server's vanity URL, if it has one; joins via Discovery/widget, or where two invites changed in the same instant, can't be attributed and are recorded with no inviter.

### Permission Audits (`/2faroles`, `/modroles`)

Two related security-audit commands, always documented together. Both `Admin`, both take an optional `[ignore_bots]`.

- `/2faroles [ignore_bots]` — lists roles with at least one permission Discord requires 2FA for (server-wide + per-channel overrides). Doesn't check member-specific overrides (see `/modroles`).
- `/modroles [ignore_bots]` — broader than `/2faroles`: also flags commonly-assumed "mod" permissions that aren't actually 2FA-gated (Audit Log, Nicknames, Expressions, Timeout), and catches per-channel overrides granted to individual people, not just roles.

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

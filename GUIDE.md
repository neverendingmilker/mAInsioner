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
- **`/birthday config`** `Admin` — Sets the birthday role, how long it stays on, and an optional announcement channel.
- **`/birthday list`** `Everyone` — Lists every stored birthday, grouped by month.

## 🔗 Booster Links (`/boosterlink`)

Tracks custom perk roles given to boosters. Stopping a boost removes the role and pauses the link (it's kept, not deleted) rather than forgetting it — boost again and the role comes back on its own.

- **`/boosterlink add`** `Mod` — Links a role to a booster.
- **`/boosterlink edit`** `Mod` — Re-points an existing link to a different role (autocomplete on user/role).
- **`/boosterlink remove`** `Mod` — Stops tracking a link for good, paused or not (doesn't remove the role itself if they currently have it).
- **`/boosterlink list`** `Mod` — Lists tracked links, optionally filtered by user, flagging paused ones. Ephemeral.
- **`/boosterlink exempt`** `Mod` — Manages roles exempt from the pause/removal.
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

Personal keyword watcher — get DM'd (with context) when someone says a word/phrase from your list, anywhere in the server.

- **`/highlight add`** `Everyone` — Adds a word/phrase (2–100 chars, up to 25). Matched case-insensitively on word boundaries. Never triggers on your own messages.
- **`/highlight remove`** `Everyone` — Removes one (autocomplete over your list).
- **`/highlight list`** `Everyone` — Shows your words, channel list + mode, and ignored users.
- **`/highlight ignorechannel`** `Everyone` — Toggles a channel on/off your list.
- **`/highlight mode`** `Everyone` — Switches whether that list means "everywhere except these" (default) or "only these".
- **`/highlight ignoreuser`** `Everyone` — Toggles a user on/off your ignore list.
- **`/highlight disable`** `Admin` — Turns the feature on/off.

Every subcommand above (except `disable`) is strictly personal: it only ever reads or changes the words/lists belonging to whoever ran the command — there's no way, even for a Mod or Admin, to see or edit someone else's highlight list through these commands.

Notifications: a DM with a couple messages of context, the trigger itself, matched word(s), and a jump link. Capped at one notification per channel every 5 minutes.

## 🍯 Honeypot (`/honeypot`)

Turns a channel into a trap: posts a message with a button, then kicks anyone who isn't Mod/Admin the moment they write there, react to anything there, or click the button. Mods and the Admin (server owner) are always exempt from the kick, no matter which of the three ways they'd otherwise trigger it.

- **`/honeypot add`** `Admin` — Sets up the trap channel and posts the bait message (custom text/button label optional). You can also give it an `emoji`, which makes the bot react to its own bait message with it — purely extra bait, since reacting with *any* emoji already triggers a kick either way. Once that reaction is used to catch someone, the bot removes its own reaction again.
- **`/honeypot edit`** `Admin` — Updates an existing trap: message text, button label, and/or emoji. Anything you leave out keeps its current value, so you can change just one thing at a time. Give `new_channel` to move the trap there instead (the old bait message gets deleted and a fresh one posted in the new channel); use `remove_emoji` to clear the current reaction emoji.
- **`/honeypot remove`** `Admin` — Removes the trap and deletes the bait message.
- **`/honeypot list`** `Admin` — Lists active honeypot channels.
- **`/honeypot log`** `Admin` — Shows the total number of people kicked, plus the 10 most recent (who, how they triggered it, when).
- **`/honeypot disable`** `Admin` — Turns the feature on/off.

Whoever gets kicked for posting in the trap channel also has that message deleted. Every subcommand requires the **Administrator** permission — setting up a channel that auto-kicks people is serious enough that it isn't left to Mods.

## 🪧 Incident Counter (`/incident`)

Keeps a "days since last incident" sign updated in a channel, auto-incrementing daily.

- **`/incident channel`** `Admin` — Sets which channel shows the sign.
- **`/incident set`** `Admin` — Manually sets the day count.
- **`/incident reset`** `Admin` — Resets to 0 (an incident just happened).
- **`/incident disable`** `Admin` — Turns the feature on/off.

## 🔗 Invite Tracker (`/invites`)

Tracks who invited who: when someone joins, the bot works out which invite they used (by comparing use counts against the last known snapshot — Discord doesn't say directly) and credits whoever it's attributed to.

- **`/invites channel`** `Admin` — Sets the single server-wide channel that `create`/`create_self` open new invites into. Invites no longer pick a channel per command — one consistent entry point for the whole server.
- **`/invites create`** `Mod` — Makes a brand-new invite link into the configured channel and credits it to a specific user, or with `code`, credits an invite you already made elsewhere. No limit on how many, or for who — handy for handing out personal "referral" links, e.g. to a booster or a partner. Optional max uses, and an expiry either as a relative `expires_in_hours` or an exact `expires_at` date/time (up to Discord's own 7-day cap).
- **`/invites create_self`** — The version of `create` open to everyone, for their own invite only, with no options — always default settings (unlimited uses, never expires) into the configured channel. A separate command rather than a permission check buried inside `create`, so a regular member sees upfront what they can and can't do instead of finding out from an error. Limited to one active self-made invite at a time (a second attempt is rejected until the first is `revoke`d), and needs the "Create Invite" permission themselves in the configured channel — the bot having it isn't enough, so this can't be used as a backdoor into a channel they couldn't normally invite people to. For custom limits/expiry, or crediting an invite already made elsewhere, a Mod can do it for them with `create`.
- **`/invites leaderboard`** — Top inviters, showing both how many people they brought in that are still here now, and the total ever (including people who later left).
- **`/invites list`** `Mod` — Every currently assigned invite in one place: code, who it's credited to, current uses, and expiry. The overview, versus `/invites user`'s one-person view.
- **`/invites revoke`** — Deletes a previously assigned invite (autocomplete over the active ones). Mods/Admin can revoke anyone's; everyone else only their own — the self-service undo for `create_self`'s one-invite-at-a-time limit.
- **`/invites user`** — Same stats for one person (defaults to yourself), plus any invite links currently credited to them.
- **`/invites disable`** `Admin` — Turns the feature on/off.

Needs the **Manage Server** permission so the bot can see the server's invites, plus **Create Invite** in the channel set via `/invites channel`. `create`/`create_self` fail with a clear error until an Admin has run `/invites channel` at least once (or if the configured channel was later deleted). A `create`d invite is always credited to whoever it was assigned to — Discord itself would otherwise record the bot as the "creator", since the bot is the one making the API call, not the person it's meant for. A normal invite someone makes themselves through Discord is still credited to them, same as before this existed. Also catches joins through the server's vanity URL, if it has one — those aren't tied to a specific inviter, just recorded as "vanity". Joins that can't be attributed at all (Discord Discovery, the widget, or two invites changing at the exact same instant) are still counted overall but recorded with no inviter.

## 🎖️ Mod Role (`/modrole`)

`Admin`. Sets which role counts as "Mod" everywhere the bot checks for one — every command and feature that says `Mod` in this guide reads this same per-server setting.

- **`/modrole role:<role>`** — sets it.
- **`/modrole`** (no options) — shows the role currently configured, or tells you none is set yet — until you set one, only Administrators count as Mod on that server.

## 🔐 Permission Audits (`/2faroles`, `/modroles`)

Both `Admin`. Two related security-audit commands, always used together:

- **`/2faroles [ignore_bots]`** — lists roles with at least one permission Discord requires 2FA for (server-wide and per-channel overrides).
- **`/modroles [ignore_bots]`** — broader companion: also flags commonly-assumed "mod" permissions (Audit Log, Nicknames, Expressions, Timeout) that aren't actually 2FA-gated, and catches per-channel overrides granted to individual people, not just roles.

Both take an optional `ignore_bots:true` to skip bot-owned roles.

## ❓ Question of the Day (`/qotd`)

Posts a question from a queue on a schedule — a fixed time every day, or every N hours — optionally pinging a role in the post. The schedule itself and drag-and-drop reordering of the queue are still dashboard-only; everything else now also works from Discord.

- **`/qotd add`** `Mod` — adds a question to the queue.
- **`/qotd channel`** `Mod` — sets which channel questions post in.
- **`/qotd edit`** `Mod` — changes an existing question's text (autocomplete over the queue).
- **`/qotd list`** `Mod` — lists every question still waiting to be posted.
- **`/qotd post`** `Mod` — posts the next question in the queue right now, ignoring the schedule.
- **`/qotd remove`** `Mod` — removes a question from the queue (autocomplete).
- **`/qotd role`** `Mod` — sets (or clears, if left empty) the role pinged when a question posts.
- **`/qotd status`** `Mod` — shows the channel/role/schedule currently configured, how many questions are left, and a preview of the next one.
- **`/qotd disable`** `Admin` — turns the feature on/off.

If the queue runs out, posting pauses automatically (no looping or reshuffling) and the dashboard shows a warning until more questions are added.

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

## 🗄️ Server Backup (`/serverbackup`)

Snapshots the server's roles (plus which members held which, by Discord user ID), categories, channels — names, colors/settings, and permission overwrites — and emoji, stickers, and soundboard sounds (the actual files, downloaded and stored, since those can't be reconstructed from just a name).

- **`/serverbackup create`** `Admin` — Saves a snapshot, with an optional label to remember it by. `what` picks the scope: everything (default), roles only, categories/channels only, or emoji/stickers/soundboard only.
- **`/serverbackup list`** `Admin` — Lists every saved backup, across every server the bot backs up (not just this one).
- **`/serverbackup members`** `Admin` — Just the member role reassignment part of a restore, on its own — no role/channel creation, no confirmation prompt, much faster than a full `restore`. Use this to catch up members who joined *after* the last restore already ran, instead of redoing the whole thing.
- **`/serverbackup restore`** `Admin` — Recreates whatever's missing from a chosen backup (autocomplete over saved ones). Matches roles/emoji/stickers/soundboard sounds by name and channels by name/type/category, so it only ever adds what's missing — nothing already there gets touched or deleted, and it's safe to run more than once. `what` lets you restore a narrower scope than the backup contains. Role hierarchy is restored best-effort: a role positioned above the bot's own can't be moved there automatically.
- **`/serverbackup disable`** `Admin` — Turns the feature on/off.

A backup isn't tied to the server it came from — any saved backup can be restored on **any** server the bot is in. That's what makes it possible to test a restore safely: take a backup of the real server, invite the bot to an empty test server, and restore there without any risk to the original. Needs the **Manage Roles**, **Manage Channels**, and/or **Manage Guild Expressions** permissions, depending on scope.

Restored emoji, stickers, and soundboard sounds always get brand-new Discord IDs — there's no way to reuse the original one. Any old message that used the original will keep showing as a broken emoji/sticker even after a restore brings it back under the same name.

Restoring roles also reassigns them to whoever from the backup is already a member of the target server, matched by their Discord user ID — additive only, it never removes a role. Anyone who hasn't joined the target server yet is just skipped for now. As more people migrate over afterward, run `/serverbackup members` (not the full `restore`) to pick them up — it's the same reassignment step alone, without redoing the role/channel creation work that's already done.

Bot/integration/booster ("managed") roles are never recreated — only Discord can create those. If the backup references one that isn't in the target server yet, `restore` lists which apps are missing and asks you to confirm before proceeding: cancel and invite them first for a full restore, or go ahead anyway — that one permission is silently skipped, nothing else is affected.

Other bots' own roles (and any booster/integration role — anything Discord marks "managed") are never recreated, since the API has no way to make a real one. **Invite those bots to the target server before restoring**: Discord creates their managed role automatically with the right name, so any channel overwrite from the backup that referenced it resolves correctly during the restore. Invite a bot afterward instead, and that one overwrite is just quietly skipped — everything else restores normally, and the bot's own permissions still come from its OAuth invite as usual.

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

## 🎨 Themes (`/themes`)

A copy of Question of the Day (same queue/schedule/Google Sheet mechanics), posting a "Tema del giorno" instead of a question — its own fully independent channel, role, schedule and queue, so it can run alongside `/qotd` without interfering. Everything is set up on the dashboard; the command covers the same two things as `/qotd`.

- **`/themes post`** `Admin` — posts the next theme in the queue right now, ignoring the schedule.
- **`/themes status`** `Admin` — shows the channel/role/schedule currently configured, how many themes are left, and a preview of the next one.
- **`/themes disable`** `Admin` — turns the feature on/off.

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

## 🖥️ Web Dashboard

A web dashboard runs alongside the bot (same process, same URL Render gives it). Log in with Discord — access is granted to whoever has the **Administrator** permission OR the server's configured **Mod** role (set with `/modrole`) on at least one server the bot is in, no separate password or account. The login sticks around for 30 days and renews itself while you're active, surviving redeploys and the free-plan sleep/wake cycle — you shouldn't need to log in again every time.

If you have access on more than one server the bot is in, you'll see a server picker right after logging in (each one tagged Admin or Mod) — pick which one to manage. Switch to a different one anytime via the "Cambia server" link in the sidebar, no need to log out first. If you only have access on one server, you're taken straight there, same as before.

There's a sidebar listing every feature, and an overview page with a few basic numbers (member count, how many features are enabled, total Honeypot kicks, bot uptime) for whichever server is currently selected. Per-feature settings pages are being added one at a time — the ones that exist so far show as normal sidebar links (to an Admin — see below for what a Mod sees), the rest are greyed out ("coming soon").

**Admin vs. Mod**: an Admin always has full access to every page. A Mod only sees and can open whichever feature pages an Admin has explicitly shared — there's an "Admin only" item right next to "Active" in that feature's header button group; click it to make it inactive and the feature appears in that Mod's sidebar too (the label always stays "Admin only", only its color flips). On a page shared with them, a Mod can do exactly what an Admin can (add, edit, remove, everything) — the only things that stay Admin-only even there are the on/off item itself and any base config (channel, ruolo, programmazione). The two "Strumenti" pages below (Ruoli & Permessi, Permessi per canale) are always Admin-only and can't be shared. This whole thing only works once a Mod role is actually set with `/modrole` — until then, logging in still requires Administrator, same as before.

- **Birthday** — turn it on/off, set the birthday role/removal timer/greeting channel (change just one and leave the others alone, same as `/birthday config`), see every saved birthday grouped by month with how many days until each one, and add a birthday for any member (a dropdown, not typing a user ID). If today happens to be the date you just saved, the role gets assigned and the greeting sent right away, same as doing it through `/birthday add`. Each saved birthday has its own Modifica/Rimuovi pair — change the date in place, or remove that birthday entirely; if the person's left the server since, the date can't be edited anymore, but removing still works.

Every feature page's header shares the same controls, top-right, rendered as one connected button group — colored when active, the default muted color when not; labels are fixed English strings, only the color changes:

- **Active** — the feature's own on/off, applies the moment you click it, same control on every feature page.
- **Admin only** (Admin-only) — see "Admin vs. Mod" above; colored/active keeps the feature Admin-only, uncolored/inactive also shares it with Mods.
- **Edit** (Admin-only to change) — when made inactive, freezes that page's own add/edit/remove/reorder forms without touching Active or base config (channel/role/schedule); a locked feature keeps doing whatever it already does (QOTD keeps posting, Honeypot keeps trapping), only the dashboard's own CRUD forms for its list stop working, for Admin and Mod alike, until an Admin makes it active again. A Mod sees the same button, greyed out and un-clickable — just enough to tell whether it's currently locked.
- **Reorder** (Admin-only) — the panel sections on that page sit on an invisible grid (up to 3 columns, as many rows as you need); clicking Reorder toggles between browsing normally and rearranging/resizing them. Drag a card by its handle (⣿, top-left) to move it to a different cell — while dragging, a dashed outline shows every empty cell, and the cell under your cursor turns green when it's free or red when it's already taken; drop it on a taken cell and it just snaps back to where it was, nothing swaps or shifts around to make room. If the spot is just too small for the card as it currently is (a neighbor, or the edge of the grid, is in the way) it shrinks automatically to fit instead of refusing the drop — it only actually rejects a drop when the cell right under the card would land on top of another card. That's also what lets you leave a cell empty on purpose — between two cards, or as a gap further down — it just stays blank, no filler card involved. Each card also gets a little grip in its bottom-right corner: dragging it changes width (whole-column steps) and height (completely free), both stopping the instant they'd grow into a cell another card already owns — so resizing can push into your own free space but never overlaps a neighbor. Height still has the same magnetic snap as before: get a card's edge close to another visible card's edge and it locks onto that exact height, releasing again the moment you keep dragging past it. Shrink a card smaller than its own content needs and it scrolls inside itself instead of spilling out. It doesn't save on every change — switching Reorder back off only saves if you actually dragged or resized something while it was active. Changing the column count below reshapes the whole grid, so it re-packs everything densely at that moment — the one case where a deliberately-left gap isn't guaranteed to survive, since the grid it was placed on doesn't exist in that shape anymore. Everything is saved to **your own browser's `localStorage`**, per feature — not shared with anyone else, on purpose, so another Admin (or you on a different device) never sees a layout you didn't set yourself.
- **1 Col / 2 Cols / 3 Cols** (everyone, Admin and Mod) — how many columns that page's cards use — just a personal viewing choice, saved the same per-browser way.

Individual entries in a list (a channel, a link, a saved session, …) all use the same two small icon buttons: a pencil for Modifica, which pops a little edit form open right under it, and a red X for Rimuovi, always red no matter what it's attached to. An entry with nothing to edit — just a one-shot remove/revoke — only shows the red X. Opening a Modifica popover elsewhere on the page closes whichever one you already had open, so there's never more than one stacked on top of another.

- **Anime Night** — turn it on/off, sessions listed grouped by the date they were watched (a "session" = every anime watched that day), each with a "Modifica" section to replace the whole title list and/or move it to a different date. Add new titles to today (or a chosen date) from the form at the bottom — landing on a date that already has a session just adds to it. Removing a session removes every title in it at once. Its two cards ("Sessioni" and "Aggiungi anime") use the standard card grid/resize/reorder described above.
- **Autoresponder** — turn it on/off, see and manage every channel with an auto-reaction configured (emoji list, optional filters for attachment/video link/X link, optional "wait for this bot to post, then react to its message instead" redirect), add a new one or remove an existing one. Each configured channel has a "Modifica" section pre-filled with its current settings. Setting it up on a thread or forum instead of a plain channel still needs `/autoresponder add` on Discord.
- **Booster Links** — turn it on/off, see and manage every custom perk role tracked for a booster, remove an existing link, or re-point it to a different role from its "Modifica" section. Linking a *new* role happens from Discord with `/boosterlink add` (same bot-role-above-the-linked-role check as before — the dashboard no longer has its own "add" form). If someone stops boosting, the linked role comes off them and the link is marked **paused** (shown with an "In pausa" badge) instead of being deleted — start boosting again and the role comes right back automatically, no need to re-link it; the only way a link actually goes away is a Mod removing it. There's also a separate list of roles that are exempt from that pause/removal entirely — its picker is a multi-select, so you can mark several roles exempt in one go instead of one at a time. Names in the linked-roles list also show a **Mod** badge (live from the server's `/modrole` setting) and/or an **OG/Fren** badge if they hold whichever role is set as OG/Fren — there's no dashboard control for picking that role anymore (the config card was removed), so it can only be changed directly in the database.
- **Combined Role Search** — turn it on/off, and a search tool below it: pick up to 3 required roles and up to 2 "BUT" roles to exclude, hit Cerca, see everyone who matches. It's a live query, not something you save — for more than 3 required or 2 excluded roles at once, use `/comboroles search` on Discord.
- **GoosePizza** — turn it on/off, see and manage every trigger (name, trigger text, emoji, response mode — comment or react — and which channels it watches), add a new one or remove an existing one. Each trigger has a "Modifica" section pre-filled with all of its settings including the channel list, plus its own on/off switch separate from the feature-wide one.
- **Honeypot** — turn it on/off, see and manage every trap channel (add a new one with an optional custom message/button label/bait emoji, or remove an existing one), and the full kick log with totals. Each trap also has an "Edit" section, pre-filled with whatever the message/button/emoji currently are — saving it edits that same message live in the channel (and swaps its bait reaction) instead of posting a new one. Picking a different channel there instead *moves* the trap: the old message is deleted and a fresh one is posted in the new channel. The emoji field has a picker button next to it (😀) showing a grid of common emoji plus the server's own custom emoji — click one instead of typing it in by hand.
- **Incident Counter** — turn it on/off, see the current count and posting channel at a glance, change the channel, or manually set/reset the counter. Each of those reposts the sign image right away, same as `/incident channel`, `/incident set` and `/incident reset`.
- **Invite Tracker** — turn it on/off, set the channel new invites open into, a top-10 leaderboard, and every invite currently assigned to someone with its live uses/expiry (pulled straight from Discord, not just what's saved), with a revoke button. Make a brand-new invite for a member (with optional max uses / hours until expiry), or credit one that already exists by pasting its code or link. One-per-member self-service invites and per-invite channel overrides are still Discord-only.
- **Question of the Day** — turn it on/off, pick the posting channel and an optional role to ping, and set the schedule (a fixed time every day, or every N hours). Add questions one at a time by hand, drag them to reorder the queue — that order is also the posting order — edit or remove any question inline, or clear the whole queue at once with "Svuota coda". If the queue empties out, a banner warns you and posting pauses until you add more; `/qotd` also covers add/edit/remove/channel/role/post/list/status from Discord now — only the schedule and drag-to-reorder stay dashboard-only.
- **Reaction Limit** — turn it on/off, see and manage every configured channel (max reactions per person per thread, with an option to exclude the thread's starter message), add a new one or remove an existing one. Each configured channel has an "Modifica" section pre-filled with its current settings — saving it just overwrites the same channel's config. Applying it to a single thread instead of a whole channel still needs `/reactionlimit add` on Discord.
- **Role Links** — turn it on/off, see and manage every role1 → role2 link (losing role1 removes role2, and the other way round too if "viceversa" is on), add a new one or remove an existing one. Each link has a "Modifica" section to change either role or the direction. Linking one role to several roles at once still needs `/rolelink add` on Discord.
- **Server Backup** — turn it on/off, see every backup taken on this server (label, date, who made it, how many emoji/sticker/soundboard sounds), make a new one (pick what to include — roles, channels, members, assets, or everything), and restore one through a confirmation page that shows which bot/integration roles would be skipped first, or just re-sync member roles for anyone who joined after a restore already ran. Only shows/restores backups from this server, even though a backup can be restored onto any server the bot's in via the Discord command.
- **Slowmode** — turn it on/off, see and manage every channel with a post cooldown (e.g. one message every 12h), add a new one or remove an existing one. Each configured channel has a "Modifica" section pre-filled with its current cooldown. Limiting an individual thread instead of a whole channel still needs `/slowmode add` on Discord.
- **Sticky Messages** — turn it on/off, see and manage every channel with a sticky message (content + how long it waits after new activity before reappearing), add a new one or remove an existing one. Each configured channel has a "Modifica" section pre-filled with its current text/delay. Along the way we fixed a bug where editing a sticky (from here or from `/sticky edit`) left the old message sitting in the channel and posted a duplicate underneath instead of replacing it.
- **Suggestions** — turn it on/off, set the posting channel, see every pending suggestion with buttons to approve/reject/remove it and a "Modifica" to edit the text. Approving/rejecting posts a fresh updated copy instead of editing the original, same as on Discord — submitting a new suggestion is still Discord-only, this page is for moderating what's already there.
- **Themes** — a copy of Question of the Day: same toggle, channel/role/schedule setup, drag-to-reorder queue and exhaustion banner, but posts "🎨 Tema del giorno" instead of a question, with its own independent channel/role/schedule/queue so it can run alongside QOTD. `/themes post` and `/themes status` mirror `/qotd`'s Discord-side commands.
- **WaifuWar LR** — turn it on/off, see and manage every channel set up for reaction codes, add a new one or remove an existing one (removing also clears its digit mappings). Each channel shows its digit→emoji table with a remove button per row, plus an "Aggiungi/modifica mappature" form where you can set several at once by comma-separating digits and emoji in the same order. The actual "post an image, then type digits" part only works live on Discord — this page just manages the setup behind it.
- **Warnings** — turn it on/off, set the two escalation roles and the posting channel, and one form for both a warning (automatic role escalation, works even for someone who already left) and a role-less verbal note (needs a current member) — pick which with the type switch at the top; the user field works both ways too, start typing a name to search the live member list or type/paste an ID directly (the only option for someone who's left, since a verbal needs them to still be around). Also a recent-activity table, and a section listing whatever warnings/verbals *you* issued with a "Modifica" to change the reason/date — same "only the person who issued it can edit it" rule as `/warning edit`. There's no delete button because there's no delete on Discord either.

There's also a separate "Strumenti" section in the sidebar, below the feature list, for tools with no on/off switch — most are a live query recomputed every time you open the page (same as running the equivalent slash command), and one is a live editor with no slash equivalent at all.

- **Permessi per canale** — no slash command equivalent, this one only exists on the dashboard. Pick a channel from the list (grouped by category, same order as Discord's own sidebar), and next to it you get the same "Advanced permissions" panel Discord itself shows: which roles/members have an override on that channel, and for whichever one you select, every relevant permission (general + text or voice depending on the channel type, plus a moderation set that's always shown) with a three-way deny/neutral/allow control — click to change it, then "Salva permessi" to apply. Adding a role/member to the list doesn't touch Discord until you actually save something for them; "Rimuovi override" deletes the whole entry, resetting every permission back to neutral. Saving is blocked (with a clear message) if it would grant the bot a permission it doesn't itself hold on that channel — same rule Discord enforces on its own permissions UI.
- **Ruoli & Permessi** — the dashboard version of `/2faroles` and `/modroles`: an "ignora ruoli/membri bot" checkbox, then two lists computed fresh on load — roles with a 2FA-required permission (server-wide or via a channel override), and the broader "commonly considered moderator-level" list, which also catches overrides granted to an individual person rather than a role.

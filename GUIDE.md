# Bot commands

Quick guide to what each command does. No technical details, just practical usage.

Every feature listed below can be turned on/off for the whole server either with the universal
**`/disablefeature feature:<pick one> enabled:true|false`** (Administrator only), or with that feature's own
**`/<command> disable enabled:true|false`** subcommand — both control the exact same on/off switch, so use
whichever is more convenient. Disabling a feature keeps its saved data, but stops its automatic behavior and
blocks its commands until it's re-enabled.

**`/commandlist`** — Mod only (Manage Roles). Reply is only visible to you. Shows a table of every command in the
bot, who can use it (**Admin**/**Mod**/**Everyone**), and which options each one takes — options with no brackets
are required, `[optional]` ones aren't (pulled live from the commands themselves, so it can't drift out of date).
Paginated with buttons if it doesn't fit on one page.

## 📺 Anime Night (`/animenight`)

- **`/animenight add`** — Admin only. Adds one or more anime watched in a session (e.g. "Naruto, Bleach").
- **`/animenight remove`** — Admin only. Removes a single anime entry (autocomplete lets you search for it).
- **`/animenight list`** — Shows the full watched anime list, grouped by session.
- **`/animenight last`** — Shows only the anime from the most recent session.
- **`/animenight edit`** — Admin only. Edits an existing session (titles and/or date).
- **`/animenight disable`** — Admin only. Turns the feature on/off for this server.

## 🎂 Birthdays (`/birthday`)

- **`/birthday add`** — Save your birthday (day, month and, if you want, year). A mod can use it to save someone else's birthday.
- **`/birthday edit`** — Change your already-saved birthday. A mod can edit someone else's. Only works if a birthday is already saved — use `add` first.
- **`/birthday remove`** — Delete your saved birthday. A mod can remove someone else's.
- **`/birthday config`** — Admin only. Sets the role given to whoever's celebrating, how long before removing it, and/or the channel where greetings are posted.
- **`/birthday list`** — Shows every birthday in the server, grouped by month.
- **`/birthday disable`** — Admin only. Turns the feature on/off for this server.

On someone's birthday, the bot automatically assigns the role (if configured) and posts a greeting (if a channel is configured), then removes the role after the configured time.

## 🚀 Booster custom roles (`/boosterlink`)

Admin only (Manage Roles). Links a custom role (that you assign manually to a booster) to that user, so it gets automatically removed if they stop boosting the server.

- **`/boosterlink add`** — Links a custom role to a booster.
- **`/boosterlink remove`** — Stops tracking the link (does not remove the role from the user). The role is optional (autocomplete, only shows roles actually tracked for that user): if omitted, it untracks every role linked to that user at once.
- **`/boosterlink edit`** — Swaps which role is tracked for a user, in one step (autocomplete on the old role).
- **`/boosterlink list`** — Lists active links, optionally filtered by user.
- **`/boosterlink disable`** — Turns the feature on/off for this server.

When a user loses Discord's Booster role (boost expired, manually removed, etc.), every custom role linked to them gets automatically removed. `/boosterlink exempt` manages a list of roles that skip this — a user only needs one of the configured exempt roles to be skipped entirely, even if they have linked roles and lose the booster role.

## 🔎 Combined role search (`/comboroles`)

Mod only (Manage Roles) for `search`; `disable` is Admin only.

- **`/comboroles search`** — Shows the users who have **all** of the given roles, optionally excluding anyone who also has one of up to three "BUT" roles. Results are paginated.
- **`/comboroles disable`** — Admin only. Turns the whole feature off/on for this server.

## 🍕 GoosePizza (`/goosepizza`)

Admin only. A little passive fun feature: whenever anyone says a chosen word in one of its chosen channels, the bot automatically responds with a chosen emoji — either by posting it as a new message, or by reacting with it directly on the triggering message. You can set up multiple independent triggers — different words, channels, emojis and modes can all coexist, including several watching the same channel at once — and each trigger can itself watch more than one channel.

- **`/goosepizza add`** — sets up a new trigger's name, word/phrase, emoji, and mode (Comment or React); right after, you'll get a channel picker (a native Discord select menu listing every channel in the server) to choose which channel(s) it watches.
- **`/goosepizza edit`** — changes the word/phrase, emoji, and/or mode of an existing trigger. The `name` option has autocomplete.
- **`/goosepizza channels`** — opens the same channel picker for an existing trigger, pre-filled with its current channels; whatever you select replaces the list entirely.
- **`/goosepizza remove`** — deletes a trigger.
- **`/goosepizza list`** — shows every trigger configured in the server, and every channel each one watches.
- **`/goosepizza disable`** — turns a single trigger on/off (pass `name`), or GoosePizza entirely (every trigger at once, if `name` is omitted). (`/disablefeature` maps to the same all-triggers switch.)

## 🪧 Incident (`/incident`)

Admin only (the command itself is hidden from anyone without the Administrator permission). Keeps a "Days since last incident" sign updated in a channel with the current count.

- **`/incident channel`** — Sets the channel where the sign is kept updated.
- **`/incident set`** — Manually sets the counter to a specific number.
- **`/incident reset`** — Resets the counter to 0 (use it when an incident just happened).
- **`/incident disable`** — Turns the feature on/off for this server.

Every day at midnight the counter increases by 1 automatically and the sign is regenerated. Only one message is ever kept visible: the old one is deleted when the sign updates.

## 🔗 Linked roles (`/rolelink`)

Admin only, except `list` which also works for mods (Manage Roles). Generic version of the concept above, not tied to boosting: links any two roles so that losing the first automatically removes the second.

- **`/rolelink add`** — Pick `role1`, then a picker lets you choose **one or more** target roles at once; losing role1 removes all of them. Optional `viceversa` option (default off): if on, losing a target role also removes role1.
- **`/rolelink remove`** — Removes a link (same role1/role2 order used when it was created).
- **`/rolelink edit`** — Change an existing link's roles and/or `viceversa` setting.
- **`/rolelink list`** — Lists every link configured in the server.
- **`/rolelink disable`** — Admin only. Turns the feature on/off for this server.

## ⏳ Post Limit (`/postlimit`)

Admin only. Limits how often each person can post in a channel — for cooldowns longer than Discord's own slowmode (capped at 6h), or when you want it enforced consistently regardless of Discord's setting. Each channel has its own independent duration. Violating messages are deleted immediately, with a short, auto-deleting notice posted in the channel explaining when the person can post again (no DMs). Moderators (Manage Messages or Administrator) are always exempt.

- **`/postlimit add`** — Sets (or replaces) the limit for a channel: a duration like `12h`, `1d`, `3d` (minimum 1 minute).
- **`/postlimit remove`** — Removes the limit from a channel.
- **`/postlimit list`** — Shows every channel with a limit configured, and what it is.
- **`/postlimit disable`** — Turns the feature on/off for this server.

## ⭐ Starboard (`/starboard`)

Admin only, except `list` which is open to everyone. Collects the most popular messages of a channel (by reaction count) and reposts them to a dedicated channel. You can set up more than one starboard, each watching its own channel and posting to its own (different) channel.

- **`/starboard create`** — Sets up a new starboard: give it a name, the channel to watch for reactions, the channel to post to, the minimum number of reactions needed, which emoji(s) count (one or more, or `any` to count a reaction with any emoji at all), and optionally a content-type filter (e.g. images only).
- **`/starboard edit`** — Changes any combination of the settings above for an existing starboard. The `name` option has autocomplete.
- **`/starboard remove`** — Deletes a starboard. Already-posted messages are left as they are, but stop being updated.
- **`/starboard list`** — Shows every starboard configured in the server.
- **`/starboard disable`** — Admin only. Turns the feature on/off for this server.

A message qualifies once enough different people have reacted with at least one of the configured emojis (reacting with two counted emojis only counts once per person, and the message author's own reaction doesn't count). The reaction count on the starboard post stays live: if it later drops back below the threshold, the post is removed from the starboard. If the original message gets deleted, its starboard post is removed too.

Once a message is reposted, the bot auto-reacts with ⭐ on its own copy — you can keep starring it right from the starboard channel from then on, and those extra reactions add to the count too (the bot's own reaction never counts towards the total).

Optionally, each starboard can restrict which kind of message qualifies at all: **Any message** (default), **Text only**, **Images only**, **GIFs only**, **Videos only**, **Any media**, or **Text + media** (needs both a caption and an attachment).

- **`/starboard lookback`** — Scans a starboard's watch channel for messages that already qualify but haven't been picked up yet — handy right after creating a new starboard, or to catch up on messages missed while the bot was offline. By default it scans the most recent 200 messages (up to 1000), but you can instead scan back to January 1st, back to a specific date, or a specific date range (from/to). After running the command, you'll get a channel picker showing every channel in the server, so you can optionally add a few more channels to the same scan — or just hit "Run now" to scan the starboard's own channel only. Messages are processed oldest-first, so starboard posts appear in the same order the messages were actually sent. You can also, just for that scan, check a different content type, different emoji(s), or a different minimum vote count than what the starboard is normally configured for, without changing its saved settings. If a handful of messages fail to check (a temporary hiccup), the scan keeps going and tells you how many it had to skip — you can just run it again to pick those up.

## 📌 Sticky messages (`/sticky`)

Admin only, except `list` which is open to everyone.

- **`/sticky add`** — Sets (or replaces) the sticky message for a channel. The message text is typed directly as a command option, no popup window.
- **`/sticky edit`** — Changes the text of an existing channel's sticky message. The `channel` option shows only channels that currently have a sticky (with a text preview), instead of every channel in the server. Reposts right away with the new text.
- **`/sticky remove`** — Removes the sticky message from a channel.
- **`/sticky list`** — Shows every sticky message configured in the server.
- **Right-click a message → Apps → "Sticky: Add"** — same as `/sticky add`, but uses that message's own text instead of retyping it.
- **Right-click a message → Apps → "Sticky: Edit"** — opens a popup pre-filled with that channel's current sticky text; edit it and submit to update.
- **Right-click a message → Apps → "Sticky: Remove"** — removes whatever sticky is configured for that channel (the message you clicked doesn't matter, it's just a quick entry point).
- **`/sticky disable`** — Admin only. Turns the feature on/off for this server.

The sticky message is reposted at the bottom of the channel after each new message (deleting the old one first, waiting 10 seconds between the deletion and the repost).

## 💡 Suggestions (`/suggestion`)

- **`/suggestion add`** — Submits a new suggestion.
- **`/suggestion edit`** — Edits one of your own pending suggestions.
- **`/suggestion remove`** — Removes your own pending suggestion. If you have more than one pending, you must give the `number`. An admin can instead remove **any** suggestion by number.
- **`/suggestion list`** — Shows every suggestion still waiting for a decision.
- **`/suggestion approve`** / **`/suggestion reject`** — Admin only. Decides a suggestion. Admins can also decide by reacting to the suggestion's own message.
- **`/suggestion channel`** — Admin only. Sets where suggestions get posted; omit the channel to remove the current one.
- **`/suggestion disable`** — Admin only. Turns the feature on/off for this server.

## ✅ Verification (`/verify`)

`/verify config` is Admin only; every other subcommand needs Manage Roles, or the role configured via `/verify config allowedrole`.

- **`/verify config`** — Admin only. Sets the roles to assign for each verification type (sub / domme / maledom), the shared role to remove (if any) when verifying someone, the channel where reports get posted, and (optionally) an extra role allowed to use `sub`/`domme`/`maledom`/`edit` without needing Manage Roles.
- **`/verify sub`**, **`/verify domme`**, **`/verify maledom`** — Verifies a user as one of the three types: assigns the matching role, removes the configured role (if any), and posts a report in the set channel. If the user already had a previous report, it's replaced by the new one. **Note:** `/verify sub` no longer has a "social" field (removed on request); `/verify domme` and `/verify maledom` still have it.
- **`/verify edit`** — Edits the verification/social fields of a user's last report.
- **`/verify disable`** — Turns the feature on/off for this server.

## ⚠️ Warnings (`/warning`, `/verbal`)

Everything below Admin-only is Moderate Members. Keeps a running, always-up-to-date list of warnings in a channel you choose.

- **`/warn`** — Warn a user by their **ID** (works even if they've already left the server). Automatically escalates: no role yet → assigns `role_1`; already has `role_1` → assigns `role_2`; already has `role_2` → assigns nothing and tells you the team should discuss banning them in chat instead. Optional `date` to backdate it (date only, never a time).
- **`/warning config`** — Admin only. Sets any combination of the two escalation roles `/warn` uses (`role_1` and `role_2`, provided together) and/or the channel where the warnings list is posted and kept updated.
- **`/warning edit`** — Edit one of **your own** past warnings/verbals (autocomplete only shows entries you personally issued) — change the reason and/or the date.
- **`/warning update`** — Admin only. Re-renders the warnings list embed with whatever the current formatting/content logic is, without needing a new warning to trigger it.
- **`/verbal`** — Lighter version: just a user and a reason, no role assigned. Same optional `date`.
- **`/warning disable`** — Admin only. Turns the feature on/off for this server (also disables `/warn` and `/verbal`, which share the same on/off state).

The embed shows the **name of the role actually assigned** on each line instead of a generic "Warning" label (falls back to "Warning" if no role was assigned that time — already maxed out, or the user wasn't in the server). If anyone who was ever escalated to `role_2` later gets banned, they show up in a "🔨 Banned after final warning" section at the bottom (needs the bot to have the Ban Members permission; silently skipped otherwise).

Everything is logged in a single embed that gets edited in place (never reposted) — titled "Warnings", showing when it was last updated, and then one block per user with every warning/verbal they've ever received. Whenever someone gets a new one, their block jumps back to the top of the list.

const { createClient } = require('@libsql/client');
const config = require('../config/config');

if (!config.turso.url || !config.turso.authToken) {
  console.error('❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set (turso.tech dashboard).');
  process.exit(1);
}

const client = createClient({
  url: config.turso.url,
  authToken: config.turso.authToken,
});

// --- Base schema, shared by all of the bot's features ---
// Each "feature" of the bot has its own tables, created here explicitly so the
// whole schema is easy to see in one place when adding new features.
// New installs get the schema below directly. Existing installs (already deployed
// with an older schema) are upgraded by migrate() further down, which never
// touches already-saved data.
async function createTables() {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS birthday_guild_config (
        guild_id TEXT PRIMARY KEY,
        birthday_role_id TEXT,
        remove_after_seconds INTEGER NOT NULL DEFAULT 86400,
        birthday_channel_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS birthdays (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        day INTEGER NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER,
        PRIMARY KEY (guild_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS birthday_role_assignments (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        assigned_at INTEGER NOT NULL,
        year_assigned INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS birthday_greetings (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        year_greeted INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS anime_night_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        title TEXT NOT NULL,
        watched_date TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        added_by TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS anime_night_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS verify_role_config (
        guild_id TEXT PRIMARY KEY,
        sub_give_role_id TEXT,
        domme_give_role_id TEXT,
        maledom_give_role_id TEXT,
        remove_role_id TEXT,
        report_channel_id TEXT,
        allowed_role_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS verify_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        verification TEXT NOT NULL,
        social TEXT NOT NULL,
        verified_at INTEGER NOT NULL,
        moderator_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS sticky_messages (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        content TEXT NOT NULL,
        last_message_id TEXT,
        created_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      )`,
      `CREATE TABLE IF NOT EXISTS sticky_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS booster_link_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS booster_link_links (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER,
        PRIMARY KEY (guild_id, user_id, role_id)
      )`,
      `CREATE TABLE IF NOT EXISTS booster_link_exempt_roles (
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        added_by TEXT,
        added_at INTEGER,
        PRIMARY KEY (guild_id, role_id)
      )`,
      `CREATE TABLE IF NOT EXISTS role_link_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS role_links (
        guild_id TEXT NOT NULL,
        role_a_id TEXT NOT NULL,
        role_b_id TEXT NOT NULL,
        bidirectional INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at INTEGER,
        PRIMARY KEY (guild_id, role_a_id, role_b_id)
      )`,
      `CREATE TABLE IF NOT EXISTS incident_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        count INTEGER NOT NULL DEFAULT 0,
        last_message_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS suggestion_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS comboroles_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        channel_id TEXT NOT NULL,
        message_id TEXT,
        created_at INTEGER NOT NULL,
        decided_by TEXT,
        decided_at INTEGER,
        UNIQUE (guild_id, number)
      )`,
      `CREATE TABLE IF NOT EXISTS starboard_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS starboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        watch_channel_id TEXT NOT NULL,
        post_channel_id TEXT NOT NULL,
        threshold INTEGER NOT NULL,
        emojis TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'any',
        created_by TEXT,
        created_at INTEGER,
        UNIQUE (guild_id, name)
      )`,
      `CREATE TABLE IF NOT EXISTS starboard_posts (
        guild_id TEXT NOT NULL,
        starboard_id INTEGER NOT NULL,
        original_message_id TEXT NOT NULL,
        original_channel_id TEXT NOT NULL,
        starboard_message_id TEXT NOT NULL,
        reaction_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (starboard_id, original_message_id)
      )`,
      `CREATE TABLE IF NOT EXISTS warning_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        role_1_id TEXT,
        role_2_id TEXT,
        embed_message_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        reason TEXT NOT NULL,
        role_id TEXT,
        issued_by TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS goosepizza_config (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS goosepizza_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        emoji TEXT NOT NULL,
        response_mode TEXT NOT NULL DEFAULT 'message',
        created_by TEXT,
        created_at INTEGER,
        UNIQUE (guild_id, name)
      )`,
    ],
    'write'
  );
}

// Upgrades an already-existing database created before "remove_after_seconds" and
// "birthday_channel_id" existed (back when the only option was "remove_after_hours").
// Safe to run on every startup: each step is skipped once already applied.
async function migrate() {
  const columns = await client.execute('PRAGMA table_info(birthday_guild_config)');
  const columnNames = columns.rows.map((row) => row.name);

  if (!columnNames.includes('remove_after_seconds')) {
    await client.execute('ALTER TABLE birthday_guild_config ADD COLUMN remove_after_seconds INTEGER');
  }
  if (!columnNames.includes('birthday_channel_id')) {
    await client.execute('ALTER TABLE birthday_guild_config ADD COLUMN birthday_channel_id TEXT');
  }
  if (columnNames.includes('remove_after_hours')) {
    // One-time conversion from the old hours-based column to the new seconds-based one.
    // Only touches rows that haven't been migrated yet (remove_after_seconds still NULL).
    await client.execute(
      'UPDATE birthday_guild_config SET remove_after_seconds = remove_after_hours * 3600 WHERE remove_after_seconds IS NULL'
    );
  }
  // Any row that still has no value at this point (brand new, never touched) gets the default.
  await client.execute(
    'UPDATE birthday_guild_config SET remove_after_seconds = 86400 WHERE remove_after_seconds IS NULL'
  );

  const verifyColumns = await client.execute('PRAGMA table_info(verify_role_config)');
  const verifyColumnNames = verifyColumns.rows.map((row) => row.name);

  if (!verifyColumnNames.includes('report_channel_id')) {
    await client.execute('ALTER TABLE verify_role_config ADD COLUMN report_channel_id TEXT');
  }
  if (!verifyColumnNames.includes('allowed_role_id')) {
    await client.execute('ALTER TABLE verify_role_config ADD COLUMN allowed_role_id TEXT');
  }

  // One-time conversion from the old per-type remove roles (sub_remove_role_id,
  // domme_remove_role_id, maledom_remove_role_id) to a single shared remove_role_id.
  // Only touches rows that haven't been migrated yet (remove_role_id still NULL).
  if (!verifyColumnNames.includes('remove_role_id')) {
    await client.execute('ALTER TABLE verify_role_config ADD COLUMN remove_role_id TEXT');
  }
  if (verifyColumnNames.includes('sub_remove_role_id')) {
    await client.execute(
      `UPDATE verify_role_config
       SET remove_role_id = COALESCE(sub_remove_role_id, domme_remove_role_id, maledom_remove_role_id)
       WHERE remove_role_id IS NULL`
    );
  }

  const verifyReportColumns = await client.execute('PRAGMA table_info(verify_reports)');
  const verifyReportColumnNames = verifyReportColumns.rows.map((row) => row.name);

  if (!verifyReportColumnNames.includes('moderator_id')) {
    await client.execute('ALTER TABLE verify_reports ADD COLUMN moderator_id TEXT');
  }

  // One-time move of data from the old custom_role_* tables (feature was renamed
  // to booster_link_*) into the new ones, then drop the old ones. Safe to run on
  // every startup: only runs while the old tables still exist.
  const allTables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  const tableNames = allTables.rows.map((row) => row.name);

  if (tableNames.includes('custom_role_config')) {
    await client.execute('INSERT OR IGNORE INTO booster_link_config SELECT * FROM custom_role_config');
    await client.execute('DROP TABLE custom_role_config');
  }
  if (tableNames.includes('custom_role_links')) {
    await client.execute('INSERT OR IGNORE INTO booster_link_links SELECT * FROM custom_role_links');
    await client.execute('DROP TABLE custom_role_links');
  }

  // The booster-link auto-removal exemption used to be a single role ID hardcoded in
  // the bot's source. It's now a configurable per-guild list (booster_link_exempt_roles,
  // managed via /boosterlink exempt). This one-time seed preserves current behavior for
  // any guild that was already using the feature, without overriding an admin who has
  // since deliberately cleared their exempt list — it only runs while the new table is
  // still completely empty.
  const exemptRolesCount = await client.execute('SELECT COUNT(*) AS c FROM booster_link_exempt_roles');
  if (Number(exemptRolesCount.rows[0]?.c ?? 0) === 0) {
    const guildsWithBoosterLinkData = await client.execute(
      'SELECT DISTINCT guild_id FROM booster_link_links UNION SELECT DISTINCT guild_id FROM booster_link_config'
    );
    for (const row of guildsWithBoosterLinkData.rows) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO booster_link_exempt_roles (guild_id, role_id, added_by, added_at)
              VALUES (?, ?, NULL, ?)`,
        args: [row.guild_id, '1090658915810820156', Date.now()],
      });
    }
  }

  // Adds the "enabled" toggle (default: on) to every guild config table that didn't
  // originally have one. New installs already get it via createTables() above; this
  // only runs against databases created before the toggle existed for that feature.
  const enabledColumnTargets = ['birthday_guild_config', 'verify_role_config', 'suggestion_config', 'incident_config'];
  for (const table of enabledColumnTargets) {
    const tableColumns = await client.execute(`PRAGMA table_info(${table})`);
    const tableColumnNames = tableColumns.rows.map((row) => row.name);
    if (!tableColumnNames.includes('enabled')) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`);
    }
  }

  // The starboards table shipped without "content_type" at first. Upgrades any database
  // created against an earlier version of the table.
  const starboardsTableExists = tableNames.includes('starboards');
  if (starboardsTableExists) {
    const starboardColumns = await client.execute('PRAGMA table_info(starboards)');
    const starboardColumnNames = starboardColumns.rows.map((row) => row.name);

    if (!starboardColumnNames.includes('content_type')) {
      await client.execute("ALTER TABLE starboards ADD COLUMN content_type TEXT NOT NULL DEFAULT 'any'");
    }

    // The short-lived "vote button" mode (voting_method + its two support tables) was
    // removed — Starboard is Reactions-only now. Clean up any database that still has
    // the old column/tables from before this change.
    if (starboardColumnNames.includes('voting_method')) {
      await client.execute('ALTER TABLE starboards DROP COLUMN voting_method');
    }
  }
  await client.execute('DROP TABLE IF EXISTS starboard_vote_messages');
  await client.execute('DROP TABLE IF EXISTS starboard_votes');

  // The goosepizza feature used to support only one channel/trigger/emoji per guild,
  // stored directly on goosepizza_config. It's now multi-trigger (goosepizza_triggers),
  // so any already-configured single trigger is migrated into a "default"-named row
  // there, then the old single-trigger columns are dropped from goosepizza_config
  // (which now only holds the guild-wide enabled toggle).
  if (tableNames.includes('goosepizza_config')) {
    const goosepizzaColumns = await client.execute('PRAGMA table_info(goosepizza_config)');
    const goosepizzaColumnNames = goosepizzaColumns.rows.map((row) => row.name);

    if (!goosepizzaColumnNames.includes('response_mode') && goosepizzaColumnNames.includes('channel_id')) {
      await client.execute("ALTER TABLE goosepizza_config ADD COLUMN response_mode TEXT NOT NULL DEFAULT 'message'");
    }

    if (goosepizzaColumnNames.includes('channel_id')) {
      const existingConfigs = await client.execute('SELECT * FROM goosepizza_config WHERE channel_id IS NOT NULL');
      for (const row of existingConfigs.rows) {
        await client.execute({
          sql: `INSERT OR IGNORE INTO goosepizza_triggers (guild_id, name, channel_id, trigger_text, emoji, response_mode, created_at)
                VALUES (?, 'default', ?, ?, ?, ?, ?)`,
          args: [
            row.guild_id,
            row.channel_id,
            row.trigger_text ?? 'pizza',
            row.emoji ?? '<:pizza01:902913234959495188>',
            row.response_mode ?? 'message',
            Date.now(),
          ],
        });
      }
      for (const col of ['channel_id', 'trigger_text', 'emoji', 'response_mode']) {
        await client.execute(`ALTER TABLE goosepizza_config DROP COLUMN ${col}`);
      }
    }
  }
}

const ready = createTables()
  .then(() => migrate())
  .then(() => console.log('[db] Turso schema ready.'))
  .catch((err) => {
    console.error('[db] Error initializing/migrating the Turso schema:', err);
    process.exit(1);
  });

module.exports = { client, ready };

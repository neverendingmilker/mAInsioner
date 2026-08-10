const db = require('../../database/db');

const DEFAULT_TRIGGER = 'pizza';
const DEFAULT_EMOJI = '<:pizza01:902913234959495188>';

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM goosepizza_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO goosepizza_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

async function getConfig(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM goosepizza_config WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows[0] ?? null;
}

async function setChannel(guildId, channelId) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO goosepizza_config (guild_id, channel_id)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
    args: [guildId, channelId],
  });
}

async function setTrigger(guildId, triggerText) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO goosepizza_config (guild_id, trigger_text)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET trigger_text = excluded.trigger_text`,
    args: [guildId, triggerText],
  });
}

async function setEmoji(guildId, emoji) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO goosepizza_config (guild_id, emoji)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET emoji = excluded.emoji`,
    args: [guildId, emoji],
  });
}

module.exports = {
  DEFAULT_TRIGGER,
  DEFAULT_EMOJI,
  isEnabled,
  setEnabled,
  getConfig,
  setChannel,
  setTrigger,
  setEmoji,
};

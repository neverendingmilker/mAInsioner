const db = require('../../database/db');

// --- Feature on/off toggle ---

async function isEnabled(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT enabled FROM autoresponder_guild_config WHERE guild_id = ?',
    args: [guildId],
  });
  const row = result.rows[0];
  return row ? Number(row.enabled) === 1 : true;
}

async function setEnabled(guildId, enabled) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO autoresponder_guild_config (guild_id, enabled)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET enabled = excluded.enabled`,
    args: [guildId, enabled ? 1 : 0],
  });
}

// --- Per-channel emoji configuration ---

async function setChannel(guildId, channelId, emojis, contentFilter, pairWithinSeconds, createdBy) {
  await db.ready;
  await db.client.execute({
    sql: `INSERT INTO autoresponder_channels (guild_id, channel_id, emojis, require_attachment, require_video_link, require_x_link, pair_within_seconds, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            emojis = excluded.emojis,
            require_attachment = excluded.require_attachment,
            require_video_link = excluded.require_video_link,
            require_x_link = excluded.require_x_link,
            pair_within_seconds = excluded.pair_within_seconds,
            created_by = excluded.created_by,
            created_at = excluded.created_at`,
    args: [
      guildId,
      channelId,
      JSON.stringify(emojis),
      contentFilter.attachment ? 1 : 0,
      contentFilter.videoLink ? 1 : 0,
      contentFilter.xLink ? 1 : 0,
      pairWithinSeconds ?? null,
      createdBy,
      Date.now(),
    ],
  });
}

async function removeChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'DELETE FROM autoresponder_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rowsAffected ?? 0;
}

function mapRow(row) {
  return {
    channelId: row.channel_id,
    emojis: JSON.parse(row.emojis),
    contentFilter: {
      attachment: Number(row.require_attachment) === 1,
      videoLink: Number(row.require_video_link) === 1,
      xLink: Number(row.require_x_link) === 1,
    },
    pairWithinSeconds: row.pair_within_seconds != null ? Number(row.pair_within_seconds) : null,
  };
}

async function getChannel(guildId, channelId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM autoresponder_channels WHERE guild_id = ? AND channel_id = ?',
    args: [guildId, channelId],
  });
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function getAllChannels(guildId) {
  await db.ready;
  const result = await db.client.execute({
    sql: 'SELECT * FROM autoresponder_channels WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows.map(mapRow);
}

module.exports = {
  isEnabled,
  setEnabled,
  setChannel,
  removeChannel,
  getChannel,
  getAllChannels,
};

const { PermissionFlagsBits } = require('discord.js');
const autoresponderManager = require('../../../features/autoresponder/autoresponderManager');

function describeFilter(contentFilter) {
  const parts = [];
  if (contentFilter.attachment) parts.push('has an image/gif/video attachment');
  if (contentFilter.videoLink) parts.push('links a video (e.g. YouTube)');
  if (contentFilter.xLink) parts.push('links an X/Twitter post');

  if (parts.length === 0) return 'every message';
  return `messages that ${parts.join(', or that ')}`;
}

async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const channel = interaction.guild.channels.cache.get(channelId) ?? (await interaction.guild.channels.fetch(channelId).catch(() => null));
  if (!channel) {
    await interaction.reply({ content: "⚠️ That channel doesn't seem to exist anymore.", ephemeral: true });
    return;
  }

  const existing = (await autoresponderManager.listChannels(interaction.guildId)).find((c) => c.channelId === channelId);
  if (!existing) {
    await interaction.reply({ content: `⚠️ ${channel} doesn't have an autoresponder configured — use \`/autoresponder add\` first.`, ephemeral: true });
    return;
  }

  // Every field is optional here — anything not provided keeps its current value.
  const emojisInput = interaction.options.getString('emojis') ?? existing.emojis.join(' ');
  const contentFilter = {
    attachment: interaction.options.getBoolean('require_attachment') ?? existing.contentFilter.attachment,
    videoLink: interaction.options.getBoolean('require_video_link') ?? existing.contentFilter.videoLink,
    xLink: interaction.options.getBoolean('require_x_link') ?? existing.contentFilter.xLink,
  };
  const redirectBotId = interaction.options.getString('redirect_to_bot_id') ?? existing.redirectBotId;
  const redirectWindowSeconds = interaction.options.getInteger('redirect_window_seconds') ?? existing.redirectWindowSeconds;

  let result;
  try {
    result = await autoresponderManager.setChannel(
      interaction.guild,
      channel,
      emojisInput,
      contentFilter,
      redirectBotId,
      redirectWindowSeconds,
      interaction.user.id
    );
  } catch (err) {
    if (err instanceof autoresponderManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const redirectNote = result.redirectBotId
    ? ` If <@${result.redirectBotId}> posts here within **${result.redirectWindowSeconds}s**, the reaction goes on its message instead — otherwise the original poster gets it as a fallback.`
    : '';

  await interaction.reply({
    content: `✅ Updated: I'll react with ${result.emojis.join(' ')} to ${describeFilter(result.contentFilter)} in ${channel} (including its threads).${redirectNote}`,
    ephemeral: true,
  });
}

module.exports = { handleEdit };

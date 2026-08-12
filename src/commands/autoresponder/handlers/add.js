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

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const emojisInput = interaction.options.getString('emojis');
  const contentFilter = {
    attachment: interaction.options.getBoolean('require_attachment') ?? false,
    videoLink: interaction.options.getBoolean('require_video_link') ?? false,
    xLink: interaction.options.getBoolean('require_x_link') ?? false,
  };
  const redirectBotId = interaction.options.getString('redirect_to_bot_id') ?? null;
  const redirectWindowSeconds = interaction.options.getInteger('redirect_window_seconds') ?? null;

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
    content: `✅ I'll now react with ${result.emojis.join(' ')} to ${describeFilter(result.contentFilter)} in ${channel} (including its threads).${redirectNote}`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

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
  const pairWithinSeconds = interaction.options.getInteger('react_to_second_of_pair_within') ?? null;

  let result;
  try {
    result = await autoresponderManager.setChannel(
      interaction.guild,
      channel,
      emojisInput,
      contentFilter,
      pairWithinSeconds,
      interaction.user.id
    );
  } catch (err) {
    if (err instanceof autoresponderManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const pairNote = result.pairWithinSeconds
    ? ` Only reacts to the **second** message of a pair posted less than **${result.pairWithinSeconds}s** apart (other bots' messages count too in this mode; solo messages get no reaction).`
    : '';

  await interaction.reply({
    content: `✅ I'll now react with ${result.emojis.join(' ')} to ${describeFilter(result.contentFilter)} in ${channel} (including its threads).${pairNote}`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

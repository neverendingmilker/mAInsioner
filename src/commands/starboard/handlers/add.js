const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const starboardManager = require('../../../features/starboard/starboardManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need the "Administrator" permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const name = interaction.options.getString('name');
  const watchChannelsInput = interaction.options.getString('watch_channel');
  const excludeChannelsInput = interaction.options.getString('exclude_channels') ?? undefined;
  const postChannel = interaction.options.getChannel('post_channel');
  const threshold = interaction.options.getInteger('threshold');
  const emojisInput = interaction.options.getString('emojis');
  const contentType = interaction.options.getString('content_type') ?? undefined;

  let result;
  try {
    result = await starboardManager.create(
      interaction.guild,
      name,
      watchChannelsInput,
      excludeChannelsInput,
      postChannel,
      threshold,
      emojisInput,
      contentType,
      interaction.user.id
    );
  } catch (err) {
    if (err instanceof starboardManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, flags: MessageFlags.Ephemeral });
      return;
    }
    throw err;
  }

  const watchChannelsList = result.watchAll
    ? `**every channel** (its own post channel is always excluded automatically${
        result.excludedChannels.length > 0 ? `, along with ${result.excludedChannels.map((c) => `${c}`).join(', ')}` : ''
      })`
    : result.watchChannels.map((c) => `${c}`).join(', ');
  await interaction.reply({
    content:
      `✅ Starboard **${result.name}** created: messages in ${watchChannelsList} with **${threshold}+** reactions ` +
      `(${starboardManager.formatEmojisForDisplay(result.emojis)}) get reposted to ${postChannel}. ` +
      `Content filter: **${starboardManager.CONTENT_TYPES[result.contentType]}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { handleAdd };

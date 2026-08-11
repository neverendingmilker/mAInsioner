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
  const watchChannel = interaction.options.getChannel('watch_channel');
  const postChannel = interaction.options.getChannel('post_channel');
  const threshold = interaction.options.getInteger('threshold');
  const emojisInput = interaction.options.getString('emojis');
  const contentType = interaction.options.getString('content_type') ?? undefined;

  let result;
  try {
    result = await starboardManager.create(
      interaction.guild,
      name,
      watchChannel,
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

  await interaction.reply({
    content:
      `✅ Starboard **${result.name}** created: messages in ${watchChannel} with **${threshold}+** reactions ` +
      `(${starboardManager.formatEmojisForDisplay(result.emojis)}) get reposted to ${postChannel}. ` +
      `Content filter: **${starboardManager.CONTENT_TYPES[result.contentType]}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { handleAdd };

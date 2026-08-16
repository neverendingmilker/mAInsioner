const { PermissionFlagsBits } = require('discord.js');
const honeypotManager = require('../../../features/honeypot/honeypotManager');

// Every option besides "channel" is optional — whatever isn't given keeps its current
// value instead of getting wiped out, since honeypotManager.editChannel itself expects
// full replacement values (that's fine for the dashboard's form, which always submits
// every field, but not for a slash command where people only want to tweak one thing).
async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const newChannel = interaction.options.getChannel('new_channel');
  const messageOpt = interaction.options.getString('message');
  const buttonLabelOpt = interaction.options.getString('button_label');
  const emojiOpt = interaction.options.getString('emoji');
  const removeEmoji = interaction.options.getBoolean('remove_emoji');

  if (emojiOpt && removeEmoji) {
    await interaction.reply({ content: "⚠️ Use either \"emoji\" or \"remove_emoji\", not both.", ephemeral: true });
    return;
  }

  const current = await honeypotManager.getChannelDetails(interaction.guild, channelId);
  if (!current) {
    await interaction.reply({ content: "⚠️ That channel isn't set up as a honeypot.", ephemeral: true });
    return;
  }

  const targetChannel = newChannel ?? interaction.guild.channels.cache.get(channelId);
  const messageText = messageOpt ?? current.messageText;
  const buttonLabel = buttonLabelOpt ?? current.buttonLabel;
  const emoji = removeEmoji ? null : emojiOpt ?? current.emoji;

  try {
    await honeypotManager.editChannel(interaction.guild, channelId, {
      targetChannel,
      messageText,
      buttonLabel,
      emoji,
      editedBy: interaction.user.id,
    });
  } catch (err) {
    if (err instanceof honeypotManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const moved = newChannel && newChannel.id !== channelId;
  await interaction.reply({
    content: moved ? `✅ Trap moved to ${targetChannel}.` : `✅ Trap in ${targetChannel} updated.`,
    ephemeral: true,
  });
}

module.exports = { handleEdit };

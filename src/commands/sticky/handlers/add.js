const { PermissionFlagsBits } = require('discord.js');
const stickyManager = require('../../../features/sticky/stickyManager');
const { parseDurationToSeconds, formatSeconds } = require('../../../utils/duration');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '⚠️ You need Administrator permission to set up a sticky message.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const content = interaction.options.getString('message');
  const delayInput = interaction.options.getString('delay');

  let delaySeconds = stickyManager.DEFAULT_REPOST_DELAY_SECONDS;
  if (delayInput) {
    try {
      delaySeconds = parseDurationToSeconds(delayInput);
    } catch (err) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
  }

  const botMember = interaction.guild.members.me;
  const canPost =
    botMember &&
    channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  if (!canPost) {
    await interaction.reply({
      content: `⚠️ I don't have permission to view/send messages in ${channel}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  await stickyManager.setSticky(channel, content, interaction.user.id, delaySeconds);

  await interaction.editReply({
    content: `✅ Sticky message set up in ${channel}. It'll wait **${formatSeconds(delaySeconds)}** after new activity before reposting at the bottom of the channel.`,
  });
}

module.exports = { handleAdd };

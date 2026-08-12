const { PermissionFlagsBits } = require('discord.js');
const stickyManager = require('../../../features/sticky/stickyManager');
const { parseDurationToSeconds, formatSeconds } = require('../../../utils/duration');

async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '⚠️ You need Administrator permission to edit a sticky message.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const content = interaction.options.getString('message');
  const delayInput = interaction.options.getString('delay');

  const existing = stickyManager.getStickyByChannel(channelId);
  if (!existing) {
    await interaction.reply({
      content: "⚠️ That channel doesn't have a sticky message yet — use `/sticky add` to set one up.",
      ephemeral: true,
    });
    return;
  }

  // Keep the current delay unless a new one was explicitly given.
  let delaySeconds = existing.repostDelaySeconds ?? stickyManager.DEFAULT_REPOST_DELAY_SECONDS;
  if (delayInput) {
    try {
      delaySeconds = parseDurationToSeconds(delayInput);
    } catch (err) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    await interaction.reply({ content: "⚠️ That channel doesn't seem to exist anymore.", ephemeral: true });
    return;
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
    content: `✅ Sticky message updated in ${channel} — reposted right away with the new text. Future reposts will wait **${formatSeconds(delaySeconds)}** after new activity.`,
  });
}

module.exports = { handleEdit };

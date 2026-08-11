const { PermissionFlagsBits } = require('discord.js');
const stickyManager = require('../../../features/sticky/stickyManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '⚠️ You need Administrator permission to set up a sticky message.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const content = interaction.options.getString('message');

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

  await stickyManager.setSticky(channel, content, interaction.user.id);

  await interaction.editReply({
    content: `✅ Sticky message set up in ${channel}. It will be reposted at the bottom of the channel after every new message.`,
  });
}

module.exports = { handleAdd };

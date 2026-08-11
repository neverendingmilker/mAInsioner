const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const stickyManager = require('../../features/sticky/stickyManager');

// Message context menu command: right-click a message -> Apps -> "Sticky: Add".
// Uses that message's own text as the new sticky for the channel it's in — same
// effect as /sticky add, just without having to retype the text.
const data = new ContextMenuCommandBuilder()
  .setName('Sticky: Add')
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this.', ephemeral: true });
    return;
  }

  const targetMessage = interaction.targetMessage;
  const content = targetMessage.content?.trim();

  if (!content) {
    await interaction.reply({
      content: "⚠️ That message doesn't have any text — only messages with text can be used as a sticky (attachments/embeds alone aren't supported).",
      ephemeral: true,
    });
    return;
  }
  if (content.length > 2000) {
    await interaction.reply({ content: '⚠️ That message is too long to use as a sticky (2000 characters max).', ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  const botMember = interaction.guild.members.me;
  const canPost =
    botMember && channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  if (!canPost) {
    await interaction.reply({ content: `⚠️ I don't have permission to view/send messages in ${channel}.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await stickyManager.setSticky(channel, content, interaction.user.id);
  await interaction.editReply({ content: `✅ This message's text is now stickied in ${channel}.` });
}

module.exports = { data, execute };

const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const stickyManager = require('../../features/sticky/stickyManager');

// Message context menu command: right-click ANY message in the channel -> Apps ->
// "Sticky: Remove". The specific message clicked doesn't matter — sticky is per-channel,
// not per-message — this is just a quick entry point to remove whatever sticky is
// currently configured for the channel the message is in.
const data = new ContextMenuCommandBuilder()
  .setName('Sticky: Remove')
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this.', ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  const existing = stickyManager.getStickyByChannel(channel.id);
  if (!existing) {
    await interaction.reply({ content: `⚠️ There's no sticky message configured in ${channel}.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await stickyManager.removeSticky(interaction.guild, channel.id);
  await interaction.editReply({ content: `✅ Sticky message removed from ${channel}.` });
}

module.exports = { data, execute };

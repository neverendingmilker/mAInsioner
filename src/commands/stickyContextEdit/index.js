const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const stickyManager = require('../../features/sticky/stickyManager');

// Message context menu command: right-click any message -> Apps -> "Sticky: Edit".
// The specific message clicked doesn't matter (sticky is per-channel), it's just the
// entry point. Opens a modal pre-filled with the current sticky text so it can be
// tweaked, since context menu commands can't take typed option input directly.
const data = new ContextMenuCommandBuilder()
  .setName('Sticky: Edit')
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
    await interaction.reply({
      content: `⚠️ There's no sticky message configured in ${channel} — use "Sticky: Add" or \`/sticky add\` to set one up first.`,
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder().setCustomId(`sticky:edit-modal:${channel.id}`).setTitle('Edit sticky message');

  const textInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('New sticky text')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(existing.content)
    .setMaxLength(4000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));

  await interaction.showModal(modal);
}

module.exports = { data, execute };

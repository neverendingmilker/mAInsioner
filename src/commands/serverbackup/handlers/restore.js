const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const serverBackupManager = require('../../../features/serverbackup/serverBackupManager');

const CONFIRM_TIMEOUT_MS = 60 * 1000;

function summarizeSection(section, singularNoun) {
  const parts = [];
  if (section.created.length > 0) parts.push(`${section.created.length} ${singularNoun}${section.created.length === 1 ? '' : 's'} created`);
  if (section.skipped > 0) parts.push(`${section.skipped} already there`);
  if (section.failed.length > 0) parts.push(`${section.failed.length} failed`);
  return parts.length > 0 ? parts.join(', ') : 'nothing to do';
}

// Runs the actual restore and formats the result. `responder` is whatever has an
// editReply usable for this point in the flow — the original interaction on the no-
// confirmation-needed fast path, or the button interaction once someone's confirmed.
async function runRestore(responder, guild, backupId, what, executedBy) {
  try {
    const summary = await serverBackupManager.restoreSnapshot(guild, backupId, executedBy, what);

    const source = summary.sourceGuildName ? ` from **${summary.sourceGuildName}**` : '';
    const lines = [
      `✅ Restored backup **#${backupId}**${summary.label ? ` (${summary.label})` : ''}${source} — only creates what's missing, never touches or deletes anything that already exists.`,
    ];
    if (summary.scope === 'roles' || summary.scope === 'all') {
      lines.push(`Roles: ${summarizeSection(summary.roles, 'role')}.`);
      const m = summary.members;
      if (m.updated.length + m.noChangeNeeded + m.notYetJoined + m.failed.length > 0) {
        const memberParts = [];
        if (m.updated.length > 0) memberParts.push(`${m.updated.length} member${m.updated.length === 1 ? '' : 's'} got roles back`);
        if (m.noChangeNeeded > 0) memberParts.push(`${m.noChangeNeeded} already had them`);
        if (m.notYetJoined > 0) memberParts.push(`${m.notYetJoined} not in this server yet`);
        if (m.failed.length > 0) memberParts.push(`${m.failed.length} failed`);
        lines.push(`Members: ${memberParts.join(', ')}.`);
      }
    }
    if (summary.scope === 'channels' || summary.scope === 'all') {
      lines.push(`Categories: ${summarizeSection(summary.categories, 'category')}.`);
      lines.push(`Channels: ${summarizeSection(summary.channels, 'channel')}.`);
    }
    if (summary.scope === 'assets' || summary.scope === 'all') {
      lines.push(`Emoji: ${summarizeSection(summary.emoji, 'emoji')}.`);
      lines.push(`Stickers: ${summarizeSection(summary.stickers, 'sticker')}.`);
      lines.push(`Soundboard: ${summarizeSection(summary.soundboard, 'sound')}.`);
    }

    if (summary.positionWarning) lines.push(`⚠️ ${summary.positionWarning}`);

    const failures = [
      ...summary.roles.failed,
      ...summary.members.failed,
      ...summary.categories.failed,
      ...summary.channels.failed,
      ...summary.emoji.failed,
      ...summary.stickers.failed,
      ...summary.soundboard.failed,
    ];
    if (failures.length > 0) {
      lines.push(`⚠️ Failed: ${failures.slice(0, 10).join('; ')}${failures.length > 10 ? `, +${failures.length - 10} more` : ''}`);
    }

    await responder.editReply({ content: lines.join('\n'), components: [] });
  } catch (err) {
    if (err instanceof serverBackupManager.ValidationError) {
      await responder.editReply({ content: `⚠️ ${err.message}`, components: [] });
      return;
    }
    throw err;
  }
}

async function handleRestore(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const backupId = interaction.options.getInteger('backup');
  const what = interaction.options.getString('what') ?? 'all';

  await interaction.deferReply({ ephemeral: true });

  let preview;
  try {
    preview = await serverBackupManager.previewRestore(interaction.guild, backupId, what);
  } catch (err) {
    if (err instanceof serverBackupManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
      return;
    }
    throw err;
  }

  if (preview.missingBots.length === 0) {
    await runRestore(interaction, interaction.guild, backupId, what, interaction.user.id);
    return;
  }

  const botList = preview.missingBots.map((name) => `• ${name}`).join('\n');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm').setLabel('Restore anyway').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    content:
      `⚠️ These apps/bots from backup **#${backupId}** aren't in this server yet:\n${botList}\n\n` +
      `Any channel permission set for them won't be restored (nothing breaks — that permission is just skipped). ` +
      `Invite them first for a full restore, or proceed anyway.`,
    components: [row],
  });

  const message = await interaction.fetchReply();
  let choice;
  try {
    choice = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: CONFIRM_TIMEOUT_MS,
    });
  } catch {
    await interaction.editReply({ content: '⌛ Restore confirmation timed out — run `/serverbackup restore` again if you still want to.', components: [] });
    return;
  }

  if (choice.customId === 'cancel') {
    await choice.update({ content: '❌ Restore cancelled.', components: [] });
    return;
  }

  await choice.update({ content: '⏳ Restoring…', components: [] });
  await runRestore(choice, interaction.guild, backupId, what, interaction.user.id);
}

module.exports = { handleRestore };

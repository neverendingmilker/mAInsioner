const { PermissionFlagsBits } = require('discord.js');
const serverBackupManager = require('../../../features/serverbackup/serverBackupManager');

function summarizeSection(section, singularNoun) {
  const parts = [];
  if (section.created.length > 0) parts.push(`${section.created.length} ${singularNoun}${section.created.length === 1 ? '' : 's'} created`);
  if (section.skipped > 0) parts.push(`${section.skipped} already there`);
  if (section.failed.length > 0) parts.push(`${section.failed.length} failed`);
  return parts.length > 0 ? parts.join(', ') : 'nothing to do';
}

async function handleRestore(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const backupId = interaction.options.getInteger('backup');

  await interaction.deferReply({ ephemeral: true });

  try {
    const summary = await serverBackupManager.restoreSnapshot(interaction.guild, backupId, interaction.user.id);

    const source = summary.sourceGuildName ? ` from **${summary.sourceGuildName}**` : '';
    const lines = [
      `✅ Restored backup **#${backupId}**${summary.label ? ` (${summary.label})` : ''}${source} — only creates what's missing, never touches or deletes anything that already exists.`,
      `Roles: ${summarizeSection(summary.roles, 'role')}.`,
      `Categories: ${summarizeSection(summary.categories, 'category')}.`,
      `Channels: ${summarizeSection(summary.channels, 'channel')}.`,
    ];

    if (summary.positionWarning) lines.push(`⚠️ ${summary.positionWarning}`);

    const failures = [...summary.roles.failed, ...summary.categories.failed, ...summary.channels.failed];
    if (failures.length > 0) {
      lines.push(`⚠️ Failed: ${failures.slice(0, 10).join('; ')}${failures.length > 10 ? `, +${failures.length - 10} more` : ''}`);
    }

    await interaction.editReply({ content: lines.join('\n') });
  } catch (err) {
    if (err instanceof serverBackupManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
      return;
    }
    throw err;
  }
}

module.exports = { handleRestore };

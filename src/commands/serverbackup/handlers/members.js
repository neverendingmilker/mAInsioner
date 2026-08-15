const { PermissionFlagsBits } = require('discord.js');
const serverBackupManager = require('../../../features/serverbackup/serverBackupManager');

async function handleMembers(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const backupId = interaction.options.getInteger('backup');

  await interaction.deferReply({ ephemeral: true });

  try {
    const summary = await serverBackupManager.syncMembers(interaction.guild, backupId, interaction.user.id);
    const m = summary.members;

    const source = summary.sourceGuildName ? ` from **${summary.sourceGuildName}**` : '';
    const parts = [];
    if (m.updated.length > 0) parts.push(`${m.updated.length} member${m.updated.length === 1 ? '' : 's'} got roles back`);
    if (m.noChangeNeeded > 0) parts.push(`${m.noChangeNeeded} already had them`);
    if (m.notYetJoined > 0) parts.push(`${m.notYetJoined} still not in this server`);
    if (m.failed.length > 0) parts.push(`${m.failed.length} failed`);

    const lines = [
      `✅ Synced member roles from backup **#${backupId}**${summary.label ? ` (${summary.label})` : ''}${source} — only adds roles, never removes any.`,
      parts.length > 0 ? parts.join(', ') + '.' : 'Nothing to do — everyone already has what this backup gives them.',
    ];

    if (m.failed.length > 0) {
      lines.push(`⚠️ Failed: ${m.failed.slice(0, 10).join('; ')}${m.failed.length > 10 ? `, +${m.failed.length - 10} more` : ''}`);
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

module.exports = { handleMembers };

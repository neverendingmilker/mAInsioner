const { PermissionFlagsBits } = require('discord.js');
const serverBackupManager = require('../../../features/serverbackup/serverBackupManager');

function describeCounts(result) {
  const parts = [];
  if (result.scope !== 'channels') parts.push(`${result.roleCount} roles (${result.memberCount} members' role assignments)`);
  if (result.scope !== 'roles') parts.push(`${result.categoryCount} categories, ${result.channelCount} other channels`);
  return parts.join(', ');
}

async function handleCreate(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const label = interaction.options.getString('label');
  const what = interaction.options.getString('what') ?? 'all';

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await serverBackupManager.createSnapshot(interaction.guild, label, interaction.user.id, what);
    await interaction.editReply({
      content:
        `✅ Backup **#${result.id}**${label ? ` (${label})` : ''} saved — ${describeCounts(result)}. Restorable on any server I'm in ` +
        `with \`/serverbackup restore\`. Doesn't include emoji, stickers, or soundboard sounds.`,
    });
  } catch (err) {
    if (err instanceof serverBackupManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
      return;
    }
    throw err;
  }
}

module.exports = { handleCreate };

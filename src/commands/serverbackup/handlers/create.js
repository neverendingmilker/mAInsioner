const { PermissionFlagsBits } = require('discord.js');
const serverBackupManager = require('../../../features/serverbackup/serverBackupManager');

async function handleCreate(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const label = interaction.options.getString('label');

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await serverBackupManager.createSnapshot(interaction.guild, label, interaction.user.id);
    await interaction.editReply({
      content:
        `✅ Backup **#${result.id}**${label ? ` (${label})` : ''} saved — ${result.roleCount} roles, ${result.categoryCount} ` +
        `categories, ${result.channelCount} other channels. Restorable on any server I'm in with \`/serverbackup restore\`. ` +
        `Doesn't include emoji, stickers, or soundboard sounds.`,
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

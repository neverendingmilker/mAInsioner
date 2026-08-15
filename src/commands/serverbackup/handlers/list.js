const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const serverBackupManager = require('../../../features/serverbackup/serverBackupManager');

const EMBED_COLOR = 0x5865f2;

async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const snapshots = await serverBackupManager.listSnapshots();

  if (snapshots.length === 0) {
    await interaction.reply({ content: '✅ No backups saved yet — make one with `/serverbackup create`.', ephemeral: true });
    return;
  }

  const lines = snapshots.map((s) => {
    const label = s.label ? ` — ${s.label}` : '';
    const source = s.sourceGuildName ? ` — from **${s.sourceGuildName}**` : '';
    return `**#${s.id}**${label}${source} — <t:${Math.floor(s.createdAt / 1000)}:R> by <@${s.createdBy}>`;
  });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Server backups')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${snapshots.length} backup${snapshots.length === 1 ? '' : 's'}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };

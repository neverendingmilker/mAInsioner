const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const starboardManager = require('../../../features/starboard/starboardManager');

const EMBED_COLOR = 0xffd166;

async function handleList(interaction) {
  if (
    !interaction.memberPermissions.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)
  ) {
    await interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

  const boards = await starboardManager.listAll(interaction.guildId);

  if (boards.length === 0) {
    await interaction.reply({ content: 'No starboards are currently configured in this server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = boards.map((b) => {
    const emojis = starboardManager.formatEmojisForDisplay(JSON.parse(b.emojis));
    const contentTypeLabel = starboardManager.CONTENT_TYPES[b.content_type] ?? b.content_type;
    return `**${b.name}** — <#${b.watch_channel_id}> → <#${b.post_channel_id}> · **${b.threshold}+** ${emojis} · ${contentTypeLabel}`;
  });

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Starboards').setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleList };

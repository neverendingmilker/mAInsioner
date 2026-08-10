const { EmbedBuilder } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');

const EMBED_COLOR = 0xf39c12;

async function handleList(interaction) {
  const triggers = await goosepizzaManager.listAll(interaction.guildId);

  if (triggers.length === 0) {
    await interaction.reply({ content: 'No GoosePizza triggers are currently configured in this server.', ephemeral: true });
    return;
  }

  const lines = triggers.map((t) => {
    const modeLabel = t.response_mode === 'reaction' ? 'React' : 'Comment';
    const statusLabel = t.enabled ? '' : ' · 🔴 disabled';
    const channelsLabel = t.channel_ids.length > 0 ? t.channel_ids.map((id) => `<#${id}>`).join(', ') : '*(no channels set)*';
    return `**${t.name}** — ${channelsLabel} · "${t.trigger_text}" → ${t.emoji} (${modeLabel})${statusLabel}`;
  });

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('GoosePizza triggers').setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };

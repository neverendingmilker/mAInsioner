const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const honeypotManager = require('../../../features/honeypot/honeypotManager');

const EMBED_COLOR = 0xed4245;
const RECENT_LIMIT = 10;

const TRIGGER_LABEL = {
  message: 'text',
  reaction: 'react',
  button: 'button',
};

async function handleLog(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const { total, recent } = await honeypotManager.getKickLog(interaction.guildId, RECENT_LIMIT);

  if (total === 0) {
    await interaction.reply({ content: "✅ Honeypot hasn't kicked anyone yet.", ephemeral: true });
    return;
  }

  const lines = recent.map((k) => {
    const who = k.userTag ? `${k.userTag} (${k.userId})` : k.userId;
    const reason = TRIGGER_LABEL[k.trigger] ?? k.trigger;
    return `**${who}** — ${reason} — <t:${Math.floor(k.kickedAt / 1000)}:R>`;
  });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Honeypot kick log')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Showing the ${recent.length} most recent of ${total} total kick${total === 1 ? '' : 's'}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleLog };

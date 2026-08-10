const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');
const sessions = require('../../../features/goosepizza/goosepizzaChannelSessions');

async function handleChannelSelect(interaction) {
  const session = sessions.consume(interaction.message.id);
  if (!session) {
    await interaction.update({ content: '⚠️ This picker has expired — run the command again.', components: [] });
    return;
  }

  await interaction.deferUpdate();

  const channels = (
    await Promise.all(interaction.values.map((id) => interaction.guild.channels.fetch(id).catch(() => null)))
  ).filter(Boolean);

  try {
    if (session.type === 'create') {
      const result = await goosepizzaManager.finalizeCreate(interaction.guild, session.pending, channels);
      await interaction.editReply({
        content:
          `✅ GoosePizza trigger **${result.name}** created: messages containing "${result.triggerText}" in ` +
          `${channels.map((c) => c.toString()).join(', ')} will get ${goosepizzaManager.RESPONSE_MODES[result.mode].toLowerCase()}, ` +
          `using ${result.emoji}.`,
        components: [],
      });
    } else {
      await goosepizzaManager.setChannels(interaction.guild, session.name, channels);
      await interaction.editReply({
        content: `✅ Trigger **${session.name}** now watches: ${channels.map((c) => c.toString()).join(', ')}.`,
        components: [],
      });
    }
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}`, components: [] });
      return;
    }
    console.error('[goosepizza] Error finalizing channel selection:', err);
    await interaction.editReply({ content: `⚠️ Something went wrong: ${err.message}`, components: [] }).catch(() => null);
  }
}

module.exports = { handleChannelSelect };

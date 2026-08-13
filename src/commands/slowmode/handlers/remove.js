const slowModeManager = require('../../../features/slowmode/slowModeManager');
const { isMod } = require('../../../utils/modRole');

async function handleRemove(interaction) {
  if (!isMod(interaction.member)) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const removedCount = await slowModeManager.removeLimit(interaction.guildId, channelId);

  if (removedCount === 0) {
    await interaction.reply({ content: "⚠️ That channel doesn't have a slowmode configured.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Slowmode removed from <#${channelId}>.`, ephemeral: true });
}

module.exports = { handleRemove };

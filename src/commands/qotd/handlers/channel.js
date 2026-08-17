const qotdManager = require('../../../features/qotd/qotdManager');
const { isMod } = require('../../../utils/modRole');

async function handleChannel(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  try {
    await qotdManager.setChannel(interaction.guild, channel);
  } catch (err) {
    if (err instanceof qotdManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: `✅ Questions will now post in ${channel}.`, ephemeral: true });
}

module.exports = { handleChannel };

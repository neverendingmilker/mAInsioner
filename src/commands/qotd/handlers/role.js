const qotdManager = require('../../../features/qotd/qotdManager');
const { isMod } = require('../../../utils/modRole');

async function handleRole(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  // Omitting the option clears the ping entirely — same "optional, absence means none"
  // convention as /birthday config's optional fields.
  const role = interaction.options.getRole('role');
  await qotdManager.setRole(interaction.guildId, role);

  await interaction.reply({
    content: role ? `✅ ${role} will be pinged when a new question posts.` : '✅ Ping cleared — questions will post without mentioning a role.',
    ephemeral: true,
  });
}

module.exports = { handleRole };

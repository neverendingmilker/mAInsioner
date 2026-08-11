const warningManager = require('../../../features/warning/warningManager');

async function handleGive(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const roleId = interaction.options.getString('role');
  const dateInput = interaction.options.getString('date') ?? undefined;

  let result;
  try {
    result = await warningManager.giveWarning(interaction.guild, targetUser, reason, roleId, interaction.user.id, dateInput);
  } catch (err) {
    if (err instanceof warningManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content: `✅ Warned ${targetUser} and assigned ${result.role}. It's now logged in the warnings list.`,
    ephemeral: true,
  });
}

module.exports = { handleGive };

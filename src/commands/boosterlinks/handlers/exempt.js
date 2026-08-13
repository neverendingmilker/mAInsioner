const boosterLinkManager = require('../../../features/boosterlinks/boosterLinkManager');
const { isMod } = require('../../../utils/modRole');

async function handleExemptAdd(interaction) {
  if (!isMod(interaction.member)) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role');
  await boosterLinkManager.addExemptRole(interaction.guildId, role.id, interaction.user.id);
  await interaction.reply({
    content: `✅ Members with ${role} are now exempt from the booster-link auto-removal, regardless of boost status.`,
    ephemeral: true,
  });
}

async function handleExemptRemove(interaction) {
  if (!isMod(interaction.member)) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role');
  const removed = await boosterLinkManager.removeExemptRole(interaction.guildId, role.id);
  if (removed === 0) {
    await interaction.reply({ content: `${role} wasn't in the exempt list.`, ephemeral: true });
    return;
  }
  await interaction.reply({ content: `✅ ${role} is no longer exempt.`, ephemeral: true });
}

async function handleExemptList(interaction) {
  if (!isMod(interaction.member)) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const roleIds = await boosterLinkManager.listExemptRoles(interaction.guildId);
  if (roleIds.length === 0) {
    await interaction.reply({ content: 'No exempt roles configured — everyone is subject to the auto-removal.', ephemeral: true });
    return;
  }
  const lines = roleIds.map((id) => `<@&${id}>`).join('\n');
  await interaction.reply({
    content: `Members with **any** of these roles are exempt from the booster-link auto-removal:\n${lines}`,
    ephemeral: true,
  });
}

module.exports = { handleExemptAdd, handleExemptRemove, handleExemptList };

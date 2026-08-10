// Every feature's own "disable" subcommand is functionally identical: an admin-gated
// boolean toggle that reads/writes the exact same enabled state /disablefeature also
// controls (both call the same manager.setEnabled). This factors out that boilerplate
// so each command only needs to say which manager/permission/label to use.

function buildDisableSubcommand() {
  return (sub) =>
    sub
      .setName('disable')
      .setDescription('[Admin] Enable or disable this feature for this server')
      .addBooleanOption((opt) => opt.setName('enabled').setDescription('False to disable, true to re-enable').setRequired(true));
}

function createDisableHandler(manager, permissionFlag, featureLabel) {
  return async function handleDisable(interaction) {
    if (!interaction.memberPermissions.has(permissionFlag)) {
      await interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
      return;
    }

    const enabled = interaction.options.getBoolean('enabled');
    await manager.setEnabled(interaction.guildId, enabled);

    await interaction.reply({
      content: enabled ? `✅ ${featureLabel} is now enabled.` : `✅ ${featureLabel} is now disabled.`,
      ephemeral: true,
    });
  };
}

module.exports = { buildDisableSubcommand, createDisableHandler };

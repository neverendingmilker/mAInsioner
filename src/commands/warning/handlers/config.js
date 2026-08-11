const { PermissionFlagsBits } = require('discord.js');
const warningManager = require('../../../features/warning/warningManager');

// Merges the old /warning roles and /warning channel subcommands into one: role_1 and
// role_2 must be provided together (they're a pair), channel is independent — provide
// either or both in a single call.
async function handleConfig(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const role1 = interaction.options.getRole('role_1');
  const role2 = interaction.options.getRole('role_2');
  const channel = interaction.options.getChannel('channel');

  if (!role1 && !role2 && !channel) {
    await interaction.reply({
      content: '⚠️ Provide at least one setting to change (`role_1` + `role_2`, and/or `channel`).',
      ephemeral: true,
    });
    return;
  }
  if ((role1 && !role2) || (!role1 && role2)) {
    await interaction.reply({ content: '⚠️ `role_1` and `role_2` must be set together.', ephemeral: true });
    return;
  }

  const messages = [];

  if (role1 && role2) {
    try {
      await warningManager.setRoles(interaction.guild, role1, role2);
      messages.push(`✅ \`/warn\` will now escalate between ${role1} and ${role2}.`);
    } catch (err) {
      if (err instanceof warningManager.ValidationError) {
        messages.push(`⚠️ ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  if (channel) {
    try {
      await warningManager.setChannel(interaction.guild, channel);
      messages.push(`✅ The warnings list will be kept updated in ${channel}.`);
    } catch (err) {
      if (err instanceof warningManager.ValidationError) {
        messages.push(`⚠️ ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  await interaction.reply({ content: messages.join('\n'), ephemeral: true });
}

module.exports = { handleConfig };

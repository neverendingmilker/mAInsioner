const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const verifyManager = require('../../../features/verify/verifyManager');

// /verify edit user:<@user> — finds that user's most recent verification report
// (regardless of type) and lets the admin pick which field to change.
async function handleEdit(interaction) {
  const config = await verifyManager.getGuildConfig(interaction.guildId);

  if (!(await verifyManager.canUseVerifyCommands(interaction.member, config))) {
    await interaction.reply({
      content:
        '❌ You need the "Manage Roles" permission, or the role configured via `/verify config allowedrole`, to use this command.',
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser('user');
  const report = await verifyManager.getLastReportForUser(interaction.guildId, targetUser.id);

  if (!report) {
    await interaction.reply({
      content: `⚠️ No verification report found for ${targetUser}.`,
      ephemeral: true,
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`vfedit:select:${report.id}`)
    .setPlaceholder('What do you want to edit?')
    .addOptions(
      { label: 'Verification', description: 'Edit the "Verification" field', value: 'verification' },
      { label: 'Social', description: 'Edit the "Social" field', value: 'social' }
    );

  await interaction.reply({
    content: `What do you want to edit for ${targetUser}'s ${verifyManager.TYPE_LABELS[report.type]} verification report?`,
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

module.exports = { handleEdit };

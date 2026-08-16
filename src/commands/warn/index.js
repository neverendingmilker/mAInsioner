const { SlashCommandBuilder } = require('discord.js');
const warningManager = require('../../features/warning/warningManager');
const { isMod } = require('../../utils/modRole');

const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('[Mod] Warn a user — automatically escalates through the two configured roles')
  .addStringOption((opt) =>
    opt.setName('user_id').setDescription('The user\'s ID (works even if they already left the server)').setRequired(true)
  )
  .addStringOption((opt) => opt.setName('reason').setDescription('Why').setRequired(true).setMaxLength(300))
  .addStringOption((opt) =>
    opt
      .setName('date')
      .setDescription('Backdate it: DD/MM/YY or DD/MM/YYYY (default: today). Date only, no time.')
      .setRequired(false)
  );

async function execute(interaction) {
  if (!(await warningManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Warnings feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const userId = interaction.options.getString('user_id').trim();
  const reason = interaction.options.getString('reason');
  const dateInput = interaction.options.getString('date') ?? undefined;

  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.reply({ content: '⚠️ That doesn\'t look like a valid user ID (right-click a user → "Copy User ID").', ephemeral: true });
    return;
  }

  let result;
  try {
    result = await warningManager.warnUser(interaction.guild, userId, reason, interaction.user.id, dateInput);
  } catch (err) {
    if (err instanceof warningManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const mention = `<@${userId}>`;

  if (result.outcome === 'assigned') {
    await interaction.reply({
      content: `✅ Warned ${mention} and assigned ${result.assignedRole}. It's now logged in the warnings list.`,
      ephemeral: true,
    });
    return;
  }

  if (result.outcome === 'notInServer') {
    await interaction.reply({
      content: `✅ Logged a warning for ${mention}, but they're not currently in the server — no role could be checked or assigned.`,
      ephemeral: true,
    });
    return;
  }

  // outcome === 'alreadyMaxed'
  await interaction.reply({
    content:
      `✅ Logged another warning for ${mention} — but they **already have the highest warning role**. ` +
      `No further role was assigned. **The team should discuss in chat whether to ban this user.**`,
    ephemeral: true,
  });
}

module.exports = { data, execute };

const { SlashCommandBuilder } = require('discord.js');
const warningManager = require('../../features/warning/warningManager');
const { isMod } = require('../../utils/modRole');

const data = new SlashCommandBuilder()
  .setName('verbal')
  .setDescription('Logs a verbal warning for a user (no role assigned)')
  .addUserOption((opt) => opt.setName('user').setDescription('Who to warn').setRequired(true))
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
  if (!isMod(interaction.member)) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const dateInput = interaction.options.getString('date') ?? undefined;

  try {
    await warningManager.giveVerbal(interaction.guild, targetUser.id, reason, interaction.user.id, dateInput);
  } catch (err) {
    if (err instanceof warningManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: `✅ Logged a verbal warning for ${targetUser}.`, ephemeral: true });
}

module.exports = { data, execute };

const { PermissionFlagsBits } = require('discord.js');
const incidentManager = require('../../../features/incident/incidentManager');

async function handleSet(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const number = interaction.options.getInteger('number');

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await incidentManager.setCount(interaction.client, interaction.guildId, number);
    if (result.posted) {
      await interaction.editReply({ content: `✅ Counter set to **${number}**. Sign updated!` });
    } else {
      await interaction.editReply({
        content: `✅ Counter set to **${number}**, but the sign couldn't be posted (${result.reason}). Configure the channel with \`/incident channel\` first.`,
      });
    }
  } catch (err) {
    if (err instanceof incidentManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
      return;
    }
    throw err;
  }
}

module.exports = { handleSet };

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleLeaderboard } = require('./handlers/leaderboard');
const { handleUser } = require('./handlers/user');
const inviteTrackerManager = require('../../features/invitetracker/inviteTrackerManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(inviteTrackerManager, PermissionFlagsBits.Administrator, 'Invite Tracker');

const data = new SlashCommandBuilder()
  .setName('invites')
  .setDescription('Tracks who invited who, and how many people each inviter brought into the server')
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Shows the top inviters in this server'))
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription('Shows how many people a specific user invited (defaults to you)')
      .addUserOption((opt) => opt.setName('user').setDescription('Whose invite stats to check').setRequired(false))
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  switch (sub) {
    case 'leaderboard':
      return handleLeaderboard(interaction);
    case 'user':
      return handleUser(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

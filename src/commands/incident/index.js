const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleChannelSet } = require('./handlers/channel');
const { handleSetNumber } = require('./handlers/setnumber');
const { handleReset } = require('./handlers/reset');
const incidentManager = require('../../features/incident/incidentManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(incidentManager, PermissionFlagsBits.Administrator, 'Incident Counter');

const data = new SlashCommandBuilder()
  .setName('incident')
  .setDescription('"Days since last incident" sign, kept auto-updated in a channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('Sets the channel where the sign is posted and kept updated')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Channel where the sign will be posted').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('setnumber')
      .setDescription('Manually sets the counter to a specific number')
      .addIntegerOption((opt) =>
        opt.setName('numero').setDescription('New value for the counter').setRequired(true).setMinValue(0)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('reset').setDescription('Resets the counter to 0 (use it when an incident just happened)')
  )
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  switch (interaction.options.getSubcommand()) {
    case 'channel':
      return handleChannelSet(interaction);
    case 'setnumber':
      return handleSetNumber(interaction);
    case 'reset':
      return handleReset(interaction);
    case 'disable':
      return handleDisable(interaction);
    default:
      return undefined;
  }
}

module.exports = { data, execute };

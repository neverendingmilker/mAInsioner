const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const autoresponderManager = require('../../features/autoresponder/autoresponderManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(autoresponderManager, PermissionFlagsBits.Administrator, 'Autoresponder');

const AUTORESPONDER_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

const data = new SlashCommandBuilder()
  .setName('autoresponder')
  .setDescription('Auto-reacts with one or more emojis to every message in a channel')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set (or replace) the autoresponder for a channel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel').addChannelTypes(...AUTORESPONDER_CHANNEL_TYPES).setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('emojis')
          .setDescription('One or more emojis to react with, separated by spaces or commas (e.g. "🍕 🔥")')
          .setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('require_attachment')
          .setDescription('Only react if the message has an image/gif/video attachment (default: off, reacts to everything)')
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('require_video_link')
          .setDescription('Only react if the message links a video (e.g. YouTube) — combinable with the other filters')
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('require_x_link')
          .setDescription('Only react if the message links an X/Twitter post (incl. fxtwitter/vxtwitter/fixvx variants)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes the autoresponder from a channel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel').addChannelTypes(...AUTORESPONDER_CHANNEL_TYPES).setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Admin] Lists every channel with an autoresponder configured'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await autoresponderManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Autoresponder feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

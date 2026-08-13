const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleEdit } = require('./handlers/edit');
const { handleList } = require('./handlers/list');
const autoresponderManager = require('../../features/autoresponder/autoresponderManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(autoresponderManager, PermissionFlagsBits.Administrator, 'Autoresponder');

const AUTORESPONDER_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

const data = new SlashCommandBuilder()
  .setName('autoresponder')
  .setDescription("Auto-reacts with one or more emojis to a channel's messages (including its threads)")
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
      .addStringOption((opt) =>
        opt
          .setName('redirect_to_bot_id')
          .setDescription('Exception: if this bot posts within the window below, react to IT instead of the original poster')
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('redirect_window_seconds')
          .setDescription('How long to wait for redirect_to_bot_id before falling back to the original message')
          .setMinValue(1)
          .setMaxValue(autoresponderManager.MAX_REDIRECT_WINDOW_SECONDS)
          .setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Change the autoresponder settings for a channel')
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which autoresponder to edit (start typing to see configured ones)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('emojis')
          .setDescription('New emoji list, replaces the old one entirely (space/comma separated, optional)')
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('require_attachment')
          .setDescription('Only react if the message has an image/gif/video attachment (optional)')
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('require_video_link')
          .setDescription('Only react if the message links a video (e.g. YouTube) (optional)')
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('require_x_link')
          .setDescription('Only react if the message links an X/Twitter post (optional)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('redirect_to_bot_id')
          .setDescription('New redirect bot ID (optional)')
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('redirect_window_seconds')
          .setDescription('New redirect window in seconds (optional)')
          .setMinValue(1)
          .setMaxValue(autoresponderManager.MAX_REDIRECT_WINDOW_SECONDS)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Admin] Lists every channel with an autoresponder configured'))
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes the autoresponder from a channel')
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which autoresponder to remove (start typing to see configured ones)')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

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
    case 'edit':
      return handleEdit(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "channel" option's autocomplete on /autoresponder edit and remove: only
// shows channels that currently have an autoresponder configured, with a short preview,
// instead of every channel in the server.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'channel') {
    await interaction.respond([]);
    return;
  }

  const channels = await autoresponderManager.listChannels(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = channels
    .map((c) => {
      const channel = interaction.guild.channels.cache.get(c.channelId);
      const label = channel ? `#${channel.name}` : c.channelId;
      return { name: `${label} — ${c.emojis.join(' ')}`, value: c.channelId };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleEdit } = require('./handlers/edit');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const stickyManager = require('../../features/sticky/stickyManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(stickyManager, PermissionFlagsBits.Administrator, 'Sticky Messages');

const STICKY_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Sticky message management')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set up (or replace) the sticky message for a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to add the sticky message to')
          .addChannelTypes(...STICKY_CHANNEL_TYPES)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('The message content to stick')
          .setMaxLength(4000)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription("[Admin] Edit an existing channel's sticky message text")
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which sticky to edit (start typing to see active ones)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('The new message content')
          .setMaxLength(4000)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Remove the sticky message from a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to remove the sticky message from')
          .addChannelTypes(...STICKY_CHANNEL_TYPES)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Show all sticky messages configured in this server'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!stickyManager.isEnabled(interaction.guildId)) {
    await interaction.reply({
      content: '⚠️ The sticky message feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "channel" option's autocomplete on /sticky edit: only shows channels that
// currently have an active sticky, with a short content preview, instead of every
// channel in the server.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'channel') {
    await interaction.respond([]);
    return;
  }

  const stickies = stickyManager.listByGuild(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = stickies
    .map((s) => {
      const channel = interaction.guild.channels.cache.get(s.channelId);
      const label = channel ? `#${channel.name}` : s.channelId;
      const preview = s.content.length > 40 ? `${s.content.slice(0, 40)}…` : s.content;
      return { name: `${label} — ${preview}`, value: s.channelId };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

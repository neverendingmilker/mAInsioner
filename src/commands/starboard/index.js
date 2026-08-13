const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleEdit } = require('./handlers/edit');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const { handleLookback } = require('./handlers/lookback');
const starboardManager = require('../../features/starboard/starboardManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(starboardManager, PermissionFlagsBits.Administrator, 'Starboard');

const STARBOARD_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

const CONTENT_TYPE_CHOICES = Object.entries(starboardManager.CONTENT_TYPES).map(([value, name]) => ({ name, value }));

const data = new SlashCommandBuilder()
  .setName('starboard')
  .setDescription('Reposts messages that get enough reactions to a dedicated channel')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set up a new starboard')
      .addStringOption((opt) => opt.setName('name').setDescription('A short name for this starboard (e.g. "main")').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('watch_channel')
          .setDescription('Channel(s)/categories to watch, comma-separated, or "all" for everything except exclude_channels')
          .setRequired(true)
      )
      .addChannelOption((opt) =>
        opt
          .setName('post_channel')
          .setDescription('Channel where starred messages get reposted')
          .addChannelTypes(...STARBOARD_CHANNEL_TYPES)
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('threshold')
          .setDescription('Minimum number of (distinct users) reactions needed')
          .setMinValue(1)
          .setMaxValue(1000)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('emojis')
          .setDescription('Emoji(s) to count, space/comma separated (e.g. "⭐" or "⭐ 🔥"), or "any" for any emoji')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('content_type')
          .setDescription('Restrict to a kind of message (default: any)')
          .addChoices(...CONTENT_TYPE_CHOICES)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('exclude_channels')
          .setDescription('Only used when watch_channel is "all": channel(s)/categories to leave out, comma-separated')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Edit an existing starboard')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which starboard to edit').setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('watch_channel')
          .setDescription('New channel(s)/categories to watch, comma-separated, or "all" (replaces the current set)')
          .setRequired(false)
      )
      .addChannelOption((opt) =>
        opt
          .setName('post_channel')
          .setDescription('New channel where starred messages get reposted')
          .addChannelTypes(...STARBOARD_CHANNEL_TYPES)
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt.setName('threshold').setDescription('New minimum reaction count').setMinValue(1).setMaxValue(1000).setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('emojis')
          .setDescription('New emoji list, replaces the old one entirely (space/comma separated, or "any")')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('content_type')
          .setDescription('New message-type restriction')
          .addChoices(...CONTENT_TYPE_CHOICES)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('exclude_channels')
          .setDescription('Only used when watch_channel is "all": channel(s)/categories to leave out, comma-separated')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Delete a starboard')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which starboard to remove').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Lists every starboard configured in this server'))
  .addSubcommand((sub) =>
    sub
      .setName('lookback')
      .setDescription("[Admin] Scan recent messages in a starboard's channel(s) for ones that already qualify")
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which starboard to scan').setRequired(true).setAutocomplete(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('limit')
          .setDescription(`Messages to scan per channel (default ${starboardManager.LOOKBACK_DEFAULT_LIMIT}, ignored with since_year_start/since_date)`)
          .setMinValue(1)
          .setMaxValue(starboardManager.LOOKBACK_MAX_LIMIT)
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('since_year_start')
          .setDescription("Scan back to January 1st of this year (can't be combined with since_date)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('since_date')
          .setDescription("Scan back to a specific date, DD/MM/YY or DD/MM/YYYY (can't be combined with since_year_start)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('until_date')
          .setDescription('Stop the scan at a specific date, DD/MM/YY or DD/MM/YYYY (inclusive of that whole day)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('content_type')
          .setDescription("Only check this kind of message for this scan (default: the starboard's own filter)")
          .addChoices(...CONTENT_TYPE_CHOICES)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt.setName('emojis').setDescription("Only count these emoji(s) for this scan (default: the starboard's own)").setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('threshold')
          .setDescription("Use a different minimum vote count for this scan (default: the starboard's own)")
          .setMinValue(1)
          .setMaxValue(1000)
          .setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  // Lookback defers (acks) the interaction itself, as the very first thing it does —
  // so the enabled-feature check below must happen AFTER that, not before, or a slow
  // DB round-trip here could eat into Discord's 3-second ack window. Disable must work
  // even while the feature is disabled, otherwise there'd be no way to re-enable it.
  if (subcommand === 'lookback') {
    return handleLookback(interaction);
  }
  if (subcommand === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await starboardManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Starboard feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  switch (subcommand) {
    case 'add':
      return handleAdd(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
  }
}

// Powers the "name" option's autocomplete on /starboard edit, remove and lookback.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'name') {
    await interaction.respond([]);
    return;
  }

  const names = await starboardManager.getNamesList(interaction.guildId);
  const query = focused.value.toLowerCase();

  const filtered = names.filter((n) => n.toLowerCase().includes(query)).slice(0, 25);

  await interaction.respond(filtered.map((n) => ({ name: n, value: n })));
}

module.exports = { data, execute, autocomplete };

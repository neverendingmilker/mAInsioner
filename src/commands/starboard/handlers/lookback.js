const {
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const starboardManager = require('../../../features/starboard/starboardManager');
const lookbackSessions = require('../../../features/starboard/lookbackSessions');

const PICKER_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

async function handleLookback(interaction) {
  // Ack the interaction FIRST, before any DB/Discord work below. Discord only gives 3
  // seconds for the initial acknowledgment — if a slow database round-trip (e.g. a cold
  // start) happened before this, the interaction token could already be dead by the time
  // we tried to defer, and every lookback would fail with a generic "an error occurred".
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({ content: '❌ You need the "Administrator" permission to use this command.' });
    return;
  }
  if (!(await starboardManager.isEnabled(interaction.guildId))) {
    await interaction.editReply({
      content: '⚠️ The Starboard feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
    });
    return;
  }

  const name = interaction.options.getString('name');
  const existingNames = await starboardManager.getNamesList(interaction.guildId);
  if (!existingNames.includes(name)) {
    await interaction.editReply({ content: `⚠️ No starboard named "${name}" found in this server.` });
    return;
  }

  // Everything besides the channel(s) to scan is known already — stash it, then let the
  // person pick which channel(s) via a proper searchable list of the server's channels
  // (a native Discord select menu), instead of guessing channel names into text options.
  const options = {
    name,
    limit: interaction.options.getInteger('limit') ?? starboardManager.LOOKBACK_DEFAULT_LIMIT,
    sinceYearStart: interaction.options.getBoolean('since_year_start') ?? false,
    sinceDateInput: interaction.options.getString('since_date') ?? undefined,
    untilDateInput: interaction.options.getString('until_date') ?? undefined,
    contentType: interaction.options.getString('content_type') ?? undefined,
    emojisInput: interaction.options.getString('emojis') ?? undefined,
    threshold: interaction.options.getInteger('threshold') ?? undefined,
    topN: interaction.options.getInteger('top') ?? undefined,
  };

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('starboard:lookback:channels')
    .setPlaceholder(`Optionally pick up to ${starboardManager.MAX_LOOKBACK_CHANNELS - 1} extra channels to also scan`)
    .addChannelTypes(...PICKER_CHANNEL_TYPES)
    .setMinValues(0)
    .setMaxValues(starboardManager.MAX_LOOKBACK_CHANNELS - 1);

  const runButton = new ButtonBuilder()
    .setCustomId('starboard:lookback:run')
    .setLabel("Run now (just this starboard's own channel)")
    .setStyle(ButtonStyle.Primary);

  const sent = await interaction.editReply({
    content:
      `Starboard **${name}**'s own watch channel is always scanned. Want to also scan other channels? ` +
      'Pick them from the list below, or just run it now with the default channel only.',
    components: [new ActionRowBuilder().addComponents(channelSelect), new ActionRowBuilder().addComponents(runButton)],
  });

  lookbackSessions.create(sent.id, options);
}

module.exports = { handleLookback };

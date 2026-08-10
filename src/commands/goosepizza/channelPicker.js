const { ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const goosepizzaManager = require('../../features/goosepizza/goosepizzaManager');

const TRIGGER_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

// Builds the channel-select row used by both /goosepizza create (picking channels for a
// brand new trigger) and /goosepizza channels (replacing an existing trigger's list).
function buildChannelPickerRow(customId, defaultChannelIds) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(`Pick 1-${goosepizzaManager.MAX_CHANNELS_PER_TRIGGER} channels`)
    .addChannelTypes(...TRIGGER_CHANNEL_TYPES)
    .setMinValues(1)
    .setMaxValues(goosepizzaManager.MAX_CHANNELS_PER_TRIGGER);

  if (defaultChannelIds?.length) {
    menu.setDefaultChannels(defaultChannelIds.slice(0, goosepizzaManager.MAX_CHANNELS_PER_TRIGGER));
  }

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = { TRIGGER_CHANNEL_TYPES, buildChannelPickerRow };

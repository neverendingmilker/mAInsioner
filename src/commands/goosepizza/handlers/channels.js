const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');
const sessions = require('../../../features/goosepizza/goosepizzaChannelSessions');
const { buildChannelPickerRow } = require('../channelPicker');

async function handleChannels(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '❌ You need the "Manage Server" permission to use this command.', ephemeral: true });
    return;
  }

  const name = interaction.options.getString('name');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let currentChannelIds;
  try {
    currentChannelIds = await goosepizzaManager.getChannelIdsForTrigger(interaction.guildId, name);
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
      return;
    }
    throw err;
  }

  const row = buildChannelPickerRow('goosepizza:edit:channels', currentChannelIds);
  const sent = await interaction.editReply({
    content: `Pick the channel(s) trigger **${name}** should watch — this replaces its current list entirely:`,
    components: [row],
  });

  sessions.create(sent.id, { type: 'edit', name });
}

module.exports = { handleChannels };

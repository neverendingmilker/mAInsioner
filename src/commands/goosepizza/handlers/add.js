const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const goosepizzaManager = require('../../../features/goosepizza/goosepizzaManager');
const sessions = require('../../../features/goosepizza/goosepizzaChannelSessions');
const { buildChannelPickerRow } = require('../channelPicker');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const name = interaction.options.getString('name');
  const triggerText = interaction.options.getString('trigger');
  const emoji = interaction.options.getString('emoji');
  const mode = interaction.options.getString('mode');

  let pending;
  try {
    pending = await goosepizzaManager.validateNewTrigger(interaction.guildId, name, triggerText, emoji, mode);
  } catch (err) {
    if (err instanceof goosepizzaManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }
  pending.createdBy = interaction.user.id;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const row = buildChannelPickerRow('goosepizza:create:channels');
  const sent = await interaction.editReply({
    content: `Pick which channel(s) trigger **${pending.name}** should watch:`,
    components: [row],
  });

  sessions.create(sent.id, { type: 'create', pending });
}

module.exports = { handleAdd };

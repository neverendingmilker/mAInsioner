const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleChannel } = require('./handlers/channel');
const { handleEmoji } = require('./handlers/emoji');
const { handleTrigger } = require('./handlers/trigger');
const goosepizzaManager = require('../../features/goosepizza/goosepizzaManager');

const data = new SlashCommandBuilder()
  .setName('goosepizza')
  .setDescription('Configures the automatic "pizza" emoji responder')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('[Admin] Set the channel to watch for the trigger text')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('The channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('emoji')
      .setDescription('[Admin] Set which emoji gets posted (default: 🍕 pizza01)')
      .addStringOption((opt) => opt.setName('emoji').setDescription('A unicode emoji or a custom server emoji').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('trigger')
      .setDescription('[Admin] Set the text that triggers the response (default: "pizza")')
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Any message containing this text (case-insensitive) will trigger it').setRequired(true)
      )
  );

async function execute(interaction) {
  if (!(await goosepizzaManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ GoosePizza is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'channel':
      return handleChannel(interaction);
    case 'emoji':
      return handleEmoji(interaction);
    case 'trigger':
      return handleTrigger(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

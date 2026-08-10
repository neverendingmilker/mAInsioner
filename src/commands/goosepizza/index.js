const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleChannel } = require('./handlers/channel');
const { handleEmoji } = require('./handlers/emoji');
const { handleTrigger } = require('./handlers/trigger');
const { handleMode } = require('./handlers/mode');
const { handleToggle } = require('./handlers/toggle');
const goosepizzaManager = require('../../features/goosepizza/goosepizzaManager');

const MODE_CHOICES = Object.entries(goosepizzaManager.RESPONSE_MODES).map(([value, name]) => ({ name, value }));

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
  )
  .addSubcommand((sub) =>
    sub
      .setName('mode')
      .setDescription('[Admin] Choose how the bot responds: post a comment, or react on the message')
      .addStringOption((opt) =>
        opt.setName('mode').setDescription('Comment or React').setRequired(true).addChoices(...MODE_CHOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('toggle')
      .setDescription('[Admin] Enable or disable GoosePizza for this server')
      .addBooleanOption((opt) => opt.setName('enabled').setDescription('On or off').setRequired(true))
  );

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  // Toggle must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (subcommand === 'toggle') {
    return handleToggle(interaction);
  }

  if (!(await goosepizzaManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ GoosePizza is currently disabled in this server. Use `/goosepizza toggle enabled:true` to turn it back on.',
      ephemeral: true,
    });
    return;
  }

  switch (subcommand) {
    case 'channel':
      return handleChannel(interaction);
    case 'emoji':
      return handleEmoji(interaction);
    case 'trigger':
      return handleTrigger(interaction);
    case 'mode':
      return handleMode(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

module.exports = { data, execute };

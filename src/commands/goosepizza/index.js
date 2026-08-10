const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleCreate } = require('./handlers/create');
const { handleEdit } = require('./handlers/edit');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const { handleToggle } = require('./handlers/toggle');
const goosepizzaManager = require('../../features/goosepizza/goosepizzaManager');

const TRIGGER_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
];

const MODE_CHOICES = Object.entries(goosepizzaManager.RESPONSE_MODES).map(([value, name]) => ({ name, value }));

const data = new SlashCommandBuilder()
  .setName('goosepizza')
  .setDescription('A passive emoji responder: several independent word/channel/emoji combos')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('[Admin] Set up a new trigger')
      .addStringOption((opt) => opt.setName('name').setDescription('A short name for this trigger (e.g. "pizza")').setRequired(true))
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Channel to watch').addChannelTypes(...TRIGGER_CHANNEL_TYPES).setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('trigger').setDescription('Text that triggers it (case-insensitive, anywhere in the message)').setRequired(true)
      )
      .addStringOption((opt) => opt.setName('emoji').setDescription('Unicode or custom server emoji to respond with').setRequired(true))
      .addStringOption((opt) =>
        opt.setName('mode').setDescription('Comment (new message) or React (reacts on the message)').setRequired(true).addChoices(...MODE_CHOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Edit an existing trigger')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which trigger to edit').setRequired(true).setAutocomplete(true)
      )
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('New channel to watch').addChannelTypes(...TRIGGER_CHANNEL_TYPES).setRequired(false)
      )
      .addStringOption((opt) => opt.setName('trigger').setDescription('New trigger text').setRequired(false))
      .addStringOption((opt) => opt.setName('emoji').setDescription('New emoji').setRequired(false))
      .addStringOption((opt) =>
        opt.setName('mode').setDescription('New response mode').setRequired(false).addChoices(...MODE_CHOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Delete a trigger')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which trigger to remove').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Lists every GoosePizza trigger configured in this server'))
  .addSubcommand((sub) =>
    sub
      .setName('toggle')
      .setDescription('[Admin] Enable or disable GoosePizza (all triggers) for this server')
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
    case 'create':
      return handleCreate(interaction);
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

// Powers the "name" option's autocomplete on /goosepizza edit and /goosepizza remove.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'name') {
    await interaction.respond([]);
    return;
  }

  const names = await goosepizzaManager.getNamesList(interaction.guildId);
  const query = focused.value.toLowerCase();
  const filtered = names.filter((n) => n.toLowerCase().includes(query)).slice(0, 25);

  await interaction.respond(filtered.map((n) => ({ name: n, value: n })));
}

module.exports = { data, execute, autocomplete };

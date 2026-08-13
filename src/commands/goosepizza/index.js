const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleEdit } = require('./handlers/edit');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const { handleChannels } = require('./handlers/channels');
const { handleDisable } = require('./handlers/disable');
const goosepizzaManager = require('../../features/goosepizza/goosepizzaManager');

const MODE_CHOICES = Object.entries(goosepizzaManager.RESPONSE_MODES).map(([value, name]) => ({ name, value }));

const data = new SlashCommandBuilder()
  .setName('goosepizza')
  .setDescription('A passive emoji responder: several independent word/channel/emoji combos')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set up a new trigger (you\'ll pick channels next)')
      .addStringOption((opt) => opt.setName('name').setDescription('A short name for this trigger (e.g. "pizza")').setRequired(true))
      .addStringOption((opt) =>
        opt.setName('trigger').setDescription('Text that triggers it (case-insensitive, anywhere in the message)').setRequired(true)
      )
      .addStringOption((opt) => opt.setName('emoji').setDescription('Unicode or custom server emoji to respond with').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('mode')
          .setDescription('Comment (new message) or React (reacts on the message)')
          .setRequired(true)
          .addChoices(...MODE_CHOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('channels')
      .setDescription('[Admin] Pick which channel(s) a trigger watches (replaces its current list)')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which trigger').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('disable')
      .setDescription('[Admin] Enable/disable one trigger, or GoosePizza entirely if no trigger is given')
      .addBooleanOption((opt) => opt.setName('enabled').setDescription('On or off').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('name')
          .setDescription('Which trigger to disable/enable (omit to affect every trigger at once)')
          .setRequired(false)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Edit an existing trigger\'s text/emoji/mode (use /goosepizza channels for its channels)')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which trigger to edit').setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) => opt.setName('trigger').setDescription('New trigger text').setRequired(false))
      .addStringOption((opt) => opt.setName('emoji').setDescription('New emoji').setRequired(false))
      .addStringOption((opt) =>
        opt.setName('mode').setDescription('New response mode').setRequired(false).addChoices(...MODE_CHOICES)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Lists every GoosePizza trigger configured in this server'))
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Delete a trigger')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('Which trigger to remove').setRequired(true).setAutocomplete(true)
      )
  );

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (subcommand === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await goosepizzaManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ GoosePizza is currently disabled in this server. Use `/goosepizza disable enabled:true` to turn it back on.',
      ephemeral: true,
    });
    return;
  }

  switch (subcommand) {
    case 'add':
      return handleAdd(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'channels':
      return handleChannels(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "name" option's autocomplete on /goosepizza edit, channels, remove, disable
// — shows each trigger's current word/phrase, emoji and response mode right in the
// suggestion label, so there's no need to check elsewhere first to remember what a
// trigger is currently set to.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'name') {
    await interaction.respond([]);
    return;
  }

  const triggers = await goosepizzaManager.listAll(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = triggers
    .filter((t) => t.name.toLowerCase().includes(query))
    .slice(0, 25)
    .map((t) => {
      const label = `${t.name} — "${t.trigger_text}" ${t.emoji} (${t.response_mode})`;
      return { name: label.slice(0, 100), value: t.name };
    });

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

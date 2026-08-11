const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const { handleLast } = require('./handlers/last');
const { handleEdit } = require('./handlers/edit');
const animeNightManager = require('../../features/animenight/animeNightManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(animeNightManager, PermissionFlagsBits.Administrator, 'Anime Night');

const data = new SlashCommandBuilder()
  .setName('animenight')
  .setDescription('Mystery Anime Night watch list')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Add one or more anime to the watched list')
      .addStringOption((opt) =>
        opt
          .setName('titles')
          .setDescription('Anime title(s). Separate multiple with a comma or a slash, e.g. "Naruto, Bleach"')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('date')
          .setDescription('Date watched: DD/MM, DD/MM/YYYY, "today" or "yesterday" (default: today)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Remove a single anime entry from the watched list')
      .addStringOption((opt) =>
        opt.setName('entry').setDescription('Which entry to remove (start typing to search)').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('Show the full watched anime list')
      .addStringOption((opt) =>
        opt
          .setName('order')
          .setDescription('How to sort titles within each session (default: alphabetical)')
          .addChoices(
            { name: 'Alphabetical', value: 'alphabetical' },
            { name: 'Order added', value: 'added' }
          )
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('last').setDescription('Show the anime from the most recent Mystery Anime Night session')
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('[Admin] Edit an existing Mystery Anime Night session')
      .addStringOption((opt) =>
        opt
          .setName('session')
          .setDescription('Which session to edit (start typing to search)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('titles')
          .setDescription('New anime list for this session, replaces the old one. Separate with , or /')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('date')
          .setDescription('New date for this session: DD/MM, DD/MM/YYYY, "today" or "yesterday"')
          .setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await animeNightManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content:
        '⚠️ The Anime Night feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    case 'last':
      return handleLast(interaction);
    case 'edit':
      return handleEdit(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "session" option's autocomplete on /animenight edit (as the admin types,
// suggest matching sessions), and the "entry" option's autocomplete on /animenight
// remove (suggest individual anime, most recently added first).
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'entry') {
    const entries = await animeNightManager.getAllEntriesList(interaction.guildId);
    const query = focused.value.toLowerCase();

    const filtered = entries
      .filter((e) => e.label.toLowerCase().includes(query))
      .slice(-25)
      .reverse();

    await interaction.respond(filtered.map((e) => ({ name: e.label, value: String(e.id) })));
    return;
  }

  if (focused.name !== 'session') {
    await interaction.respond([]);
    return;
  }

  const sessions = await animeNightManager.getSessionsList(interaction.guildId);
  const query = focused.value.toLowerCase();

  const filtered = sessions
    .filter((s) => s.label.toLowerCase().includes(query))
    .slice(-25) // Discord allows at most 25 suggestions
    .reverse(); // show the most recent sessions first

  await interaction.respond(filtered.map((s) => ({ name: s.label, value: s.date })));
}

module.exports = { data, execute, autocomplete };

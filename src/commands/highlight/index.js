const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const { handleIgnoreChannel } = require('./handlers/ignorechannel');
const { handleIgnoreUser } = require('./handlers/ignoreuser');
const { handleMode } = require('./handlers/mode');
const highlightManager = require('../../features/highlight/highlightManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(highlightManager, PermissionFlagsBits.Administrator, 'Highlight');

const data = new SlashCommandBuilder()
  .setName('highlight')
  .setDescription('Get DM\'d when someone mentions a word/phrase you care about')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Adds a word or phrase to your personal highlight list')
      .addStringOption((opt) => opt.setName('word').setDescription('The word or phrase to watch for').setRequired(true))
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) =>
    sub
      .setName('ignorechannel')
      .setDescription("Toggles a channel on/off your personal ignore list (never notifies you from there)")
      .addChannelOption((opt) => opt.setName('channel').setDescription('The channel').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('ignoreuser')
      .setDescription('Toggles a user on/off your personal ignore list (their messages never notify you)')
      .addUserOption((opt) => opt.setName('user').setDescription('The user').setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('Shows your highlight words and ignore lists'))
  .addSubcommand((sub) =>
    sub
      .setName('mode')
      .setDescription('Switches how ignorechannel is interpreted: exclude those channels, or ONLY those channels')
      .addStringOption((opt) =>
        opt
          .setName('mode')
          .setDescription('Which mode')
          .setRequired(true)
          .addChoices(
            { name: 'Everywhere, except the channels I list', value: 'exclude' },
            { name: 'ONLY in the channels I list', value: 'include' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Removes a word or phrase from your personal highlight list')
      .addStringOption((opt) =>
        opt.setName('word').setDescription('Which word to remove (start typing to see your list)').setRequired(true).setAutocomplete(true)
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await highlightManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Highlight feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
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
    case 'ignorechannel':
      return handleIgnoreChannel(interaction);
    case 'ignoreuser':
      return handleIgnoreUser(interaction);
    case 'mode':
      return handleMode(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "word" option's autocomplete on /highlight remove — only shows the words
// the calling user has actually highlighted, not everyone's.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'word') {
    await interaction.respond([]);
    return;
  }

  const words = await highlightManager.getWordsForUser(interaction.guildId, interaction.user.id);
  const query = focused.value.toLowerCase();
  const filtered = words.filter((w) => w.toLowerCase().includes(query)).slice(0, 25);

  await interaction.respond(filtered.map((w) => ({ name: w, value: w })));
}

module.exports = { data, execute, autocomplete };

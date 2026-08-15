const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleCreate } = require('./handlers/create');
const { handleList } = require('./handlers/list');
const { handleRestore } = require('./handlers/restore');
const serverBackupManager = require('../../features/serverbackup/serverBackupManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(serverBackupManager, PermissionFlagsBits.Administrator, 'Server Backup');

const SCOPE_CHOICES = [
  { name: 'Everything (roles + categories/channels)', value: 'all' },
  { name: 'Roles only (+ member role assignments)', value: 'roles' },
  { name: 'Categories & channels only', value: 'channels' },
];

function addScopeOption(sub, description) {
  return sub.addStringOption((opt) => opt.setName('what').setDescription(description).setRequired(false).addChoices(...SCOPE_CHOICES));
}

const data = new SlashCommandBuilder()
  .setName('serverbackup')
  .setDescription('[Admin] Snapshots and restores the server\'s roles, categories, and channels')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    addScopeOption(
      sub
        .setName('create')
        .setDescription('Saves a snapshot of the current roles, categories, and channels')
        .addStringOption((opt) => opt.setName('label').setDescription('Optional note to remember this backup by').setRequired(false)),
      'What to save (default: everything)'
    )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) => sub.setName('list').setDescription('Lists all saved backups for this server'))
  .addSubcommand((sub) =>
    addScopeOption(
      sub
        .setName('restore')
        .setDescription('Recreates whatever is missing from a backup — never deletes or overwrites')
        .addIntegerOption((opt) =>
          opt.setName('backup').setDescription('Which backup to restore from').setRequired(true).setAutocomplete(true)
        ),
      'What to restore (default: everything)'
    )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await serverBackupManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ Server Backup is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'create':
      return handleCreate(interaction);
    case 'list':
      return handleList(interaction);
    case 'restore':
      return handleRestore(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "backup" option's autocomplete on /serverbackup restore.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'backup') {
    await interaction.respond([]);
    return;
  }

  const snapshots = await serverBackupManager.listSnapshots();
  const query = focused.value.toString().toLowerCase();

  const choices = snapshots
    .map((s) => {
      const date = new Date(s.createdAt).toISOString().slice(0, 16).replace('T', ' ');
      const label = s.label ? ` — ${s.label}` : '';
      const source = s.sourceGuildName ? ` [${s.sourceGuildName}]` : '';
      return { name: `#${s.id} (${date})${source}${label}`.slice(0, 100), value: s.id };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

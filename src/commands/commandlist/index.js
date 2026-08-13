const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COMMAND_MANIFEST } = require('./commandManifest');
const { sendPaginated } = require('../../utils/pagination');
const { isMod } = require('../../utils/modRole');

const EMBED_COLOR = 0x2ecc71;
const MAX_PAGE_CHARS = 3500; // safety margin under Discord's 4096-char description cap

const data = new SlashCommandBuilder()
  .setName('commandlist')
  .setDescription('Shows every bot command and who can use it (Admin, Mod, or Everyone)');

// Looks up the REAL, currently-registered option list for one subcommand, straight from
// the command's own SlashCommandBuilder data — rather than hand-duplicating option
// names/requiredness in the manifest, where they'd inevitably drift out of sync.
// Returns null if it can't be resolved cleanly (e.g. the manifest's shorthand entries
// like "exempt add/remove/list" that stand in for several real subcommands at once).
function findSubcommandOptions(client, commandName, subcommandName) {
  const cmd = client.commands.get(commandName.replace(/^\//, ''));
  if (!cmd) return null;
  const json = cmd.data.toJSON();

  if (subcommandName === '(the command itself)') {
    return (json.options || []).filter((o) => o.type !== 1 && o.type !== 2);
  }

  for (const opt of json.options || []) {
    if (opt.type === 1 && opt.name === subcommandName) return opt.options || [];
    if (opt.type === 2) {
      const nested = (opt.options || []).find((sub) => sub.type === 1 && sub.name === subcommandName);
      if (nested) return nested.options || [];
    }
  }
  return null;
}

// "reason" for a required option, "[reason]" for an optional one.
function formatOptionsSuffix(optionsJson) {
  if (!optionsJson || optionsJson.length === 0) return '';
  return ' — ' + optionsJson.map((o) => (o.required ? o.name : `[${o.name}]`)).join(' ');
}

function buildFeatureBlock(client, feature) {
  const sortedSubcommands = [...feature.subcommands].sort((a, b) => a.name.localeCompare(b.name));
  const nameWidth = Math.max(...sortedSubcommands.map((s) => s.name.length));
  const lines = sortedSubcommands.map((s) => {
    const tierText = s.note ? `${s.tier} (${s.note})` : s.tier;
    const optionsJson = findSubcommandOptions(client, feature.command, s.name);
    return `  ${s.name.padEnd(nameWidth)}  ${tierText}${formatOptionsSuffix(optionsJson)}`;
  });
  return `${feature.feature} (${feature.command})\n${lines.join('\n')}`;
}

// Groups feature blocks into pages without ever splitting a feature's own subcommands
// across two pages, staying under a safe character budget per page.
function paginateBlocks(blocks) {
  const pages = [];
  let current = [];
  let currentLength = 0;

  for (const block of blocks) {
    if (current.length > 0 && currentLength + block.length + 2 > MAX_PAGE_CHARS) {
      pages.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(block);
    currentLength += block.length + 2;
  }
  if (current.length > 0) pages.push(current);

  return pages;
}

async function execute(interaction) {
  if (!isMod(interaction.member)) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const blocks = COMMAND_MANIFEST.map((feature) => buildFeatureBlock(interaction.client, feature));
  const pages = paginateBlocks(blocks);

  const legend =
    '**Admin** = requires the Administrator permission · **Mod** = requires the server\'s configured Mod role, or ' +
    'Administrator · **Everyone** = no restriction. Option names with no brackets are required; `[optional]` ones aren\'t.';

  await sendPaginated(
    interaction,
    pages.length,
    (pageIndex) =>
      new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('📋 Command access levels')
        .setDescription(`${legend}\n\n\`\`\`\n${pages[pageIndex].join('\n\n')}\n\`\`\``)
        .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` }),
    { ephemeral: true }
  );
}

module.exports = { data, execute };

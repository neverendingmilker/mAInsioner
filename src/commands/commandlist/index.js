const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COMMAND_MANIFEST } = require('./commandManifest');
const { sendPaginated } = require('../../utils/pagination');

const EMBED_COLOR = 0x2ecc71;
const MAX_PAGE_CHARS = 3500; // safety margin under Discord's 4096-char description cap

const data = new SlashCommandBuilder()
  .setName('commandlist')
  .setDescription('Shows every bot command and who can use it (Admin, Mod, or Everyone)');

function buildFeatureBlock(feature) {
  const nameWidth = Math.max(...feature.subcommands.map((s) => s.name.length));
  const lines = feature.subcommands.map((s) => {
    const tierText = s.note ? `${s.tier} (${s.note})` : s.tier;
    return `  ${s.name.padEnd(nameWidth)}  ${tierText}`;
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
  if (
    !interaction.memberPermissions.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)
  ) {
    await interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
    return;
  }

  const blocks = COMMAND_MANIFEST.map(buildFeatureBlock);
  const pages = paginateBlocks(blocks);

  const legend =
    '**Admin** = requires the Administrator permission · **Mod** = requires Manage Roles/Manage Server/Moderate ' +
    'Members (whatever role your server grants those to) · **Everyone** = no restriction.';

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

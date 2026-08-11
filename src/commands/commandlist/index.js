const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COMMAND_MANIFEST, MOD_ROLE_ID } = require('./commandManifest');
const { sendPaginated } = require('../../utils/pagination');
const verifyManager = require('../../features/verify/verifyManager');

const EMBED_COLOR = 0x2ecc71;
const MAX_PAGE_CHARS = 3500; // safety margin under Discord's 4096-char description cap

const data = new SlashCommandBuilder()
  .setName('commandlist')
  .setDescription('Shows every bot command, who can use it, and whether the mod role actually can here');

// Checks whether the mod role can use this one subcommand in THIS guild: either it
// holds the required permission directly, or — for /verify's sub/domme/maledom/edit —
// it's the specific role configured via `/verify config allowedrole`, which grants
// access independently of Manage Roles.
async function modRoleCanUse(sub, modRole, guildId) {
  if (!sub.permission) return true; // Everyone-tier, trivially usable
  if (modRole.permissions.has(sub.permission)) return true;

  if (sub.verifyAllowedRoleCheck) {
    const config = await verifyManager.getGuildConfig(guildId);
    if (config?.allowed_role_id === modRole.id) return true;
  }

  return false;
}

async function buildFeatureBlock(feature, modRole, guildId) {
  const nameWidth = Math.max(...feature.subcommands.map((s) => s.name.length));

  const lines = await Promise.all(
    feature.subcommands.map(async (s) => {
      let tierText = s.note ? `${s.tier} (${s.note})` : s.tier;
      if (modRole) {
        const canUse = await modRoleCanUse(s, modRole, guildId);
        tierText += canUse ? ' ✅' : ' ❌';
      }
      return `  ${s.name.padEnd(nameWidth)}  ${tierText}`;
    })
  );

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

  const modRole = interaction.guild.roles.cache.get(MOD_ROLE_ID) ?? (await interaction.guild.roles.fetch(MOD_ROLE_ID).catch(() => null));

  const blocks = await Promise.all(COMMAND_MANIFEST.map((feature) => buildFeatureBlock(feature, modRole, interaction.guildId)));
  const pages = paginateBlocks(blocks);

  const legend = modRole
    ? `**Admin** = Administrator permission · **Mod** = Manage Roles/Manage Server/Moderate Members · **Everyone** = no restriction.\n` +
      `✅/❌ shows whether ${modRole} can actually use that command in **this** server, based on the permissions it currently has.`
    : `**Admin** = Administrator permission · **Mod** = Manage Roles/Manage Server/Moderate Members · **Everyone** = no restriction.\n` +
      `⚠️ Couldn't find the configured mod role (<@&${MOD_ROLE_ID}>) in this server, so no per-role ✅/❌ check could be done.`;

  await sendPaginated(interaction, pages.length, (pageIndex) =>
    new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('📋 Command access levels')
      .setDescription(`${legend}\n\n\`\`\`\n${pages[pageIndex].join('\n\n')}\n\`\`\``)
      .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` })
  );
}

module.exports = { data, execute };

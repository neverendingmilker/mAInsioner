const { EmbedBuilder } = require('discord.js');
const boosterLinkManager = require('../../../features/boosterlinks/boosterLinkManager');
const { sendPaginated } = require('../../../utils/pagination');
const { isMod } = require('../../../utils/modRole');

const ITEMS_PER_PAGE = 15;
const EMBED_COLOR = 0x5865f2;

async function handleList(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user');

  const links = user
    ? await boosterLinkManager.listForUser(interaction.guildId, user.id)
    : await boosterLinkManager.listAll(interaction.guildId);

  if (links.length === 0) {
    await interaction.reply({
      content: user ? `No tracked custom roles for ${user}.` : 'No custom roles are currently tracked in this server.',
      ephemeral: true,
    });
    return;
  }

  const totalPages = Math.ceil(links.length / ITEMS_PER_PAGE);

  const buildEmbed = (page) => {
    const pageLinks = links.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
    const lines = pageLinks.map((l) => `<@${l.user_id}> — <@&${l.role_id}>`);

    return new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(user ? `Tracked custom roles for ${user.username}` : 'Tracked custom roles')
      .setDescription(lines.join('\n'))
      .setFooter({
        text: totalPages > 1 ? `Page ${page + 1}/${totalPages} · ${links.length} total` : `${links.length} total`,
      });
  };

  await sendPaginated(interaction, totalPages, buildEmbed, { ephemeral: true });
}

module.exports = { handleList };

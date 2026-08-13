const { EmbedBuilder } = require('discord.js');
const roleLinkManager = require('../../../features/rolelinks/roleLinkManager');
const { sendPaginated } = require('../../../utils/pagination');
const { isMod } = require('../../../utils/modRole');

const ITEMS_PER_PAGE = 15;
const EMBED_COLOR = 0x5865f2;

async function handleList(interaction) {
  if (!isMod(interaction.member)) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  const links = await roleLinkManager.listAll(interaction.guildId);

  if (links.length === 0) {
    await interaction.reply({ content: 'No role links are currently configured in this server.', ephemeral: true });
    return;
  }

  const totalPages = Math.ceil(links.length / ITEMS_PER_PAGE);

  const buildEmbed = (page) => {
    const pageLinks = links.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
    const lines = pageLinks.map((l) =>
      l.bidirectional
        ? `<@&${l.role_a_id}> ↔ <@&${l.role_b_id}> (viceversa)`
        : `<@&${l.role_a_id}> → <@&${l.role_b_id}>`
    );

    return new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Role links')
      .setDescription(lines.join('\n'))
      .setFooter({
        text: totalPages > 1 ? `Page ${page + 1}/${totalPages} · ${links.length} total` : `${links.length} total`,
      });
  };

  await sendPaginated(interaction, totalPages, buildEmbed);
}

module.exports = { handleList };

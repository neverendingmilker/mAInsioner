const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const PAGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity before the buttons stop working

function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('page_prev')
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('page_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

// Sends a reply as a paginated embed. buildEmbed(pageIndex) must return an EmbedBuilder
// for that page. If totalPages is 1, it's sent as a plain reply with no buttons.
// `options.ephemeral` (default false) makes the whole thing visible only to the caller.
async function sendPaginated(interaction, totalPages, buildEmbed, options = {}) {
  let page = 0;
  const ephemeralFlag = options.ephemeral ? { ephemeral: true } : {};

  const components = totalPages > 1 ? [buildRow(page, totalPages)] : [];
  await interaction.reply({ embeds: [buildEmbed(page)], components, ...ephemeralFlag });

  if (totalPages <= 1) return;

  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PAGE_TIMEOUT_MS,
  });

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: 'Only the person who ran the command can change pages.',
        ephemeral: true,
      });
      return;
    }

    if (buttonInteraction.customId === 'page_prev') page = Math.max(0, page - 1);
    if (buttonInteraction.customId === 'page_next') page = Math.min(totalPages - 1, page + 1);

    await buttonInteraction.update({
      embeds: [buildEmbed(page)],
      components: [buildRow(page, totalPages)],
    });
  });

  collector.on('end', async () => {
    await message.edit({ components: [] }).catch(() => {});
  });
}

module.exports = { sendPaginated };

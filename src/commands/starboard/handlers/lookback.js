const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const starboardManager = require('../../../features/starboard/starboardManager');

async function handleLookback(interaction) {
  // Ack the interaction FIRST, before any DB/Discord work below. Discord only gives 3
  // seconds for the initial acknowledgment — if a slow database round-trip (e.g. a cold
  // start) happened before this, the interaction token could already be dead by the time
  // we tried to defer, and every lookback would fail with a generic "an error occurred".
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({ content: '❌ You need the "Administrator" permission to use this command.' });
    return;
  }
  if (!(await starboardManager.isEnabled(interaction.guildId))) {
    await interaction.editReply({
      content: '⚠️ The Starboard feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
    });
    return;
  }

  const name = interaction.options.getString('name');
  const existingNames = await starboardManager.getNamesList(interaction.guildId);
  if (!existingNames.includes(name)) {
    await interaction.editReply({ content: `⚠️ No starboard named "${name}" found in this server.` });
    return;
  }

  const options = {
    name,
    limit: interaction.options.getInteger('limit') ?? starboardManager.LOOKBACK_DEFAULT_LIMIT,
    sinceYearStart: interaction.options.getBoolean('since_year_start') ?? false,
    sinceDateInput: interaction.options.getString('since_date') ?? undefined,
    untilDateInput: interaction.options.getString('until_date') ?? undefined,
    contentType: interaction.options.getString('content_type') ?? undefined,
    emojisInput: interaction.options.getString('emojis') ?? undefined,
    threshold: interaction.options.getInteger('threshold') ?? undefined,
    topN: interaction.options.getInteger('top') ?? undefined,
  };

  let stats;
  try {
    stats = await starboardManager.runLookback(interaction.guild, options.name, options);
  } catch (err) {
    if (err instanceof starboardManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}` });
      return;
    }
    console.error('[starboard] Lookback failed unexpectedly:', err);
    await interaction.editReply({ content: `⚠️ Something went wrong while scanning: ${err.message}` }).catch(() => null);
    return;
  }

  const startBound = options.sinceDateInput ? `since ${options.sinceDateInput}` : options.sinceYearStart ? 'since January 1st' : null;
  const endBound = options.untilDateInput ? `until ${options.untilDateInput}` : null;
  const scope = startBound || endBound ? [startBound, endBound].filter(Boolean).join(' ') : `across the last ${options.limit} messages`;

  const filterNote = ` (filter: **${starboardManager.CONTENT_TYPES[stats.contentType]}**`;
  const overrideNote =
    options.emojisInput !== undefined || options.threshold !== undefined
      ? `, emojis: **${starboardManager.formatEmojisForDisplay(stats.emojis)}**, threshold: **${stats.threshold}**)`
      : ')';

  const inaccessibleNote =
    stats.inaccessibleChannelIds.length > 0
      ? ` ⚠️ Couldn't access ${stats.inaccessibleChannelIds.length === 1 ? 'channel' : 'channels'}: ${stats.inaccessibleChannelIds
          .map((id) => `<#${id}>`)
          .join(', ')}.`
      : '';
  const errorNote =
    stats.errors > 0
      ? ` ⚠️ **${stats.errors}** message${stats.errors === 1 ? '' : 's'} couldn't be checked due to an error — you can safely run this again to retry them.`
      : '';

  const topNNote =
    stats.topN !== undefined
      ? ` Only the **top ${stats.topN}** by count were posted (**${stats.candidatesFound}** qualified in total, **${stats.posted}** actually posted${
          stats.posted > stats.topN ? ' — ties at the cutoff were all included' : ''
        }).`
      : '';

  const summary =
    `✅ Lookback finished. Scanned **${stats.scanned}** messages ${scope}${filterNote}${overrideNote} — ` +
    `**${stats.qualified}** newly made it onto the starboard.${topNNote}${inaccessibleNote}${errorNote}`;

  // A very long scan can outlast the interaction token's 15-minute lifetime — by this
  // point the actual work above is already done and saved either way, so a failed
  // reply here just means the summary itself couldn't be delivered, not that the scan
  // failed silently.
  await interaction.editReply({ content: summary }).catch((err) => {
    console.warn('[starboard] Lookback finished but the summary reply could not be sent (interaction likely expired):', err.message);
  });
}

module.exports = { handleLookback };

const starboardManager = require('../../../features/starboard/starboardManager');
const lookbackSessions = require('../../../features/starboard/lookbackSessions');

async function runAndReport(interaction, options, extraChannels) {
  // Scanning can take a while — ack the component interaction immediately (this has the
  // same 3-second window as a slash command), then edit once the scan actually finishes.
  await interaction.deferUpdate();

  let stats;
  try {
    stats = await starboardManager.runLookback(interaction.guild, options.name, { ...options, extraChannels });
  } catch (err) {
    if (err instanceof starboardManager.ValidationError) {
      await interaction.editReply({ content: `⚠️ ${err.message}`, components: [] });
      return;
    }
    console.error('[starboard] Lookback failed unexpectedly:', err);
    await interaction.editReply({ content: `⚠️ Something went wrong while scanning: ${err.message}`, components: [] }).catch(() => null);
    return;
  }

  const startBound = options.sinceDateInput ? `since ${options.sinceDateInput}` : options.sinceYearStart ? 'since January 1st' : null;
  const endBound = options.untilDateInput ? `until ${options.untilDateInput}` : null;
  const scope = startBound || endBound ? [startBound, endBound].filter(Boolean).join(' ') : `across the last ${options.limit} messages`;

  const channelsNote = stats.channelsScanned > 1 ? `, across **${stats.channelsScanned}** channels` : '';
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
    `✅ Lookback finished. Scanned **${stats.scanned}** messages ${scope}${channelsNote}${filterNote}${overrideNote} — ` +
    `**${stats.qualified}** newly made it onto the starboard.${topNNote}${inaccessibleNote}${errorNote}`;

  // A very long scan can outlast the interaction token's 15-minute lifetime — by this
  // point the actual work above is already done and saved either way, so a failed
  // reply here just means the summary itself couldn't be delivered, not that the scan
  // failed silently.
  await interaction.editReply({ content: summary, components: [] }).catch((err) => {
    console.warn('[starboard] Lookback finished but the summary reply could not be sent (interaction likely expired):', err.message);
  });
}

async function handleChannelSelect(interaction) {
  const options = lookbackSessions.consume(interaction.message.id);
  if (!options) {
    await interaction.update({ content: '⚠️ This lookback picker has expired — run `/starboard lookback` again.', components: [] });
    return;
  }

  const extraChannels = interaction.values.map((id) => ({ id }));
  await runAndReport(interaction, options, extraChannels);
}

async function handleRunButton(interaction) {
  const options = lookbackSessions.consume(interaction.message.id);
  if (!options) {
    await interaction.update({ content: '⚠️ This lookback picker has expired — run `/starboard lookback` again.', components: [] });
    return;
  }

  await runAndReport(interaction, options, []);
}

module.exports = { handleChannelSelect, handleRunButton };

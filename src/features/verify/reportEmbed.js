const { EmbedBuilder } = require('discord.js');

// Shared embed layout for verification reports — used both when a report is first
// posted (verifyManager.performVerification) and when it's edited afterwards
// (verifyManager.updateReportAndSync). Lives in the features layer (not the command
// layer) so the manager can build/re-build the embed for the dashboard too, without
// depending on command-handler code. `color` is passed in by the caller (TYPE_COLORS[type])
// rather than looked up here, to avoid a circular require with verifyManager.js.
// src/commands/verify/handlers/reportEmbed.js re-exports this unchanged so any
// existing require('./reportEmbed') call sites in the command layer keep working.
function buildReportEmbed({
  color,
  userMention,
  userAvatarURL,
  userId,
  verification,
  social,
  verifiedAtSeconds,
  moderatorMention,
}) {
  return new EmbedBuilder()
    .setColor(color)
    .setThumbnail(userAvatarURL || null)
    .setDescription(
      [
        `**Member:** ${userMention}`,
        `**Verification:** ${verification}`,
        social ? `**Social:** ${social}` : null,
        `**User ID:** ${userId}`,
        `**Verified on:** <t:${verifiedAtSeconds}:F>`,
        `**Verified by:** ${moderatorMention}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
}

module.exports = { buildReportEmbed };

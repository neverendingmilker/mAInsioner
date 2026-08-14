const { PermissionFlagsBits } = require('discord.js');
const verifyManager = require('../../../features/verify/verifyManager');
const { buildReportEmbed } = require('./reportEmbed');

// Shared logic behind /verify sub, /verify domme and /verify maledom: assigns the
// role configured (via /verify config) for that type, and removes the single
// shared "remove" role if the member currently holds it.
async function handleVerifyType(interaction, type) {
  const label = verifyManager.TYPE_LABELS[type];
  const targetUser = interaction.options.getUser('user');
  const verification = interaction.options.getString('verification');
  // /verify sub no longer has a "social" option — for domme/maledom it's still
  // required, for sub this is simply null and we store/display it as empty.
  const social = interaction.options.getString('social') ?? '';
  const guild = interaction.guild;

  const config = await verifyManager.getGuildConfig(interaction.guildId);

  if (!verifyManager.canUseVerifyCommands(interaction.member, config)) {
    await interaction.reply({
      content:
        '❌ You need the "Manage Roles" permission, or the role configured via `/verify config allowedrole`, to use this command.',
      ephemeral: true,
    });
    return;
  }

  const { giveRoleId, removeRoleId } = verifyManager.getRoleIdsForType(config, type);

  if (!giveRoleId) {
    await interaction.reply({
      content: `⚠️ No role is configured for **${label}** yet. Set one with \`/verify config\` first.`,
      ephemeral: true,
    });
    return;
  }

  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "⚠️ Couldn't find that user in this server.", ephemeral: true });
    return;
  }

  const giveRole = guild.roles.cache.get(giveRoleId);
  if (!giveRole) {
    await interaction.reply({
      content: `⚠️ The role configured to give for **${label}** no longer exists on this server. Set a new one with \`/verify config\`.`,
      ephemeral: true,
    });
    return;
  }

  const botMember = guild.members.me;
  if (!botMember || botMember.roles.highest.position <= giveRole.position) {
    await interaction.reply({
      content: `⚠️ I can't assign ${giveRole}: my role needs to be moved higher in the server's role list.`,
      ephemeral: true,
    });
    return;
  }

  const notes = [];

  const alreadyHadIt = member.roles.cache.has(giveRole.id);
  if (alreadyHadIt) {
    notes.push(`✅ Already had ${giveRole} (no change needed).`);
  } else {
    await member.roles.add(giveRole);
    notes.push(`✅ Assigned ${giveRole}.`);
  }

  if (removeRoleId) {
    const removeRole = guild.roles.cache.get(removeRoleId);
    if (!removeRole) {
      notes.push('⚠️ The configured remove role no longer exists on this server.');
    } else if (member.roles.cache.has(removeRole.id)) {
      if (botMember.roles.highest.position > removeRole.position) {
        await member.roles.remove(removeRole);
        notes.push(`🗑️ Removed ${removeRole}.`);
      } else {
        notes.push(`⚠️ Couldn't remove ${removeRole}: my role needs to be moved higher in the server's role list.`);
      }
    }
  }

  // Keep the three verification types mutually exclusive: if the member holds the
  // "give" role of one of the other two types, strip it now that they're being
  // verified as this one.
  for (const otherType of verifyManager.TYPES) {
    if (otherType === type) continue;

    const otherGiveRoleId = config[`${otherType}_give_role_id`];
    if (!otherGiveRoleId) continue;

    const otherGiveRole = guild.roles.cache.get(otherGiveRoleId);
    if (!otherGiveRole || !member.roles.cache.has(otherGiveRole.id)) continue;

    if (botMember.roles.highest.position > otherGiveRole.position) {
      await member.roles.remove(otherGiveRole);
      notes.push(`🗑️ Removed ${otherGiveRole}.`);
    } else {
      notes.push(
        `⚠️ Couldn't remove ${otherGiveRole} (${verifyManager.TYPE_LABELS[otherType]}): my role needs to be moved higher in the server's role list.`
      );
    }
  }

  // Sub-only: if configured, make sure the member holds at least one of the admin's
  // "total" roles, backfilling the configured default if they hold none of them.
  if (type === 'sub') {
    const totalRoleStatus = await verifyManager.assignDefaultTotalRoleIfMissing(guild, member);
    if (totalRoleStatus === 'assigned') {
      const defaultRole = guild.roles.cache.get(config.default_total_role_id);
      notes.push(`➕ Had none of the configured "total" roles — assigned the default${defaultRole ? ` (${defaultRole})` : ''}.`);
    }
  }

  // Post the verification report to the configured channel (if any).
  if (config.report_channel_id) {
    const reportChannel = guild.channels.cache.get(config.report_channel_id);
    if (!reportChannel) {
      notes.push('⚠️ The configured report channel no longer exists. Set a new one with `/verify config`.');
    } else {
      const canSend = botMember && reportChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages);
      if (!canSend) {
        notes.push(`⚠️ Couldn't post the report in ${reportChannel}: I don't have "Send Messages" permission there.`);
      } else {
        // If this user already has a report (from a previous verification), delete
        // the old message and DB row first, so they end up with just one report.
        const existingReport = await verifyManager.getLastReportForUser(interaction.guildId, targetUser.id);
        if (existingReport) {
          const oldChannel = guild.channels.cache.get(existingReport.channel_id);
          if (oldChannel) {
            const oldMessage = await oldChannel.messages.fetch(existingReport.message_id).catch(() => null);
            if (oldMessage) {
              await oldMessage.delete().catch(() => null);
            }
          }
          await verifyManager.deleteReport(existingReport.id);
        }

        const verifiedAtSeconds = Math.floor(interaction.createdTimestamp / 1000);
        const reportEmbed = buildReportEmbed({
          type,
          userMention: `${targetUser}`,
          userAvatarURL: targetUser.displayAvatarURL(),
          userId: targetUser.id,
          verification,
          social,
          verifiedAtSeconds,
          moderatorMention: `${interaction.user}`,
        });

        const reportMessage = await reportChannel.send({ content: `${targetUser}`, embeds: [reportEmbed] });
        notes.push(`📋 Report posted in ${reportChannel}.`);

        await verifyManager.recordReport({
          guild_id: interaction.guildId,
          user_id: targetUser.id,
          type,
          channel_id: reportChannel.id,
          message_id: reportMessage.id,
          verification,
          social,
          verified_at: verifiedAtSeconds,
          moderator_id: interaction.user.id,
        });
      }
    }
  }

  await interaction.reply({
    content: `${targetUser} verified as **${label}**:\n${notes.join('\n')}`,
    ephemeral: true,
  });
}

module.exports = { handleVerifyType };

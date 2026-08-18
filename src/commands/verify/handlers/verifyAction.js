const verifyManager = require('../../../features/verify/verifyManager');

// Shared logic behind /verify sub, /verify domme and /verify maledom: assigns the
// role configured (via /verify config) for that type, and removes the single
// shared "remove" role if the member currently holds it. The actual side effects
// (role assign/remove, cross-type exclusivity, sub-role fallback, report posting) now
// live in verifyManager.performVerification (shared with the dashboard's "issue
// verification" form) — this handler keeps its own pre-flight checks (permission,
// member lookup, give-role existence/hierarchy) unchanged, and reconstructs the exact
// same reply text as before from the structured result performVerification returns.
async function handleVerifyType(interaction, type) {
  const label = verifyManager.TYPE_LABELS[type];
  const targetUser = interaction.options.getUser('user');
  const verification = interaction.options.getString('verification');
  // /verify sub no longer has a "social" option — for domme/maledom it's still
  // required, for sub this is simply null and we store/display it as empty.
  const social = interaction.options.getString('social') ?? '';
  const guild = interaction.guild;

  const config = await verifyManager.getGuildConfig(interaction.guildId);

  if (!(await verifyManager.canUseVerifyCommands(interaction.member, config))) {
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

  const verifiedAtSeconds = Math.floor(interaction.createdTimestamp / 1000);

  const result = await verifyManager.performVerification(guild, type, {
    member,
    giveRole,
    config,
    verification,
    social,
    moderatorMention: `${interaction.user}`,
    moderatorId: interaction.user.id,
    verifiedAtSeconds,
  });

  const notes = [];

  notes.push(result.alreadyHadRole ? `✅ Already had ${giveRole} (no change needed).` : `✅ Assigned ${giveRole}.`);

  if (removeRoleId) {
    if (result.removeRole?.missing) {
      notes.push('⚠️ The configured remove role no longer exists on this server.');
    } else if (result.removeRole?.removed) {
      notes.push(`🗑️ Removed ${result.removeRole.role}.`);
    } else if (result.removeRole?.blocked) {
      notes.push(`⚠️ Couldn't remove ${result.removeRole.role}: my role needs to be moved higher in the server's role list.`);
    }
  }

  // Keep the three verification types mutually exclusive: performVerification already
  // stripped the "give" role of any other type the member held — this just reports it,
  // in the same order (TYPES, excluding this one) as before the extraction.
  for (const cr of result.crossRemovals) {
    if (cr.removed) {
      notes.push(`🗑️ Removed ${cr.role}.`);
    } else {
      notes.push(
        `⚠️ Couldn't remove ${cr.role} (${verifyManager.TYPE_LABELS[cr.type]}): my role needs to be moved higher in the server's role list.`
      );
    }
  }

  // Sub-only: if configured, make sure the member holds at least one of the admin's
  // sub roles, backfilling the configured default if they hold none of them.
  if (result.subRole?.status === 'assigned') {
    notes.push(
      `➕ Had none of the configured sub roles — assigned the default${result.subRole.defaultRole ? ` (${result.subRole.defaultRole})` : ''}.`
    );
  }

  // Report of the verification, posted to the configured channel (if any).
  if (config.report_channel_id) {
    if (result.report?.channelMissing) {
      notes.push('⚠️ The configured report channel no longer exists. Set a new one with `/verify config`.');
    } else if (result.report?.noPermission) {
      notes.push(`⚠️ Couldn't post the report in ${result.report.channel}: I don't have "Send Messages" permission there.`);
    } else if (result.report?.posted) {
      notes.push(`📋 Report posted in ${result.report.channel}.`);
    }
  }

  await interaction.reply({
    content: `${targetUser} verified as **${label}**:\n${notes.join('\n')}`,
    ephemeral: true,
  });
}

module.exports = { handleVerifyType };

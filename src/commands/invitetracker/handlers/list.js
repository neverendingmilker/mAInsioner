const { EmbedBuilder } = require('discord.js');
const inviteTrackerManager = require('../../../features/invitetracker/inviteTrackerManager');
const { isMod } = require('../../../utils/modRole');

const EMBED_COLOR = 0x5865f2;

async function handleList(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  let overview;
  try {
    overview = await inviteTrackerManager.getAssignedInvitesOverview(interaction.guild);
  } catch (err) {
    if (err instanceof inviteTrackerManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  if (overview.length === 0) {
    await interaction.reply({ content: '✅ No invites are currently assigned to anyone.', ephemeral: true });
    return;
  }

  const lines = overview.map((inv) => {
    const status = inv.active ? `${inv.uses}${inv.maxUses ? `/${inv.maxUses}` : ''} uses` : '⚠️ no longer active';
    const expiry = inv.expiresTimestamp ? `expires <t:${Math.floor(inv.expiresTimestamp / 1000)}:R>` : 'never expires';
    return `**https://discord.gg/${inv.code}** → <@${inv.assignedUserId}> — ${status}, ${expiry}`;
  });

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Assigned invites')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${overview.length} assigned invite${overview.length === 1 ? '' : 's'}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };

const { PermissionFlagsBits } = require('discord.js');
const roleLinkManager = require('../../../features/rolelinks/roleLinkManager');

// Identifies the link by its current role1/role2 pair, then re-creates it with
// whichever new values were given (new_role1, new_role2, and/or viceversa).
async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const role1 = interaction.options.getRole('role1');
  const role2 = interaction.options.getRole('role2');
  const newRole1 = interaction.options.getRole('new_role1') ?? role1;
  const newRole2 = interaction.options.getRole('new_role2') ?? role2;
  const newBidirectional = interaction.options.getBoolean('viceversa');

  const allLinks = await roleLinkManager.listAll(interaction.guildId);
  const existing = allLinks.find((l) => l.role_a_id === role1.id && l.role_b_id === role2.id);
  if (!existing) {
    await interaction.reply({
      content: `⚠️ No link found from ${role1} to ${role2}. Check the order — role1 is the one that, when lost, removes role2.`,
      ephemeral: true,
    });
    return;
  }

  const bidirectional = newBidirectional ?? Boolean(existing.bidirectional);

  try {
    await roleLinkManager.unlink(interaction.guildId, role1.id, role2.id);
    await roleLinkManager.link(interaction.guild, newRole1, newRole2, bidirectional, interaction.user.id);
  } catch (err) {
    if (err instanceof roleLinkManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const arrow = bidirectional ? '↔' : '→';
  await interaction.reply({ content: `✅ Updated: ${newRole1} ${arrow} ${newRole2}.`, ephemeral: true });
}

module.exports = { handleEdit };

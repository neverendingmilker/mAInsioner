const roleLinkManager = require('../../../features/rolelinks/roleLinkManager');
const sessions = require('../../../features/rolelinks/roleLinkSessions');

async function handleRoleSelect(interaction) {
  const session = sessions.consume(interaction.message.id);
  if (!session) {
    await interaction.update({ content: '⚠️ This picker has expired — run `/rolelink add` again.', components: [] });
    return;
  }

  await interaction.deferUpdate();

  const role1 = interaction.guild.roles.cache.get(session.role1Id) ?? (await interaction.guild.roles.fetch(session.role1Id).catch(() => null));
  if (!role1) {
    await interaction.editReply({ content: "⚠️ role1 doesn't seem to exist anymore.", components: [] });
    return;
  }

  const targetRoles = interaction.roles ? [...interaction.roles.values()] : [];
  const created = [];
  const failed = [];

  for (const role2 of targetRoles) {
    try {
      await roleLinkManager.link(interaction.guild, role1, role2, session.bidirectional, session.createdBy);
      created.push(role2);
    } catch (err) {
      if (err instanceof roleLinkManager.ValidationError) {
        failed.push(`${role2}: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  const lines = [];
  if (created.length > 0) {
    const arrow = session.bidirectional ? '↔' : '→';
    lines.push(`✅ Linked ${role1} ${arrow} ${created.map((r) => r.toString()).join(', ')}.`);
  }
  if (failed.length > 0) {
    lines.push(`⚠️ Some failed:\n${failed.join('\n')}`);
  }

  await interaction.editReply({ content: lines.join('\n\n') || 'Nothing to do.', components: [] });
}

module.exports = { handleRoleSelect };

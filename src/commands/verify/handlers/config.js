const { PermissionFlagsBits } = require('discord.js');
const verifyManager = require('../../../features/verify/verifyManager');

// Merges into one subcommand the give role for all three verification types
// (sub, domme, maledom), the single shared remove role, the report channel, and
// the role allowed to run those three commands — provide any combination of the
// 6 options in a single call.
async function handleConfig(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need the "Administrator" permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const options = {
    subGive: interaction.options.getRole('verified_sub'),
    dommeGive: interaction.options.getRole('verified_domme'),
    maledomGive: interaction.options.getRole('verified_maledom'),
    remove: interaction.options.getRole('remove'),
    allowedRole: interaction.options.getRole('allowedrole'),
  };
  const channel = interaction.options.getChannel('channel');

  const provided = [...Object.values(options), channel].filter(Boolean);
  if (provided.length === 0) {
    await interaction.reply({
      content: '⚠️ Provide at least one setting to change.',
      ephemeral: true,
    });
    return;
  }

  const updates = {};
  const messages = [];

  const describe = (key, label, verb) => {
    const role = options[key];
    if (!role) return;
    updates[key] = role.id;
    messages.push(`**${label}** → ${verb} ${role}`);
  };

  describe('subGive', 'Sub', 'give');
  describe('dommeGive', 'Domme', 'give');
  describe('maledomGive', 'Maledom', 'give');

  if (options.remove) {
    updates.remove = options.remove.id;
    messages.push(`**Remove (shared)** → remove (if present) ${options.remove}`);
  }

  if (options.allowedRole) {
    updates.allowedRole = options.allowedRole.id;
    messages.push(
      `**Allowed role** → ${options.allowedRole} can now use \`/verify sub\`, \`/verify domme\` and \`/verify maledom\` (in addition to anyone with "Manage Roles").`
    );
  }

  if (channel) {
    updates.channel = channel.id;
    const botMember = interaction.guild.members.me;
    const canSend = botMember && channel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages);
    if (!canSend) {
      messages.push(
        `**Report channel** → ${channel}\n⚠️ Heads up: I don't currently have permission to send messages in ${channel}. Please grant me "Send Messages" there.`
      );
    } else {
      messages.push(`**Report channel** → ${channel}`);
    }
  }

  await verifyManager.setConfig(interaction.guildId, updates);

  await interaction.reply({
    content: `✅ Updated:\n${messages.map((m) => `• ${m}`).join('\n')}`,
    ephemeral: true,
  });
}

module.exports = { handleConfig };

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const modRole = require('../../utils/modRole');

const data = new SlashCommandBuilder()
  .setName('modrole')
  .setDescription('[Admin] Sets or shows which role counts as "Mod" for this server')
  .addRoleOption((opt) =>
    opt.setName('role').setDescription('The role to use as Mod (leave empty to just see the current one)').setRequired(false)
  );

async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role');

  if (!role) {
    const currentId = await modRole.getModRoleId(interaction.guildId);
    if (!currentId) {
      await interaction.reply({
        content: 'No Mod role is configured for this server yet — only Administrators count as Mod until you set one with `/modrole role:<role>`.',
        ephemeral: true,
      });
      return;
    }
    const current = interaction.guild.roles.cache.get(currentId);
    await interaction.reply({
      content: current
        ? `The Mod role for this server is currently ${current}.`
        : `⚠️ The configured Mod role no longer exists in this server — set a new one with \`/modrole role:<role>\`.`,
      ephemeral: true,
    });
    return;
  }

  await modRole.setModRoleId(interaction.guildId, role.id);
  await interaction.reply({ content: `✅ ${role} is now the Mod role for this server.`, ephemeral: true });
}

module.exports = { data, execute };

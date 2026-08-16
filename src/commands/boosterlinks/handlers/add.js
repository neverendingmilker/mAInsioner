const boosterLinkManager = require('../../../features/boosterlinks/boosterLinkManager');
const { isMod } = require('../../../utils/modRole');

async function handleAdd(interaction) {
  if (!(await isMod(interaction.member))) {
    await interaction.reply({
      content: '❌ You need to be a Mod or Admin to use this command.',
      ephemeral: true,
    });
    return;
  }

  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  try {
    await boosterLinkManager.link(interaction.guild, user.id, role, interaction.user.id);
  } catch (err) {
    if (err instanceof boosterLinkManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const isBooster = Boolean(member?.roles.premiumSubscriberRole);

  let warning = '';
  if (!member) {
    warning = `\n⚠️ Heads up: I couldn't find ${user} in this server right now.`;
  } else if (!isBooster) {
    warning = `\n⚠️ Heads up: ${user} doesn't currently have the Server Booster role — the link is saved anyway, and will trigger the next time they lose that role.`;
  }

  const enabled = await boosterLinkManager.isEnabled(interaction.guildId);
  const disabledNote = enabled ? '' : '\n⚠️ Note: the feature is currently **disabled** for this server (`/boosterlink disable`), so auto-removal won\'t run until it\'s re-enabled.';

  await interaction.reply({
    content: `✅ ${role} is now linked to ${user}. It'll be automatically removed if they stop boosting.${warning}${disabledNote}`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };

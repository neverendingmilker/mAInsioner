const { PermissionFlagsBits } = require('discord.js');
const reactionLimitManager = require('../../../features/reactionlimit/reactionLimitManager');

async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const channel = interaction.guild.channels.cache.get(channelId) ?? (await interaction.guild.channels.fetch(channelId).catch(() => null));
  if (!channel) {
    await interaction.reply({ content: "⚠️ That channel doesn't seem to exist anymore.", ephemeral: true });
    return;
  }

  const existing = (await reactionLimitManager.listChannels(interaction.guildId)).find((c) => c.channelId === channelId);
  if (!existing) {
    await interaction.reply({ content: `⚠️ ${channel} doesn't have a reaction limit configured — use \`/reactionlimit add\` first.`, ephemeral: true });
    return;
  }

  const ignoreFirstPost = interaction.options.getBoolean('ignore_first_post') ?? existing.ignoreFirstPost;

  try {
    await reactionLimitManager.setChannel(interaction.guild, channel, ignoreFirstPost, interaction.user.id);
  } catch (err) {
    if (err instanceof reactionLimitManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ Updated: in ${channel}'s threads, each person can react at most **${reactionLimitManager.REACTION_LIMIT}** times per thread` +
      `${ignoreFirstPost ? " (reactions on the thread's starter message don't count)." : '.'}`,
    ephemeral: true,
  });
}

module.exports = { handleEdit };

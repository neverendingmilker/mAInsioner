const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const themesManager = require('../../features/themes/themesManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(themesManager, PermissionFlagsBits.Administrator, 'Themes');

// Straight copy of /qotd — config (channel, ping role, schedule, theme list + reordering)
// is dashboard-only, this command only covers forcing an out-of-schedule post and a quick
// status check. See /qotd for the same pattern.
const data = new SlashCommandBuilder()
  .setName('themes')
  .setDescription('Themes: posts a theme from the configured queue on a schedule')
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) => sub.setName('post').setDescription('[Admin] Posts the next theme in the queue right now, regardless of the schedule'))
  .addSubcommand((sub) => sub.setName('status').setDescription('[Admin] Shows the current configuration, queue size, and whether posting is due/paused'));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  if (sub === 'post') {
    const result = await themesManager.postNext(interaction.client, interaction.guildId);
    const messages = {
      no_channel_configured: '⚠️ No posting channel is configured yet — set one on the dashboard.',
      no_themes: '⚠️ The theme queue is empty — add some on the dashboard.',
      exhausted: '⚠️ Every theme in the queue has already been posted — add more on the dashboard to resume.',
      guild_not_found: '⚠️ Something went wrong resolving this server.',
      channel_not_found: '⚠️ The configured channel no longer exists — set a new one on the dashboard.',
      missing_permission: '⚠️ I don\'t have permission to post in the configured channel.',
    };

    await interaction.reply({
      content: result.posted
        ? `✅ Posted. ${result.remaining} theme(s) left in the queue.`
        : messages[result.reason] || '⚠️ Could not post.',
      ephemeral: true,
    });
    return;
  }

  if (sub === 'status') {
    const [config, themes] = await Promise.all([
      themesManager.getConfig(interaction.guildId),
      themesManager.listThemes(interaction.guildId),
    ]);
    const enabled = await themesManager.isEnabled(interaction.guildId);

    const scheduleLabel =
      config.schedule_mode === 'daily'
        ? config.daily_time
          ? `every day at ${config.daily_time}`
          : 'daily (time not set yet)'
        : config.interval_hours
          ? `every ${config.interval_hours} hour(s)`
          : 'interval (hours not set yet)';

    const remaining = Math.max(0, themes.length - config.next_position);
    const nextPreview = remaining > 0 ? themes[Math.min(config.next_position, themes.length - 1)].theme : null;

    const lines = [
      `**Status:** ${enabled ? 'enabled' : 'disabled'}`,
      `**Channel:** ${config.channel_id ? `<#${config.channel_id}>` : 'not set'}`,
      `**Pinged role:** ${config.role_id ? `<@&${config.role_id}>` : 'none'}`,
      `**Schedule:** ${scheduleLabel}`,
      `**Queue:** ${themes.length} theme(s) total, ${remaining} not posted yet`,
      nextPreview
        ? `**Next theme:** ${nextPreview.length > 200 ? `${nextPreview.slice(0, 200)}…` : nextPreview}`
        : '**Next theme:** none — the queue is empty or exhausted.',
    ];

    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
}

module.exports = { data, execute };

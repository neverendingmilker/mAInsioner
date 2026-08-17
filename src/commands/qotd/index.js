const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const qotdManager = require('../../features/qotd/qotdManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(qotdManager, PermissionFlagsBits.Administrator, 'Question of the Day');

// Config (channel, ping role, schedule, question list + reordering, Google Sheet import)
// is dashboard-only — see /channelpermissions and /roleaudit for the same pattern of a
// dashboard-first feature. This command only covers the two things worth doing from
// Discord itself: forcing an out-of-schedule post, and a quick status check.
const data = new SlashCommandBuilder()
  .setName('qotd')
  .setDescription('Question of the Day: posts a question from the configured queue on a schedule')
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) => sub.setName('post').setDescription('[Admin] Posts the next question in the queue right now, regardless of the schedule'))
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
    const result = await qotdManager.postNext(interaction.client, interaction.guildId);
    const messages = {
      no_channel_configured: '⚠️ No posting channel is configured yet — set one on the dashboard.',
      no_questions: '⚠️ The question queue is empty — add some on the dashboard, or import from a Google Sheet.',
      exhausted: '⚠️ Every question in the queue has already been posted — add more on the dashboard to resume.',
      guild_not_found: '⚠️ Something went wrong resolving this server.',
      channel_not_found: '⚠️ The configured channel no longer exists — set a new one on the dashboard.',
      missing_permission: '⚠️ I don\'t have permission to post in the configured channel.',
    };

    await interaction.reply({
      content: result.posted
        ? `✅ Posted. ${result.remaining} question(s) left in the queue.`
        : messages[result.reason] || '⚠️ Could not post.',
      ephemeral: true,
    });
    return;
  }

  if (sub === 'status') {
    const [config, questions] = await Promise.all([
      qotdManager.getConfig(interaction.guildId),
      qotdManager.listQuestions(interaction.guildId),
    ]);
    const enabled = await qotdManager.isEnabled(interaction.guildId);

    const scheduleLabel =
      config.schedule_mode === 'daily'
        ? config.daily_time
          ? `every day at ${config.daily_time}`
          : 'daily (time not set yet)'
        : config.interval_hours
          ? `every ${config.interval_hours} hour(s)`
          : 'interval (hours not set yet)';

    const remaining = Math.max(0, questions.length - config.next_position);
    const nextPreview = remaining > 0 ? questions[Math.min(config.next_position, questions.length - 1)].question : null;

    const lines = [
      `**Status:** ${enabled ? 'enabled' : 'disabled'}`,
      `**Channel:** ${config.channel_id ? `<#${config.channel_id}>` : 'not set'}`,
      `**Pinged role:** ${config.role_id ? `<@&${config.role_id}>` : 'none'}`,
      `**Schedule:** ${scheduleLabel}`,
      `**Queue:** ${questions.length} question(s) total, ${remaining} not posted yet`,
      nextPreview
        ? `**Next question:** ${nextPreview.length > 200 ? `${nextPreview.slice(0, 200)}…` : nextPreview}`
        : '**Next question:** none — the queue is empty or exhausted.',
    ];

    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
}

module.exports = { data, execute };

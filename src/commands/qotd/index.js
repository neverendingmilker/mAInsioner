const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const qotdManager = require('../../features/qotd/qotdManager');
const { isMod } = require('../../utils/modRole');
const { handleAdd } = require('./handlers/add');
const { handleChannel } = require('./handlers/channel');
const { handleEdit } = require('./handlers/edit');
const { handleList } = require('./handlers/list');
const { handleRemove } = require('./handlers/remove');
const { handleRole } = require('./handlers/role');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(qotdManager, PermissionFlagsBits.Administrator, 'Question of the Day');

// Matches the dashboard's own channel picker (src/dashboard/routes/qotd.js) — text-like
// channels only, same reasoning as everywhere else questions/announcements get posted.
const QOTD_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Config (channel, ping role, schedule, question list) used to be dashboard-only. It's
// still fully editable there (including drag-and-drop reordering, which has no slash
// equivalent), but the everyday Mod actions — add/edit/remove a question, set the
// channel/role, force a post, see what's queued — now also work from Discord, same as
// every other feature. Everything below except `disable` is Mod-level (not Admin-only).
const data = new SlashCommandBuilder()
  .setName('qotd')
  .setDescription('Question of the Day: posts a question from the configured queue on a schedule')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Mod] Add a question to the queue')
      .addStringOption((opt) => opt.setName('question').setDescription('The question text').setMaxLength(500).setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('[Mod] Set which channel questions get posted in')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel to post in').addChannelTypes(...QOTD_CHANNEL_TYPES).setRequired(true)
      )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription("[Mod] Change an existing question's text")
      .addStringOption((opt) =>
        opt.setName('question').setDescription('Which question to edit (start typing to see the queue)').setRequired(true).setAutocomplete(true)
      )
      .addStringOption((opt) => opt.setName('text').setDescription('The new text').setMaxLength(500).setRequired(true))
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Mod] Lists every question still waiting to be posted'))
  .addSubcommand((sub) => sub.setName('post').setDescription('[Mod] Posts the next question in the queue right now, regardless of the schedule'))
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Mod] Remove a question from the queue')
      .addStringOption((opt) =>
        opt.setName('question').setDescription('Which question to remove (start typing to see the queue)').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('role')
      .setDescription('[Mod] Set (or clear) the role pinged when a new question posts')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to ping — omit to stop pinging anyone').setRequired(false))
  )
  .addSubcommand((sub) => sub.setName('status').setDescription('[Mod] Shows the current configuration, queue size, and whether posting is due/paused'));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off. Stays Admin-only, unlike
  // everything else here — same convention as every other feature's disable subcommand.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'channel':
      return handleChannel(interaction);
    case 'edit':
      return handleEdit(interaction);
    case 'list':
      return handleList(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'role':
      return handleRole(interaction);
    default:
      break;
  }

  // post/status stay inline (pre-existing) — each still needs the same Mod check the
  // handlers above do themselves.
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  if (sub === 'post') {
    const result = await qotdManager.postNext(interaction.client, interaction.guildId);
    const messages = {
      no_channel_configured: '⚠️ No posting channel is configured yet — set one with `/qotd channel` or on the dashboard.',
      no_questions: '⚠️ The question queue is empty — add some with `/qotd add` or on the dashboard.',
      exhausted: '⚠️ Every question in the queue has already been posted — add more to resume.',
      guild_not_found: '⚠️ Something went wrong resolving this server.',
      channel_not_found: '⚠️ The configured channel no longer exists — set a new one with `/qotd channel`.',
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

// Powers the "question" option's autocomplete on /qotd edit and /qotd remove: the whole
// queue (not just what's upcoming — editing/removing an already-posted question is still
// valid), each choice's value is the question's numeric id as a string.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'question') {
    await interaction.respond([]);
    return;
  }

  const questions = await qotdManager.listQuestions(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = questions
    .map((q) => {
      const preview = q.question.length > 90 ? `${q.question.slice(0, 90)}…` : q.question;
      return { name: `#${q.id} — ${preview}`, value: String(q.id) };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

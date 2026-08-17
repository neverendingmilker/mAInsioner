const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const bumpReminderManager = require('../../features/bumpreminder/bumpReminderManager');
const { isMod } = require('../../utils/modRole');
const { handleChannel } = require('./handlers/channel');
const { handleRole } = require('./handlers/role');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(bumpReminderManager, PermissionFlagsBits.Administrator, 'Bump Reminder');

// Matches the dashboard's own channel picker (src/dashboard/routes/bumpreminder.js) —
// text-like channels only, same reasoning as QOTD/Themes/Incident.
const BUMPREMINDER_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Everything below except `disable` is Mod-level (not Admin-only), same convention as
// every other feature.
const data = new SlashCommandBuilder()
  .setName('bumpreminder')
  .setDescription('Bump Reminder: pings this server to run /bump again once Disboard\'s cooldown is over')
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('[Mod] Set which channel the reminder gets posted in')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel to post in').addChannelTypes(...BUMPREMINDER_CHANNEL_TYPES).setRequired(true)
      )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) =>
    sub
      .setName('role')
      .setDescription('[Mod] Set (or clear) the role pinged when the reminder posts')
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to ping — omit to stop pinging anyone').setRequired(false))
  )
  .addSubcommand((sub) => sub.setName('status').setDescription('[Mod] Shows the current configuration and when the next reminder is due'));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off. Stays Admin-only, unlike
  // everything else here — same convention as every other feature's disable subcommand.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  switch (sub) {
    case 'channel':
      return handleChannel(interaction);
    case 'role':
      return handleRole(interaction);
    default:
      break;
  }

  // status stays inline (pre-existing pattern) — still needs the same Mod check the
  // handlers above do themselves.
  if (!(await isMod(interaction.member))) {
    await interaction.reply({ content: '❌ You need to be a Mod or Admin to use this command.', ephemeral: true });
    return;
  }

  if (sub === 'status') {
    const [config, enabled] = await Promise.all([
      bumpReminderManager.getConfig(interaction.guildId),
      bumpReminderManager.isEnabled(interaction.guildId),
    ]);

    const nextReminder = config.next_reminder_at
      ? `<t:${Math.floor(config.next_reminder_at / 1000)}:R>`
      : 'none armed — waiting for the next `/bump`';

    const lines = [
      `**Status:** ${enabled ? 'enabled' : 'disabled'}`,
      `**Channel:** ${config.channel_id ? `<#${config.channel_id}>` : 'not set'}`,
      `**Pinged role:** ${config.role_id ? `<@&${config.role_id}>` : 'none'}`,
      `**Next reminder:** ${nextReminder}`,
      `**Last bumped by:** ${config.last_bumped_by ? `<@${config.last_bumped_by}>` : 'unknown'}`,
    ];

    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    return;
  }

  await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
}

module.exports = { data, execute };

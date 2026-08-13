const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleList } = require('./handlers/list');
const postLimitManager = require('../../features/postlimit/postLimitManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(postLimitManager, PermissionFlagsBits.Administrator, 'Post Limit');

const data = new SlashCommandBuilder()
  .setName('postlimit')
  .setDescription('Limits how often each person can post in a channel (beyond Discord\'s 6h slowmode cap)')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Set (or replace) the post limit for a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('The channel to limit')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('How often each person may post: a number + s/m/h/d — e.g. 12h, 1d, 3d (min 1m)')
          .setRequired(true)
      )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) => sub.setName('list').setDescription('[Admin] Lists every channel with a post limit configured'))
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes the post limit from a channel')
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which post limit to remove (start typing to see configured ones)')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await postLimitManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The post limit feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "channel" option's autocomplete on /postlimit remove: only shows channels
// that currently have a limit configured, with the cooldown shown, instead of every
// channel in the server.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'channel') {
    await interaction.respond([]);
    return;
  }

  const limits = await postLimitManager.listLimits(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = limits
    .map((l) => {
      const channel = interaction.guild.channels.cache.get(l.channelId);
      const label = channel ? `#${channel.name}` : l.channelId;
      return { name: `${label} — one every ${l.cooldownLabel}`, value: l.channelId };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

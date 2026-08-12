const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { handleAdd } = require('./handlers/add');
const { handleRemove } = require('./handlers/remove');
const { handleSetDigit } = require('./handlers/setdigit');
const { handleRemoveDigit } = require('./handlers/removedigit');
const { handleList } = require('./handlers/list');
const reactionCodeManager = require('../../features/reactioncode/reactionCodeManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(reactionCodeManager, PermissionFlagsBits.Administrator, 'Reaction Code');

const REACTIONCODE_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const data = new SlashCommandBuilder()
  .setName('reactioncode')
  .setDescription('Post an image, then a digit-only message to swap its reactions based on a digit->emoji mapping')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('[Admin] Sets up a channel for reaction codes')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel').addChannelTypes(...REACTIONCODE_CHANNEL_TYPES).setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('[Admin] Removes reaction codes (and its digit mappings) from a channel')
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which channel to remove (start typing to see configured ones)')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('setdigit')
      .setDescription('[Admin] Maps digit(s) to emoji(s) for a channel — comma-separate both to set several at once')
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which channel (start typing to see configured ones)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('digit')
          .setDescription('A digit (0-9), or several separated by commas, e.g. "7,8,9"')
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('emoji')
          .setDescription('The matching emoji(s), same order/count as "digit", e.g. "🟢,🟡,🔴"')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('removedigit')
      .setDescription("[Admin] Removes one digit's mapping for a channel")
      .addStringOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which channel (start typing to see configured ones)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('digit')
          .setDescription('Which digit to unmap')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('[Admin] Lists every channel set up for reaction codes and their digit mappings'))
  .addSubcommand(buildDisableSubcommand());

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Disable must work even while the feature is disabled, otherwise there'd be no way
  // to turn it back on through this command once it's off.
  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  if (!(await reactionCodeManager.isEnabled(interaction.guildId))) {
    await interaction.reply({
      content: '⚠️ The Reaction Code feature is currently disabled in this server. An admin can re-enable it with `/disablefeature`.',
      ephemeral: true,
    });
    return;
  }

  switch (sub) {
    case 'add':
      return handleAdd(interaction);
    case 'remove':
      return handleRemove(interaction);
    case 'setdigit':
      return handleSetDigit(interaction);
    case 'removedigit':
      return handleRemoveDigit(interaction);
    case 'list':
      return handleList(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the autocomplete on "channel" (remove, setdigit, removedigit — only shows
// configured channels) and "digit" (removedigit — only shows digits already mapped for
// whichever channel is currently selected in that same interaction).
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'channel') {
    const channelIds = await reactionCodeManager.listChannels(interaction.guildId);
    const query = focused.value.toLowerCase();
    const choices = channelIds
      .map((id) => {
        const channel = interaction.guild.channels.cache.get(id);
        return { name: channel ? `#${channel.name}` : id, value: id };
      })
      .filter((c) => c.name.toLowerCase().includes(query))
      .slice(0, 25);
    await interaction.respond(choices);
    return;
  }

  if (focused.name === 'digit') {
    const channelId = interaction.options.getString('channel');
    if (!channelId) {
      await interaction.respond([]);
      return;
    }
    const digitMap = await reactionCodeManager.getDigitMap(interaction.guildId, channelId);
    const query = focused.value.toLowerCase();
    const choices = [...digitMap.entries()]
      .map(([digit, emoji]) => ({ name: `${digit} → ${emoji}`, value: digit }))
      .filter((c) => c.name.toLowerCase().includes(query))
      .slice(0, 25);
    await interaction.respond(choices);
    return;
  }

  await interaction.respond([]);
}

module.exports = { data, execute, autocomplete };

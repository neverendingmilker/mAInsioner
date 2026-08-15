const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { handleCreate } = require('./handlers/create');
const { handleLeaderboard } = require('./handlers/leaderboard');
const { handleList } = require('./handlers/list');
const { handleRevoke } = require('./handlers/revoke');
const { handleUser } = require('./handlers/user');
const inviteTrackerManager = require('../../features/invitetracker/inviteTrackerManager');
const { buildDisableSubcommand, createDisableHandler } = require('../shared/disableSubcommand');

const handleDisable = createDisableHandler(inviteTrackerManager, PermissionFlagsBits.Administrator, 'Invite Tracker');

const INVITE_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice];

const data = new SlashCommandBuilder()
  .setName('invites')
  .setDescription('Tracks who invited who, and how many people each inviter brought into the server')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('[Admin] Credits a user with a new invite, or with one you already made (set "code" for that)')
      .addUserOption((opt) => opt.setName('user').setDescription('Who this invite should be credited to').setRequired(true))
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Which channel the invite opens into (required unless "code" is set)')
          .addChannelTypes(...INVITE_CHANNEL_TYPES)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('code')
          .setDescription('An invite you already made yourself (code or full link) — assigns it instead of creating a new one')
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt.setName('max_uses').setDescription('Max number of times it can be used (optional, default: unlimited; only for a new invite)').setMinValue(1).setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('expires_in_hours')
          .setDescription('Hours until it expires, max 168 (new invite only, default: never)')
          .setMinValue(1)
          .setMaxValue(168)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('expires_at')
          .setDescription('Exact expiry, "YYYY-MM-DD HH:mm" Europe/Rome (new invite only)')
          .setRequired(false)
      )
  )
  .addSubcommand(buildDisableSubcommand())
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Shows the top inviters in this server'))
  .addSubcommand((sub) => sub.setName('list').setDescription('[Mod] Lists every invite currently assigned, and to whom'))
  .addSubcommand((sub) =>
    sub
      .setName('revoke')
      .setDescription('[Admin] Deletes a previously created assigned invite')
      .addStringOption((opt) =>
        opt.setName('code').setDescription('Which assigned invite to revoke (start typing to see active ones)').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription('Shows how many people a specific user invited (defaults to you)')
      .addUserOption((opt) => opt.setName('user').setDescription('Whose invite stats to check').setRequired(false))
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'disable') {
    return handleDisable(interaction);
  }

  switch (sub) {
    case 'create':
      return handleCreate(interaction);
    case 'leaderboard':
      return handleLeaderboard(interaction);
    case 'list':
      return handleList(interaction);
    case 'revoke':
      return handleRevoke(interaction);
    case 'user':
      return handleUser(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

// Powers the "code" option's autocomplete on /invites revoke: only shows invites that
// were assigned via /invites create, not every invite in the server.
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'code') {
    await interaction.respond([]);
    return;
  }

  const assigned = await inviteTrackerManager.getAllAssignedInvites(interaction.guildId);
  const query = focused.value.toLowerCase();

  const choices = assigned
    .map((a) => {
      const member = interaction.guild.members.cache.get(a.assignedUserId);
      const who = member ? member.user.tag : a.assignedUserId;
      return { name: `${a.code} — ${who}`, value: a.code };
    })
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(choices);
}

module.exports = { data, execute, autocomplete };

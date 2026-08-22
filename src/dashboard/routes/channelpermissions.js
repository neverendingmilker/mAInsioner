const express = require('express');
const { ChannelType, PermissionFlagsBits, OverwriteType } = require('discord.js');
const { requireGuild } = require('../guild');

const router = express.Router();

// Permission overwrite editor per canale — a differenza di /roleaudit (sola lettura,
// filtrata ai soli permessi "sensibili"), questa pagina legge/scrive DIRETTAMENTE
// channel.permissionOverwrites, su tutti i permessi rilevanti a livello di canale.
// Nessun manager/repository: come /roleaudit, non c'è stato persistito da noi, lo stato
// vero è quello live su Discord.
//
// Raggruppati come nel pannello "Permessi avanzati" di Discord: generali (sempre),
// testo/voce (solo per il tipo di canale pertinente), moderazione (sempre — Discord
// permette di impostare come override anche permessi come Espelli/Banna).
const GENERAL_PERMISSIONS = [
  { key: 'ViewChannel', label: 'View Channel' },
  { key: 'ManageChannels', label: 'Manage Channel' },
  { key: 'ManageRoles', label: 'Manage Permissions' },
  { key: 'ManageWebhooks', label: 'Manage Webhooks' },
  { key: 'CreateInstantInvite', label: 'Create Invite' },
];

const TEXT_PERMISSIONS = [
  { key: 'SendMessages', label: 'Send Messages' },
  { key: 'SendMessagesInThreads', label: 'Send Messages in Threads' },
  { key: 'CreatePublicThreads', label: 'Create Public Threads' },
  { key: 'CreatePrivateThreads', label: 'Create Private Threads' },
  { key: 'ManageThreads', label: 'Manage Threads' },
  { key: 'EmbedLinks', label: 'Embed Links' },
  { key: 'AttachFiles', label: 'Attach Files' },
  { key: 'AddReactions', label: 'Add Reactions' },
  { key: 'UseExternalEmojis', label: 'Use External Emojis' },
  { key: 'UseExternalStickers', label: 'Use External Stickers' },
  { key: 'MentionEveryone', label: 'Mention @everyone, @here, and All Roles' },
  { key: 'ManageMessages', label: 'Manage Messages' },
  { key: 'PinMessages', label: 'Pin Messages' },
  { key: 'ReadMessageHistory', label: 'Read Message History' },
  { key: 'SendTTSMessages', label: 'Send Text-to-Speech Messages' },
  { key: 'SendVoiceMessages', label: 'Send Voice Messages' },
  { key: 'SendPolls', label: 'Create Polls' },
  { key: 'UseApplicationCommands', label: 'Use Application Commands' },
  { key: 'BypassSlowmode', label: 'Bypass Slowmode' },
];

const VOICE_PERMISSIONS = [
  { key: 'Connect', label: 'Connect' },
  { key: 'Speak', label: 'Speak' },
  { key: 'Stream', label: 'Video' },
  { key: 'UseVAD', label: 'Use Voice Activity' },
  { key: 'PrioritySpeaker', label: 'Priority Speaker' },
  { key: 'RequestToSpeak', label: 'Request to Speak' },
  { key: 'MuteMembers', label: 'Mute Members' },
  { key: 'DeafenMembers', label: 'Deafen Members' },
  { key: 'MoveMembers', label: 'Move Members' },
  { key: 'UseEmbeddedActivities', label: 'Use Activities' },
  { key: 'UseSoundboard', label: 'Use Soundboard' },
  { key: 'UseExternalSounds', label: 'Use External Sounds' },
  { key: 'SetVoiceChannelStatus', label: 'Set Voice Channel Status' },
];

const MOD_PERMISSIONS = [
  { key: 'KickMembers', label: 'Kick Members' },
  { key: 'BanMembers', label: 'Ban Members' },
  { key: 'ManageNicknames', label: 'Manage Nicknames' },
  { key: 'ModerateMembers', label: 'Timeout Members' },
  { key: 'ViewAuditLog', label: 'View Audit Log' },
  { key: 'ManageGuildExpressions', label: 'Manage Expressions (emoji/stickers/sounds)' },
];

const TEXT_KIND_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia];
const VOICE_KIND_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const LISTED_CHANNEL_TYPES = [...TEXT_KIND_TYPES, ...VOICE_KIND_TYPES, ChannelType.GuildCategory];

function channelKind(channel) {
  if (TEXT_KIND_TYPES.includes(channel.type)) return 'text';
  if (VOICE_KIND_TYPES.includes(channel.type)) return 'voice';
  return 'other';
}

function channelIcon(channel) {
  if (channel.type === ChannelType.GuildCategory) return '📁';
  if (VOICE_KIND_TYPES.includes(channel.type)) return '🔊';
  if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) return '🗂️';
  if (channel.type === ChannelType.GuildAnnouncement) return '📣';
  return '#';
}

function groupsForChannel(channel) {
  const kind = channelKind(channel);
  const groups = [{ key: 'general', title: 'General', permissions: GENERAL_PERMISSIONS }];
  if (kind === 'text') groups.push({ key: 'text', title: 'Text', permissions: TEXT_PERMISSIONS });
  if (kind === 'voice') groups.push({ key: 'voice', title: 'Voice', permissions: VOICE_PERMISSIONS });
  groups.push({ key: 'mod', title: 'Moderation', permissions: MOD_PERMISSIONS });
  return groups;
}

function toListItem(channel) {
  return { id: channel.id, name: channel.name, icon: channelIcon(channel) };
}

// Canali senza categoria in cima, poi una categoria dopo l'altra con i suoi figli — stesso
// ordine con cui Discord li mostra nella sidebar del server.
function buildChannelList(guild) {
  const all = [...guild.channels.cache.values()].filter((c) => LISTED_CHANNEL_TYPES.includes(c.type));
  const categories = all.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
  const uncategorized = all
    .filter((c) => c.type !== ChannelType.GuildCategory && !c.parentId)
    .sort((a, b) => a.rawPosition - b.rawPosition);

  const groups = [];
  if (uncategorized.length > 0) groups.push({ category: null, channels: uncategorized.map(toListItem) });
  for (const cat of categories) {
    const children = all
      .filter((c) => c.parentId === cat.id && c.type !== ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition);
    groups.push({ category: toListItem(cat), channels: children.map(toListItem) });
  }
  return groups;
}

function targetInfo(guild, id, type) {
  if (type === OverwriteType.Role) {
    const role = guild.roles.cache.get(id);
    return role ? { id, icon: '🎭', name: role.name } : null;
  }
  const member = guild.members.cache.get(id);
  return member ? { id, icon: '👤', name: member.user.tag } : null;
}

router.get('/channelpermissions', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channelGroups = buildChannelList(guild);
    const rawChannel = req.query.channelId ? guild.channels.cache.get(req.query.channelId) : null;
    const channel = rawChannel && LISTED_CHANNEL_TYPES.includes(rawChannel.type) ? rawChannel : null;

    let targets = [];
    let addableRoles = [];
    let addableMembers = [];
    let selectedTarget = null;
    let overwriteExists = false;
    let permissionGroups = [];

    if (channel) {
      const overwrites = [...channel.permissionOverwrites.cache.values()];
      targets = overwrites
        .map((ow) => ({ ...targetInfo(guild, ow.id, ow.type), type: ow.type }))
        .filter(Boolean)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === OverwriteType.Role ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      const overriddenIds = new Set(overwrites.map((ow) => ow.id));
      addableRoles = [...guild.roles.cache.values()]
        .filter((r) => !overriddenIds.has(r.id))
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name }));
      addableMembers = [...guild.members.cache.values()]
        .filter((m) => !overriddenIds.has(m.id))
        .sort((a, b) => a.user.tag.localeCompare(b.user.tag))
        .map((m) => ({ id: m.id, name: m.user.tag }));

      const selectedOverwriteId = req.query.overwriteId || null;
      if (selectedOverwriteId) {
        const role = guild.roles.cache.get(selectedOverwriteId);
        const member = role ? null : guild.members.cache.get(selectedOverwriteId);
        if (role || member) {
          selectedTarget = role ? { id: role.id, icon: '🎭', name: role.name } : { id: member.id, icon: '👤', name: member.user.tag };
          const existing = channel.permissionOverwrites.cache.get(selectedOverwriteId);
          overwriteExists = Boolean(existing);
          permissionGroups = groupsForChannel(channel).map((g) => ({
            title: g.title,
            rows: g.permissions.map((p) => {
              let state = 'neutral';
              if (existing) {
                if (existing.allow.has(PermissionFlagsBits[p.key])) state = 'allow';
                else if (existing.deny.has(PermissionFlagsBits[p.key])) state = 'deny';
              }
              return { key: p.key, label: p.label, state };
            }),
          }));
        }
      }
    }

    res.render('channelpermissions', {
      title: 'Channel Permissions',
      guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
      channelGroups,
      selectedChannelId: channel ? channel.id : null,
      targets,
      addableRoles,
      addableMembers,
      selectedOverwriteId: selectedTarget ? selectedTarget.id : null,
      selectedTarget,
      overwriteExists,
      permissionGroups,
    });
  } catch (err) {
    next(err);
  }
});

// Salva lo stato dei permessi visibili per questo ruolo/membro. Sottomette sempre un
// valore per OGNI riga mostrata (deny/neutral/allow) — usiamo quindi `edit()`, che crea
// l'override se non esiste ancora (selezionare un ruolo/membro dalla lista "aggiungi" non
// fa alcuna chiamata a Discord finché non si salva la prima volta, evitando un giro a
// vuoto se poi non si tocca nulla).
router.post('/channelpermissions/:channelId/:overwriteId/save', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.params.channelId);
    if (!channel || !LISTED_CHANNEL_TYPES.includes(channel.type)) {
      req.session.flash = { type: 'error', message: 'Channel not found.' };
      res.redirect('/channelpermissions');
      return;
    }

    const { overwriteId } = req.params;
    const target = guild.roles.cache.get(overwriteId) || guild.members.cache.get(overwriteId);
    if (!target) {
      req.session.flash = { type: 'error', message: 'Invalid role or member.' };
      res.redirect(`/channelpermissions?channelId=${channel.id}`);
      return;
    }

    const allPermissions = groupsForChannel(channel).flatMap((g) => g.permissions);
    const botPermissions = guild.members.me ? channel.permissionsFor(guild.members.me) : null;

    const options = {};
    const grantedNotHeld = [];
    for (const p of allPermissions) {
      const value = req.body[p.key];
      if (value === 'allow') {
        // Discord stesso impedisce di concedere un permesso che il bot non possiede lui
        // stesso su quel canale — controllato qui prima per un messaggio d'errore chiaro
        // invece di un 403 grezzo dalla API.
        if (!botPermissions?.has(PermissionFlagsBits[p.key])) {
          grantedNotHeld.push(p.label);
          continue;
        }
        options[p.key] = true;
      } else if (value === 'deny') {
        options[p.key] = false;
      } else {
        options[p.key] = null;
      }
    }

    if (grantedNotHeld.length > 0) {
      req.session.flash = {
        type: 'error',
        message: `The bot doesn't have these permissions on this channel, so it can't grant them: ${grantedNotHeld.join(', ')}.`,
      };
      res.redirect(`/channelpermissions?channelId=${channel.id}&overwriteId=${overwriteId}`);
      return;
    }

    await channel.permissionOverwrites.edit(overwriteId, options);
    req.session.flash = { type: 'success', message: 'Permissions updated.' };
    res.redirect(`/channelpermissions?channelId=${channel.id}&overwriteId=${overwriteId}`);
  } catch (err) {
    next(err);
  }
});

router.post('/channelpermissions/:channelId/:overwriteId/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.params.channelId);
    if (!channel || !LISTED_CHANNEL_TYPES.includes(channel.type)) {
      req.session.flash = { type: 'error', message: 'Channel not found.' };
      res.redirect('/channelpermissions');
      return;
    }

    await channel.permissionOverwrites.delete(req.params.overwriteId);
    req.session.flash = { type: 'success', message: 'Override removed.' };
    res.redirect(`/channelpermissions?channelId=${channel.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

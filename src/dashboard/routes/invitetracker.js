const express = require('express');
const { ChannelType } = require('discord.js');
const { resolveDashboardGuild } = require('../guild');
const inviteTrackerManager = require('../../features/invitetracker/inviteTrackerManager');
const { extractInviteCode } = require('../../commands/invitetracker/handlers/expiryHelpers');

const router = express.Router();

const INVITE_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice];

function requireGuild(req, res) {
  const guild = resolveDashboardGuild(req.client, req.session.guildId);
  if (!guild) {
    res.status(500).render('error', {
      title: 'Server non trovato',
      message: 'Il server selezionato non è più disponibile — esci e accedi di nuovo per sceglierne un altro.',
    });
    return null;
  }
  return guild;
}

function memberLabel(guild, userId) {
  if (!userId) return '(sconosciuto)';
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(utente non più nel server: ${userId})`;
}

async function renderInvitetrackerPage(req, res, guild) {
  const [enabled, defaultChannelId] = await Promise.all([
    inviteTrackerManager.isEnabled(guild.id),
    inviteTrackerManager.getDefaultChannel(guild.id),
  ]);

  // Both of these hit the live Discord API (guild.invites.fetch()/bans aren't needed here,
  // but invites are) via the manager — same cost the /invites leaderboard and /invites
  // list slash commands already pay.
  const leaderboardRows = await inviteTrackerManager.getLeaderboard(guild.id, 10);
  const leaderboard = leaderboardRows.map((r) => ({ label: memberLabel(guild, r.inviterId), total: r.total, current: r.current }));

  let assignedInvites = [];
  try {
    const overview = await inviteTrackerManager.getAssignedInvitesOverview(guild);
    assignedInvites = overview.map((a) => ({
      code: a.code,
      assignedLabel: memberLabel(guild, a.assignedUserId),
      active: a.active,
      uses: a.uses,
      maxUses: a.maxUses,
      expiresLabel: a.expiresTimestamp ? new Date(a.expiresTimestamp).toLocaleString('it-IT') : null,
    }));
  } catch (err) {
    if (!(err instanceof inviteTrackerManager.ValidationError)) throw err;
    // Missing "Manage Server" permission — assertCanTrack throws inside the manager.
    // The empty-state hint below covers this case too, no need for a separate message.
  }

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => INVITE_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const members = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .sort((a, b) => a.user.tag.localeCompare(b.user.tag))
    .map((m) => ({ id: m.id, label: m.user.tag }));

  res.render('invitetracker', {
    title: 'Invite Tracker',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    defaultChannelId,
    textChannels,
    members,
    leaderboard,
    assignedInvites,
  });
}

router.get('/invitetracker', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderInvitetrackerPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/invitetracker/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await inviteTrackerManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Invite Tracker attivato.' : 'Invite Tracker disattivato.' };
    res.redirect('/invitetracker');
  } catch (err) {
    next(err);
  }
});

router.post('/invitetracker/channel', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Canale non valido — riprova.' };
      res.redirect('/invitetracker');
      return;
    }

    await inviteTrackerManager.setDefaultChannel(guild.id, channel.id);
    req.session.flash = { type: 'success', message: `Nuovi inviti apriranno in #${channel.name}.` };
    res.redirect('/invitetracker');
  } catch (err) {
    next(err);
  }
});

// Two modes, same as /invites create: a `code` assigns/credits an invite that already
// exists (max_uses/expiry don't apply then, they're ignored — same validation as the
// slash command), no code creates a brand new one into the configured default channel.
router.post('/invitetracker/create', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const member = guild.members.cache.get(req.body.userId);
    if (!member) {
      req.session.flash = { type: 'error', message: 'Utente non valido — riprova.' };
      res.redirect('/invitetracker');
      return;
    }

    const rawCode = req.body.code?.trim();
    const maxUsesRaw = req.body.maxUses?.trim();
    const expiresInHoursRaw = req.body.expiresInHours?.trim();

    try {
      if (rawCode) {
        if (maxUsesRaw || expiresInHoursRaw) {
          req.session.flash = { type: 'error', message: 'Utilizzi massimi e scadenza non si applicano quando assegni un invito già esistente.' };
          res.redirect('/invitetracker');
          return;
        }
        const code = extractInviteCode(rawCode);
        await inviteTrackerManager.assignExistingInvite(guild, code, member.user, req.session.user.id);
        req.session.flash = { type: 'success', message: `Invito "${code}" assegnato a ${member.user.tag}.` };
      } else {
        const defaultChannelId = await inviteTrackerManager.getDefaultChannel(guild.id);
        const targetChannel = defaultChannelId && guild.channels.cache.get(defaultChannelId);
        if (!targetChannel) {
          req.session.flash = { type: 'error', message: 'Configura prima un canale predefinito per gli inviti.' };
          res.redirect('/invitetracker');
          return;
        }

        const maxUses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : undefined;
        const maxAgeSeconds = expiresInHoursRaw ? parseInt(expiresInHoursRaw, 10) * 3600 : undefined;

        const invite = await inviteTrackerManager.createAssignedInvite(
          guild,
          targetChannel,
          member.user,
          { maxUses, maxAgeSeconds },
          req.session.user.id
        );
        req.session.flash = { type: 'success', message: `Invito "${invite.code}" creato per ${member.user.tag}.` };
      }
    } catch (err) {
      if (err instanceof inviteTrackerManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/invitetracker');
  } catch (err) {
    next(err);
  }
});

router.post('/invitetracker/revoke', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    await inviteTrackerManager.revokeAssignedInvite(guild, req.body.code);
    req.session.flash = { type: 'success', message: 'Invito revocato.' };
    res.redirect('/invitetracker');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

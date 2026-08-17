const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const bumpReminderManager = require('../../features/bumpreminder/bumpReminderManager');

const router = express.Router();

const BUMPREMINDER_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function memberLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `<@${userId}>`;
}

async function renderBumpReminderPage(req, res, guild) {
  const [enabled, config] = await Promise.all([
    bumpReminderManager.isEnabled(guild.id),
    bumpReminderManager.getConfig(guild.id),
  ]);

  const channel = config.channel_id ? guild.channels.cache.get(config.channel_id) : null;
  const role = config.role_id ? guild.roles.cache.get(config.role_id) : null;

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => BUMPREMINDER_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));

  res.render('bumpreminder', {
    title: 'Bump Reminder',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    config: {
      channelId: config.channel_id,
      roleId: config.role_id,
    },
    channelName: config.channel_id ? (channel ? `#${channel.name}` : `(canale eliminato: ${config.channel_id})`) : null,
    roleName: config.role_id ? (role ? role.name : `(ruolo eliminato: ${config.role_id})`) : null,
    nextReminderAt: config.next_reminder_at,
    lastBumpedBy: config.last_bumped_by ? memberLabel(guild, config.last_bumped_by) : null,
    textChannels,
    roles,
  });
}

router.get('/bumpreminder', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderBumpReminderPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/bumpreminder/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await bumpReminderManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Bump Reminder attivato.' : 'Bump Reminder disattivato.' };
    res.redirect('/bumpreminder');
  } catch (err) {
    next(err);
  }
});

// Canale e ruolo applicati ciascuno nel proprio try/catch — se uno fallisce l'altro viene
// comunque salvato, stesso approccio già usato da /qotd config.
router.post('/bumpreminder/config', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const errors = [];

    const channelId = req.body.channelId || null;
    if (channelId) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        errors.push('Canale non valido.');
      } else {
        try {
          await bumpReminderManager.setChannel(guild, channel);
        } catch (err) {
          if (err instanceof bumpReminderManager.ValidationError) errors.push(err.message);
          else throw err;
        }
      }
    }

    // Selezione vuota = rimuovi il ping (il ruolo è opzionale).
    const roleId = req.body.roleId || null;
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    if (roleId && !role) {
      errors.push('Ruolo non valido.');
    } else {
      await bumpReminderManager.setRole(guild.id, role);
    }

    req.session.flash = errors.length > 0 ? { type: 'error', message: errors.join(' ') } : { type: 'success', message: 'Configurazione aggiornata.' };
    res.redirect('/bumpreminder');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const { ChannelType } = require('discord.js');
const { requireGuild } = require('../guild');
const honeypotManager = require('../../features/honeypot/honeypotManager');

const router = express.Router();

const RECENT_KICKS_LIMIT = 20;
const HONEYPOT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function channelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `#${channel.name}` : `(deleted channel: ${channelId})`;
}

async function renderHoneypotPage(req, res, guild) {
  const [enabled, channelRows, { total: kickTotal, recent }] = await Promise.all([
    honeypotManager.isEnabled(guild.id),
    honeypotManager.listChannels(guild.id),
    honeypotManager.getKickLog(guild.id, RECENT_KICKS_LIMIT),
  ]);

  // Bait text and button label live only on the Discord message itself (see
  // getChannelDetails) — fetched fresh per channel so the edit form always starts from
  // what's actually posted right now, not a possibly-stale copy.
  const channels = await Promise.all(
    channelRows.map(async (c) => {
      const details = await honeypotManager.getChannelDetails(guild, c.channelId);
      return {
        channelId: c.channelId,
        channelName: channelLabel(guild, c.channelId),
        emoji: c.emoji,
        messageMissing: details?.messageMissing ?? true,
        messageText: details?.messageText ?? '',
        buttonLabel: details?.buttonLabel || honeypotManager.DEFAULT_BUTTON_LABEL,
      };
    })
  );

  const textChannels = [...guild.channels.cache.values()]
    .filter((c) => HONEYPOT_CHANNEL_TYPES.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: `#${c.name}` }));

  // Fed to the dashboard's emoji picker so it can offer the server's own custom emoji
  // alongside the default unicode set — `mention` is the exact Discord mention-string
  // format (`<:name:id>` / `<a:name:id>`) that message.react() already accepts as-is.
  const guildEmojis = [...guild.emojis.cache.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      name: e.name,
      url: e.imageURL({ size: 32, extension: e.animated ? 'gif' : 'png' }),
      mention: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`,
    }));

  res.render('honeypot', {
    title: 'Honeypot',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    channels,
    textChannels,
    guildEmojis,
    defaultMessage: honeypotManager.DEFAULT_MESSAGE,
    defaultButtonLabel: honeypotManager.DEFAULT_BUTTON_LABEL,
    kickTotal,
    recentKicks: recent.map((k) => ({
      userTag: k.userTag || k.userId,
      channelName: channelLabel(guild, k.channelId),
      trigger: k.trigger,
      when: new Date(k.kickedAt).toLocaleString('en-GB'),
    })),
  });
}

router.get('/honeypot', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderHoneypotPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await honeypotManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Honeypot enabled.' : 'Honeypot disabled.' };
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/add', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) {
      req.session.flash = { type: 'error', message: 'Invalid channel — try again.' };
      res.redirect('/honeypot');
      return;
    }

    try {
      await honeypotManager.addChannel(
        guild,
        channel,
        req.body.message?.trim() || null,
        req.body.buttonLabel?.trim() || null,
        req.session.user.id,
        req.body.emoji?.trim() || null
      );
      req.session.flash = { type: 'success', message: `Trap created in #${channel.name}.` };
    } catch (err) {
      if (err instanceof honeypotManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/edit', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const currentChannelId = req.body.currentChannelId;
    const targetChannel = guild.channels.cache.get(req.body.channelId);
    if (!targetChannel) {
      req.session.flash = { type: 'error', message: 'Invalid channel — try again.' };
      res.redirect('/honeypot');
      return;
    }

    try {
      await honeypotManager.editChannel(guild, currentChannelId, {
        targetChannel,
        messageText: req.body.message?.trim() || null,
        buttonLabel: req.body.buttonLabel?.trim() || null,
        emoji: req.body.emoji?.trim() || null,
        editedBy: req.session.user.id,
      });
      req.session.flash =
        targetChannel.id === currentChannelId
          ? { type: 'success', message: 'Trap updated — the message in the channel has already changed.' }
          : { type: 'success', message: `Trap moved to #${targetChannel.name}.` };
    } catch (err) {
      if (err instanceof honeypotManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

router.post('/honeypot/remove', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    try {
      await honeypotManager.removeChannel(guild, req.body.channelId);
      req.session.flash = { type: 'success', message: 'Trap removed.' };
    } catch (err) {
      if (err instanceof honeypotManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/honeypot');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

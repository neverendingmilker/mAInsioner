const express = require('express');
const { requireGuild } = require('../guild');
const serverBackupManager = require('../../features/serverbackup/serverBackupManager');

const router = express.Router();

function memberLabel(guild, userId) {
  if (!userId) return '(unknown)';
  const member = guild.members.cache.get(userId);
  return member ? member.user.tag : `(user no longer in the server: ${userId})`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('en-GB');
}

// listSnapshots() is deliberately NOT guild-scoped in the manager (a backup is meant to
// be restorable onto a different server than the one it came from) — the dashboard
// scopes it down to "backups taken on THIS server" for its own list/restore views, so an
// admin of guild B never sees or restores guild A's backup from here. Cross-server
// restore is still possible via the Discord slash command, just not exposed on the web.
async function ownSnapshots(guild) {
  const all = await serverBackupManager.listSnapshots();
  return all.filter((s) => s.sourceGuildId === guild.id);
}

async function findOwnSnapshot(guild, id) {
  const snapshots = await ownSnapshots(guild);
  return snapshots.find((s) => s.id === id) || null;
}

async function renderServerbackupPage(req, res, guild) {
  const [enabled, snapshots] = await Promise.all([serverBackupManager.isEnabled(guild.id), ownSnapshots(guild)]);

  const snapshotCards = await Promise.all(
    snapshots.map(async (s) => ({
      id: s.id,
      label: s.label || `(no label)`,
      createdByLabel: memberLabel(guild, s.createdBy),
      createdAtLabel: formatDate(s.createdAt),
      assetCounts: await serverBackupManager.getAssetCounts(s.id),
    }))
  );

  res.render('serverbackup', {
    title: 'Server Backup',
    guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
    enabled,
    snapshots: snapshotCards,
    scopes: serverBackupManager.SCOPES,
  });
}

router.get('/serverbackup', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (guild) await renderServerbackupPage(req, res, guild);
  } catch (err) {
    next(err);
  }
});

router.post('/serverbackup/toggle', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const enabled = req.body.enabled === 'true';
    await serverBackupManager.setEnabled(guild.id, enabled);
    req.session.flash = { type: 'success', message: enabled ? 'Server Backup enabled.' : 'Server Backup disabled.' };
    res.redirect('/serverbackup');
  } catch (err) {
    next(err);
  }
});

// Downloads emoji/sticker/soundboard files sequentially when scope includes assets —
// can take a while on a server with a lot of them (see serverBackupManager.captureAssets).
// Kept as one blocking request/response for simplicity, same tradeoff the Discord slash
// command makes (it just shows a "thinking..." defer instead of a spinner).
router.post('/serverbackup/create', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const scope = req.body.scope;
    const label = req.body.label?.trim() || null;

    try {
      const result = await serverBackupManager.createSnapshot(guild, label, req.session.user.id, scope);
      req.session.flash = {
        type: 'success',
        message: `Backup #${result.id} created: ${result.roleCount} roles, ${result.categoryCount} categories, ${result.channelCount} channels, ${result.assetCounts.emoji} emoji, ${result.assetCounts.sticker} stickers, ${result.assetCounts.soundboard} soundboard sounds.`,
      };
    } catch (err) {
      if (err instanceof serverBackupManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/serverbackup');
  } catch (err) {
    next(err);
  }
});

router.post('/serverbackup/:id/sync', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const id = Number(req.params.id);
    const snapshot = await findOwnSnapshot(guild, id);
    if (!snapshot) {
      req.session.flash = { type: 'error', message: 'Backup not found.' };
      res.redirect('/serverbackup');
      return;
    }

    try {
      const result = await serverBackupManager.syncMembers(guild, id, req.session.user.id);
      req.session.flash = {
        type: 'success',
        message: `Role sync complete: ${result.members.updated.length} updated, ${result.members.noChangeNeeded} already up to date, ${result.members.notYetJoined} not yet in the server, ${result.members.failed.length} failed.`,
      };
    } catch (err) {
      if (err instanceof serverBackupManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/serverbackup');
  } catch (err) {
    next(err);
  }
});

// Preview step — shown before an actual restore, so the admin can see which
// bot/integration/booster roles are missing (and would cause some channel overwrites to
// be silently dropped) before committing. Mirrors the slash command's confirmation
// button, just as its own page instead of an interactive component.
router.get('/serverbackup/:id/restore', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const id = Number(req.params.id);
    const snapshot = await findOwnSnapshot(guild, id);
    if (!snapshot) {
      req.session.flash = { type: 'error', message: 'Backup not found.' };
      res.redirect('/serverbackup');
      return;
    }

    const selectedScope = req.query.scope || 'all';

    try {
      const preview = await serverBackupManager.previewRestore(guild, id, selectedScope);
      res.render('serverbackupRestore', {
        title: 'Restore backup',
        guild: { name: guild.name, iconURL: guild.iconURL({ size: 64 }) },
        snapshotId: id,
        selectedScope,
        scopes: serverBackupManager.SCOPES,
        preview,
      });
    } catch (err) {
      if (err instanceof serverBackupManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
        res.redirect('/serverbackup');
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// The actual mutating action — never deletes/overwrites anything (additive only, matched
// by name), but does create real roles/channels/assets and reassign member roles, so this
// is only reachable via the confirmation page above, never directly from the list.
router.post('/serverbackup/:id/restore', async (req, res, next) => {
  try {
    const guild = requireGuild(req, res);
    if (!guild) return;

    const id = Number(req.params.id);
    const snapshot = await findOwnSnapshot(guild, id);
    if (!snapshot) {
      req.session.flash = { type: 'error', message: 'Backup not found.' };
      res.redirect('/serverbackup');
      return;
    }

    const scope = req.body.scope;

    try {
      const summary = await serverBackupManager.restoreSnapshot(guild, id, req.session.user.id, scope);
      const parts = [];
      if (summary.roles) parts.push(`roles: ${summary.roles.created.length} created, ${summary.roles.skipped} already present, ${summary.roles.failed.length} failed`);
      if (summary.categories) parts.push(`categories: ${summary.categories.created.length} created, ${summary.categories.skipped} already present, ${summary.categories.failed.length} failed`);
      if (summary.channels) parts.push(`channels: ${summary.channels.created.length} created, ${summary.channels.skipped} already present, ${summary.channels.failed.length} failed`);
      if (summary.emoji) parts.push(`emoji: ${summary.emoji.created.length} created, ${summary.emoji.skipped} already present, ${summary.emoji.failed.length} failed`);
      if (summary.stickers) parts.push(`stickers: ${summary.stickers.created.length} created, ${summary.stickers.skipped} already present, ${summary.stickers.failed.length} failed`);
      if (summary.soundboard) parts.push(`soundboard: ${summary.soundboard.created.length} created, ${summary.soundboard.skipped} already present, ${summary.soundboard.failed.length} failed`);
      if (summary.members) parts.push(`members: ${summary.members.updated.length} updated, ${summary.members.notYetJoined} not yet in the server`);
      if (summary.positionWarning) parts.push(`⚠️ ${summary.positionWarning}`);

      req.session.flash = { type: 'success', message: `Restore complete — ${parts.join(' · ')}` };
    } catch (err) {
      if (err instanceof serverBackupManager.ValidationError) {
        req.session.flash = { type: 'error', message: err.message };
      } else {
        throw err;
      }
    }
    res.redirect('/serverbackup');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

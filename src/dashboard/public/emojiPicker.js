// Vanilla-JS emoji picker, no dependencies. Attaches to every ".emoji-field" on the
// page (there can be several: one per trap's edit form, plus the add form) and fills
// that field's text input with either a plain unicode emoji or, for a server's own
// custom emoji, Discord's mention-string format ("<:name:id>" / "<a:name:id>") — the
// same format honeypotManager already accepts with zero backend changes (see
// resolvePartialEmoji in discord.js).
(function () {
  // Curated set of common default emoji, grouped for a "browse" experience plus a
  // search box. Not exhaustive (there are 3000+ unicode emoji) — this covers the
  // categories people actually reach for for a honeypot bait reaction.
  var DEFAULT_EMOJI = {
    'Faccine': ['😀', '😄', '😂', '🤣', '😊', '🙂', '😉', '😍', '😘', '😜', '🤔', '😐', '😴', '🤯', '🥳', '😭', '😱', '😡', '🤬', '🥶', '🥵', '😎', '🤫', '🤐', '🙄', '😇', '🤡', '👻', '💀', '☠️'],
    'Gesti e persone': ['👍', '👎', '👏', '🙌', '🙏', '👋', '✌️', '🤞', '🤙', '💪', '👀', '🧠', '🗣️', '👤', '🕵️', '🧑‍💻'],
    'Animali': ['🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🐸', '🐵', '🦁', '🐯', '🦄', '🐍', '🐢', '🦇', '🦉', '🐺', '🐔', '🐙', '🦈', '🐝'],
    'Cibo': ['🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍪', '🎂', '🍫', '🍭', '🍎', '🍌', '🍉', '🍇', '🥑', '☕', '🍺', '🍷', '🧃'],
    'Attività': ['⚽', '🏀', '🎮', '🎲', '🎯', '🎸', '🎧', '🎤', '🎨', '🧩', '🏆', '🥇', '🎳', '🏹'],
    'Viaggi': ['🚗', '🚕', '🚀', '✈️', '🚁', '⛵', '🚲', '🏝️', '🗺️', '🧭', '🌍', '🏔️', '🌋', '🏰'],
    'Oggetti': ['💻', '📱', '📷', '🔦', '🔑', '🔒', '🔓', '💣', '⚙️', '🧰', '📦', '💰', '💎', '🕹️', '📌', '📎', '✏️', '📝', '🔍'],
    'Simboli e allarmi': ['⚠️', '⛔', '🚫', '❌', '✅', '❗', '❓', '💯', '🔥', '⭐', '✨', '💥', '⚡', '🎯', '🚨', '☢️', '☣️', '♻️', '🆘', '🔞'],
  };

  var GUILD_EMOJI_SCRIPT_ID = 'honeypot-guild-emojis';

  function getGuildEmojis() {
    var el = document.getElementById(GUILD_EMOJI_SCRIPT_ID);
    if (!el) return [];
    try {
      return JSON.parse(el.textContent) || [];
    } catch (err) {
      return [];
    }
  }

  function closeAllPanels(except) {
    document.querySelectorAll('.emoji-picker-panel').forEach(function (panel) {
      if (panel !== except) panel.hidden = true;
    });
  }

  function buildPanelContent(panel, guildEmojis) {
    var search = document.createElement('input');
    search.type = 'text';
    search.className = 'emoji-picker-search';
    search.placeholder = 'Cerca emoji…';
    panel.appendChild(search);

    var grid = document.createElement('div');
    grid.className = 'emoji-picker-grid';
    panel.appendChild(grid);

    function addButton(value, display, label, isImg) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-picker-item';
      btn.dataset.value = value;
      btn.dataset.label = label.toLowerCase();
      btn.title = label;
      if (isImg) {
        var img = document.createElement('img');
        img.src = display;
        img.alt = label;
        btn.appendChild(img);
      } else {
        btn.textContent = display;
      }
      grid.appendChild(btn);
    }

    if (guildEmojis.length > 0) {
      var heading = document.createElement('div');
      heading.className = 'emoji-picker-heading';
      heading.textContent = 'Emoji del server';
      grid.appendChild(heading);
      guildEmojis.forEach(function (e) {
        addButton(e.mention, e.url, e.name, true);
      });
    }

    Object.keys(DEFAULT_EMOJI).forEach(function (category) {
      var heading = document.createElement('div');
      heading.className = 'emoji-picker-heading';
      heading.textContent = category;
      grid.appendChild(heading);
      DEFAULT_EMOJI[category].forEach(function (char) {
        addButton(char, char, category, false);
      });
    });

    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      grid.querySelectorAll('.emoji-picker-item').forEach(function (btn) {
        btn.style.display = !q || btn.dataset.label.indexOf(q) !== -1 || btn.dataset.value.indexOf(q) !== -1 ? '' : 'none';
      });
      grid.querySelectorAll('.emoji-picker-heading').forEach(function (h) {
        h.style.display = q ? 'none' : '';
      });
    });
  }

  function initEmojiField(field) {
    var input = field.querySelector('.emoji-text-input');
    var toggle = field.querySelector('.emoji-picker-toggle');
    var panel = field.querySelector('.emoji-picker-panel');
    if (!input || !toggle || !panel) return;

    var built = false;

    toggle.addEventListener('click', function (evt) {
      evt.stopPropagation();
      if (!panel.hidden) {
        panel.hidden = true;
        return;
      }
      if (!built) {
        buildPanelContent(panel, getGuildEmojis());
        built = true;
      }
      closeAllPanels(panel);
      panel.hidden = false;
      var search = panel.querySelector('.emoji-picker-search');
      if (search) search.focus();
    });

    panel.addEventListener('click', function (evt) {
      var btn = evt.target.closest('.emoji-picker-item');
      if (!btn) return;
      input.value = btn.dataset.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      panel.hidden = true;
    });

    panel.addEventListener('click', function (evt) {
      evt.stopPropagation();
    });
  }

  document.addEventListener('click', function () {
    closeAllPanels(null);
  });

  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') closeAllPanels(null);
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.emoji-field').forEach(initEmojiField);
  });
})();

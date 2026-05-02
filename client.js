/* eslint-disable no-undef */
// LOCATION FLOW — Trello Power-Up
// Читає стан кожної картки з Supabase і малює кольоровий бейдж:
//   🟢 working — активна сесія, є зміни таймлайна за 3 хв
//   🟠 idle    — активна сесія, але без активності в Premiere
//   🟡 break   — активна сесія, монтажер на свідомій перерві
//   🔴 no_work — сесії немає
//
// Сесії стартують/зупиняються виключно з Premiere плагіна (LOCATION FLOW).
// Цей Power-Up — read-only, нічого не пише.

var SUPABASE_URL = 'https://xyoinglfguigfzrgaibg.supabase.co';
var SUPABASE_KEY = 'sb_publishable_W1lF3V80JqrvqNWPMdkblg_BjUGPOin';

// ────────── Утиліти

function formatHMS(sec) {
  if (!sec || sec < 0) sec = 0;
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = Math.floor(sec % 60);
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function formatHM(sec) {
  if (!sec || sec < 0) sec = 0;
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  return h + 'г ' + String(m).padStart(2, '0') + 'хв';
}

function shortName(fullName) {
  if (!fullName) return '';
  var parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[1].charAt(0) + '.';
}

// ────────── Supabase RPC

function fetchCardStatus(cardId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/get_card_status', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_trello_card_id: cardId })
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (rows) {
      if (!rows || !rows.length) return null;
      return rows[0];
    });
}

// ────────── Побудова бейджів

// Колір за статусом
function colorOf(status) {
  if (status === 'working') return 'green';
  if (status === 'idle') return 'orange';
  if (status === 'break') return 'yellow';
  return 'red'; // no_work
}

// Бейдж на лицьовій частині картки (у списку колонки) — компактний
function buildSmallBadges(s) {
  if (!s) return [];

  var name = shortName(s.monteur_full_name);

  if (s.status === 'working') {
    var startedAt = new Date(s.session_started_at).getTime();
    return [{
      dynamic: function () {
        var elapsed = Math.floor((Date.now() - startedAt) / 1000);
        return {
          text: '▶ ' + name + ' · ' + formatHMS(elapsed),
          color: 'green',
          refresh: 30
        };
      }
    }];
  }

  if (s.status === 'idle') {
    return [{ text: '💤 ' + name, color: 'orange', refresh: 30 }];
  }

  if (s.status === 'break') {
    return [{ text: '☕ ' + name, color: 'yellow', refresh: 30 }];
  }

  // no_work — маленька червона точка, без тексту, не засмічує борд
  return [{ text: '·', color: 'red', refresh: 60 }];
}

// Бейджі у відкритій картці — детальніше
function buildDetailBadges(s) {
  if (!s) return [];

  var name = shortName(s.monteur_full_name);
  var totalText = '⏱ Загалом ' + formatHM(s.total_card_sec || 0);

  if (s.status === 'working') {
    var startedAt = new Date(s.session_started_at).getTime();
    return [
      {
        title: 'Активна сесія',
        dynamic: function () {
          var elapsed = Math.floor((Date.now() - startedAt) / 1000);
          return {
            title: 'Активна сесія',
            text: '▶ ' + name + ' · ' + formatHMS(elapsed),
            color: 'green',
            refresh: 30
          };
        }
      },
      { title: 'Загальний час по картці', text: totalText, color: 'blue' }
    ];
  }

  if (s.status === 'idle') {
    return [
      { title: 'Бездіє', text: '💤 ' + name + ' (без активності >3 хв)', color: 'orange', refresh: 30 },
      { title: 'Загальний час по картці', text: totalText, color: 'blue' }
    ];
  }

  if (s.status === 'break') {
    return [
      { title: 'Перерва', text: '☕ ' + name + ' на перерві', color: 'yellow', refresh: 30 },
      { title: 'Загальний час по картці', text: totalText, color: 'blue' }
    ];
  }

  // no_work
  var badges = [{ title: 'Не в роботі', text: '🔴 Не в роботі', color: 'red' }];
  if (s.total_card_sec > 0) {
    badges.push({ title: 'Загальний час по картці', text: totalText, color: 'blue' });
  }
  return badges;
}

// ────────── Капабіліті Trello Power-Up

window.TrelloPowerUp.initialize({

  // Маленькі бейджі на картці у списку
  'card-badges': function (t) {
    return t.card('id').then(function (card) {
      return fetchCardStatus(card.id)
        .then(buildSmallBadges)
        .catch(function () { return []; });
    });
  },

  // Великі бейджі справа у відкритій картці
  'card-detail-badges': function (t) {
    return t.card('id').then(function (card) {
      return fetchCardStatus(card.id)
        .then(buildDetailBadges)
        .catch(function (err) {
          return [{ title: 'LOCATION FLOW', text: 'Помилка: ' + err.message, color: 'red' }];
        });
    });
  },

  // Секція "LOCATION FLOW" всередині картки
  'card-back-section': function (t) {
    return {
      title: 'LOCATION FLOW',
      icon: './icon.svg',
      content: {
        type: 'iframe',
        url: t.signUrl('./section.html'),
        height: 280
      }
    };
  }
});

/* eslint-disable no-undef */
// LOCATION FLOW — Trello Power-Up
// Read-only бейдж стану картки з Supabase.
// 3 кольори:
//   🟢 working — монтажер реально працює (зелений + ім'я + таймер)
//   🟡 break / idle — пауза (жовтий + ім'я + ☕/💤 + таймер)
//   🔴 no_work — нічого не відбувається (червоний)

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

// Один лайв-таймер з кольоровою точкою
function liveTimerBadge(prefix, name, secondaryEmoji, color, startedAtIso) {
  var startedAt = new Date(startedAtIso).getTime();
  return {
    dynamic: function () {
      var elapsed = Math.floor((Date.now() - startedAt) / 1000);
      var icon = secondaryEmoji ? secondaryEmoji + ' ' : '';
      return {
        text: prefix + ' ' + name + ' · ' + icon + formatHMS(elapsed),
        color: color,
        refresh: 1
      };
    }
  };
}

// Бейдж на лицьовій частині картки (у списку колонки) — компактний
function buildSmallBadges(s) {
  if (!s) return [];

  var name = shortName(s.monteur_full_name);

  if (s.status === 'working') {
    return [liveTimerBadge('🟢', name, null, 'green', s.session_started_at)];
  }

  if (s.status === 'idle') {
    return [liveTimerBadge('🟡', name, '💤', 'yellow', s.session_started_at)];
  }

  if (s.status === 'break') {
    return [liveTimerBadge('🟡', name, '☕', 'yellow', s.session_started_at)];
  }

  // no_work — червоний бейдж "Вільна"
  return [{ text: '🔴 Вільна', color: 'red' }];
}

// Бейджі у відкритій картці — детальніше + загальний час
function buildDetailBadges(s) {
  if (!s) return [];

  var name = shortName(s.monteur_full_name);
  var totalText = '⏱ Загалом ' + formatHM(s.total_card_sec || 0);
  var totalBadge = { title: 'Загальний час по картці', text: totalText, color: 'blue' };

  if (s.status === 'working') {
    var b = liveTimerBadge('🟢', name, null, 'green', s.session_started_at);
    b.title = 'Активна сесія';
    return [b, totalBadge];
  }

  if (s.status === 'idle') {
    var b2 = liveTimerBadge('🟡', name, '💤', 'yellow', s.session_started_at);
    b2.title = 'Бездіє (без активності в Premiere >3 хв)';
    return [b2, totalBadge];
  }

  if (s.status === 'break') {
    var b3 = liveTimerBadge('🟡', name, '☕', 'yellow', s.session_started_at);
    b3.title = 'На перерві';
    return [b3, totalBadge];
  }

  // no_work
  var badges = [{ title: 'Картка не в роботі', text: '🔴 Вільна', color: 'red' }];
  if (s.total_card_sec > 0) badges.push(totalBadge);
  return badges;
}

// ────────── Capability'и Trello Power-Up

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

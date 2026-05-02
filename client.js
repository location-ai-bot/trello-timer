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

// Формат хвилин для компактних бейджів (Hг ММхв)
function formatBadgeTime(sec) {
  if (!sec || sec < 0) sec = 0;
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + 'г ' + String(m).padStart(2, '0') + 'хв';
  return m + ' хв';
}

// Лайв-бейдж для активної сесії — формат однакової довжини: "🟢 Ім'я · 1г 23хв"
function liveTimerBadge(prefix, name, secondaryEmoji, color, startedAtIso, currentStatus) {
  var startedAt = new Date(startedAtIso).getTime();
  return {
    dynamic: function () {
      var elapsed = Math.floor((Date.now() - startedAt) / 1000);
      var icon = secondaryEmoji ? ' ' + secondaryEmoji : '';
      var statusPart = currentStatus ? ' · ' + currentStatus : '';
      return {
        text: prefix + ' ' + name + icon + ' · ' + formatBadgeTime(elapsed) + statusPart,
        color: color,
        refresh: 30
      };
    }
  };
}

// Бейдж на лицьовій частині картки. Уніфікована довжина:
// 🟢 Oleh R. · 1г 23хв        (working)
// 🟡 Oleh R. 💤 · 1г 23хв      (idle)
// 🟡 Oleh R. ☕ · 1г 23хв      (break)
// 🔴 Вільна                    (no work — компактно, не засмічує)
function buildSmallBadges(s) {
  if (!s) return [];

  var name = shortName(s.monteur_full_name);
  var stage = s.current_status || null;

  if (s.status === 'working') {
    return [liveTimerBadge('🟢', name, null, 'green', s.session_started_at, stage)];
  }

  if (s.status === 'idle') {
    return [liveTimerBadge('🟡', name, '💤', 'yellow', s.session_started_at, stage)];
  }

  if (s.status === 'break') {
    return [liveTimerBadge('🟡', name, '☕', 'yellow', s.session_started_at, stage)];
  }

  // no_work — короткий червоний + опційно етап якщо хтось встановив
  if (stage) return [{ text: '🔴 ' + stage, color: 'red' }];
  return [{ text: '🔴 Вільна', color: 'red' }];
}

// Бейджі у відкритій картці — детальніше + загальний час
function buildDetailBadges(s) {
  if (!s) return [];

  var name = shortName(s.monteur_full_name);
  var stage = s.current_status || null;
  var totalText = '⏱ Загалом ' + formatHM(s.total_card_sec || 0);
  var totalBadge = { title: 'Загальний час по картці', text: totalText, color: 'blue' };
  var stageBadge = stage ? { title: 'Етап роботи', text: '📋 ' + stage, color: 'sky' } : null;

  function withExtras(arr) {
    if (stageBadge) arr.push(stageBadge);
    arr.push(totalBadge);
    return arr;
  }

  if (s.status === 'working') {
    var b = liveTimerBadge('🟢', name, null, 'green', s.session_started_at, stage);
    b.title = 'Активна сесія';
    return withExtras([b]);
  }

  if (s.status === 'idle') {
    var b2 = liveTimerBadge('🟡', name, '💤', 'yellow', s.session_started_at, stage);
    b2.title = 'Бездіє (без активності в Premiere >3 хв)';
    return withExtras([b2]);
  }

  if (s.status === 'break') {
    var b3 = liveTimerBadge('🟡', name, '☕', 'yellow', s.session_started_at, stage);
    b3.title = 'На перерві';
    return withExtras([b3]);
  }

  // no_work
  var badges = [{ title: 'Картка не в роботі', text: '🔴 Вільна', color: 'red' }];
  if (stageBadge) badges.push(stageBadge);
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

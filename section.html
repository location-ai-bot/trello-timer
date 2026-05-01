/* eslint-disable no-undef */
// UI-логіка секції "Тайм-трекер" (рендериться як iframe всередині картки)
// v2: immutable update + debug-блок

var t = window.TrelloPowerUp.iframe();
var tickInterval = null;

function formatHMS(sec) {
  if (!sec || sec < 0) sec = 0;
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = Math.floor(sec % 60);
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ms) {
  try {
    var d = new Date(ms);
    return d.toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
}

function normalizeSessions(raw) {
  // Захист від невідомого формату storage (масив, обʼєкт-як-масив, null)
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    // Trello іноді повертає arrays as object with numeric keys
    var out = [];
    Object.keys(raw).forEach(function (k) {
      if (raw[k] && typeof raw[k] === 'object') out.push(raw[k]);
    });
    return out;
  }
  return [];
}

function totalFromSessions(sessions) {
  var list = normalizeSessions(sessions);
  var total = 0;
  for (var i = 0; i < list.length; i++) total += list[i].durationSec || 0;
  return total;
}

function renderUI(active, sessionsRaw) {
  var sessions = normalizeSessions(sessionsRaw);
  var totalSec = totalFromSessions(sessions);

  var btn = document.getElementById('toggle');
  var elapsedEl = document.getElementById('elapsed');
  var totalEl = document.getElementById('total');
  var listEl = document.getElementById('sessions');
  var summaryEl = document.getElementById('sessions-summary');
  var debugEl = document.getElementById('debug');

  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  if (active && active.startedAt) {
    btn.textContent = '⏸ Стоп';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-danger');

    var tick = function () {
      var sec = Math.floor((Date.now() - active.startedAt) / 1000);
      elapsedEl.textContent = '▶ ' + formatHMS(sec);
    };
    tick();
    tickInterval = setInterval(tick, 1000);
  } else {
    btn.textContent = '▶ Старт';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-danger');
    elapsedEl.textContent = '';
  }

  totalEl.textContent = 'Загальний час: ' + formatHMS(totalSec) + ' · сесій: ' + sessions.length;

  if (summaryEl) {
    summaryEl.textContent = 'Останні сесії (' + sessions.length + ')';
  }

  if (sessions.length === 0) {
    listEl.innerHTML = '<li class="muted">Сесій ще не було</li>';
  } else {
    var recent = sessions.slice(-10).reverse();
    listEl.innerHTML = recent
      .map(function (s) {
        return (
          '<li><b>' +
          escapeHtml(s.memberName || 'Невідомо') +
          '</b> · ' +
          formatHMS(s.durationSec) +
          ' <span class="muted">(' +
          formatDate(s.endedAt) +
          ')</span></li>'
        );
      })
      .join('');
  }

  if (debugEl) {
    debugEl.textContent =
      'DEBUG · Raw sessions у storage:\n' +
      JSON.stringify(sessionsRaw, null, 2);
  }

  t.sizeTo('#root');
}

function render() {
  return Promise.all([
    t.get('card', 'private', 'activeTimer'),
    t.get('card', 'shared', 'sessions'),
  ]).then(function (results) {
    renderUI(results[0], results[1]);
  });
}

document.getElementById('toggle').addEventListener('click', function () {
  Promise.all([
    t.get('card', 'private', 'activeTimer'),
    t.member('id', 'fullName'),
    t.get('card', 'shared', 'sessions'),
  ]).then(function (results) {
    var active = results[0];
    var member = results[1];
    var existing = normalizeSessions(results[2]);

    if (active && active.startedAt) {
      var durationSec = Math.floor((Date.now() - active.startedAt) / 1000);

      // Захист: < 5 секунд — скидаємо без запису
      if (durationSec < 5) {
        return t.remove('card', 'private', 'activeTimer').then(render);
      }

      var newSession = {
        memberId: member.id,
        memberName: member.fullName,
        startedAt: active.startedAt,
        endedAt: Date.now(),
        durationSec: durationSec,
      };

      // КЛЮЧОВО: створюємо новий масив, не мутуємо старий
      var nextSessions = existing.concat([newSession]);

      return t
        .set('card', 'shared', 'sessions', nextSessions)
        .then(function () {
          return t.remove('card', 'private', 'activeTimer');
        })
        .then(function () {
          // Рендеримо одразу з новими даними, не чекаючи на t.get
          renderUI(null, nextSessions);
        });
    }

    return t
      .set('card', 'private', 'activeTimer', { startedAt: Date.now() })
      .then(function () {
        renderUI({ startedAt: Date.now() }, existing);
      });
  });
});

// Кнопка "Очистити журнал" для тестів
var clearBtn = document.getElementById('clear');
if (clearBtn) {
  clearBtn.addEventListener('click', function () {
    if (!confirm('Очистити всі сесії на цій картці?')) return;
    Promise.all([
      t.remove('card', 'shared', 'sessions'),
      t.remove('card', 'private', 'activeTimer'),
    ]).then(render);
  });
}

t.render(function () {
  render();
});

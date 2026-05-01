/* eslint-disable no-undef */
// UI-логіка секції "Тайм-трекер" (рендериться як iframe всередині картки)

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

function totalFromSessions(sessions) {
  var list = sessions || [];
  var total = 0;
  for (var i = 0; i < list.length; i++) total += list[i].durationSec || 0;
  return total;
}

function render() {
  return Promise.all([
    t.member('id', 'fullName'),
    t.get('card', 'private', 'activeTimer'),
    t.get('card', 'shared', 'sessions'),
  ]).then(function (results) {
    var active = results[1];
    var sessions = results[2] || [];
    var totalSec = totalFromSessions(sessions);

    var btn = document.getElementById('toggle');
    var elapsedEl = document.getElementById('elapsed');
    var totalEl = document.getElementById('total');
    var listEl = document.getElementById('sessions');

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

    totalEl.textContent = 'Загальний час: ' + formatHMS(totalSec);

    if (sessions.length === 0) {
      listEl.innerHTML = '<li class="muted">Сесій ще не було</li>';
    } else {
      var recent = sessions.slice(-5).reverse();
      listEl.innerHTML = recent
        .map(function (s) {
          return (
            '<li><b>' +
            escapeHtml(s.memberName) +
            '</b> · ' +
            formatHMS(s.durationSec) +
            ' <span class="muted">(' +
            formatDate(s.endedAt) +
            ')</span></li>'
          );
        })
        .join('');
    }

    t.sizeTo('#root');
  });
}

document.getElementById('toggle').addEventListener('click', function () {
  Promise.all([
    t.get('card', 'private', 'activeTimer'),
    t.member('id', 'fullName'),
  ]).then(function (results) {
    var active = results[0];
    var member = results[1];

    if (active && active.startedAt) {
      var durationSec = Math.floor((Date.now() - active.startedAt) / 1000);

      // Захист від випадкового кліку < 5 секунд — просто скидаємо без запису
      if (durationSec < 5) {
        return t.remove('card', 'private', 'activeTimer').then(render);
      }

      return t.get('card', 'shared', 'sessions').then(function (existing) {
        var sessions = existing || [];
        sessions.push({
          memberId: member.id,
          memberName: member.fullName,
          startedAt: active.startedAt,
          endedAt: Date.now(),
          durationSec: durationSec,
        });
        return t
          .set('card', 'shared', 'sessions', sessions)
          .then(function () {
            return t.remove('card', 'private', 'activeTimer');
          })
          .then(render);
      });
    }

    return t
      .set('card', 'private', 'activeTimer', { startedAt: Date.now() })
      .then(render);
  });
});

t.render(function () {
  render();
});

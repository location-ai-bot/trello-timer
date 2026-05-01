/* eslint-disable no-undef */
// Trello Power-Up: Тайм-трекер
// Реєструє три capability:
//   1) card-back-section  — секція "Тайм-трекер" з кнопкою Старт/Стоп
//   2) card-detail-badges — бейдж справа на картці (тікаючий під час сесії + загальний час)
//   3) card-badges        — компактний бейдж на лицьовій частині картки в списку

var ICON_GRAY = './icon.svg';

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

function totalFromSessions(sessions) {
  var list = sessions || [];
  var total = 0;
  for (var i = 0; i < list.length; i++) {
    total += list[i].durationSec || 0;
  }
  return total;
}

window.TrelloPowerUp.initialize({
  // Секція всередині картки — головний UI
  'card-back-section': function (t) {
    return {
      title: 'Тайм-трекер',
      icon: ICON_GRAY,
      content: {
        type: 'iframe',
        url: t.signUrl('./section.html'),
        height: 240,
      },
    };
  },

  // Великі бейджі праворуч у відкритій картці
  'card-detail-badges': function (t) {
    return Promise.all([
      t.get('card', 'private', 'activeTimer'),
      t.get('card', 'shared', 'sessions'),
    ]).then(function (results) {
      var active = results[0];
      var sessions = results[1];
      var totalSec = totalFromSessions(sessions);
      var badges = [];

      if (active && active.startedAt) {
        badges.push({
          dynamic: function () {
            var elapsed = Math.floor((Date.now() - active.startedAt) / 1000);
            return {
              title: 'Триває сесія',
              text: '▶ ' + formatHMS(elapsed),
              color: 'red',
              refresh: 1,
            };
          },
        });
      }

      if (totalSec > 0) {
        badges.push({
          title: 'Загальний час',
          text: '⏱ ' + formatHM(totalSec),
          color: 'blue',
        });
      }

      return badges;
    });
  },

  // Маленькі бейджі на лицьовій частині картки в списку
  'card-badges': function (t) {
    return Promise.all([
      t.get('card', 'private', 'activeTimer'),
      t.get('card', 'shared', 'sessions'),
    ]).then(function (results) {
      var active = results[0];
      var sessions = results[1];
      var totalSec = totalFromSessions(sessions);
      var badges = [];

      if (active && active.startedAt) {
        badges.push({ text: '▶ live', color: 'red' });
      }

      if (totalSec > 0) {
        badges.push({ text: '⏱ ' + formatHM(totalSec), color: 'blue' });
      }

      return badges;
    });
  },
});

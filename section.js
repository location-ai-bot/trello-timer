/* eslint-disable no-undef */
// LOCATION FLOW — секція картки в Trello
// Read-only: показує поточний стан картки і список останніх сесій,
// тягнучи їх з Supabase. Сесії створюються/закриваються виключно з
// Premiere плагіна.

var SUPABASE_URL = 'https://xyoinglfguigfzrgaibg.supabase.co';
var SUPABASE_KEY = 'sb_publishable_W1lF3V80JqrvqNWPMdkblg_BjUGPOin';
var REFRESH_INTERVAL_MS = 15 * 1000; // оновлюємо стан кожні 15 секунд

var t = window.TrelloPowerUp.iframe();
var tickInterval = null;
var refreshInterval = null;
var currentCardId = null;
var currentStatus = null;
var currentMemberId = null;
var isAdmin = false;
var savingDebounce = null;

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

function formatDate(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    return d.toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return ''; }
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ────────── Supabase

function sbHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
}

function fetchCardStatus(cardId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/get_card_status', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ p_trello_card_id: cardId })
  })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (rows) {
      return (rows && rows.length) ? rows[0] : null;
    });
}

function fetchIsAdmin(memberId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/is_admin_member', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ p_trello_member_id: memberId })
  })
    .then(function (r) { return r.ok ? r.json() : false; })
    .catch(function () { return false; });
}

function fetchProjectMeta(adminId, cardId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/get_project_meta', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      p_admin_trello_member_id: adminId,
      p_trello_card_id: cardId
    })
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) { return (rows && rows.length) ? rows[0] : { cost: null, montage_type: null }; })
    .catch(function () { return { cost: null, montage_type: null }; });
}

function saveProjectMeta(adminId, cardId, cost, type) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/update_project_meta', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      p_admin_trello_member_id: adminId,
      p_trello_card_id: cardId,
      p_cost: cost,
      p_montage_type: type
    })
  });
}

// Список останніх сесій: треба знайти project_id за trello_card_id, потім
// взяти 10 останніх завершених. Робимо двома запитами через REST.
function fetchRecentSessions(cardId) {
  var url = SUPABASE_URL + '/rest/v1/projects?trello_card_id=eq.' +
    encodeURIComponent(cardId) + '&select=id&limit=1';
  return fetch(url, { headers: sbHeaders() })
    .then(function (r) {
      if (!r.ok) throw new Error('projects: HTTP ' + r.status);
      return r.json();
    })
    .then(function (rows) {
      if (!rows || !rows.length) return [];
      var pid = rows[0].id;
      var url2 = SUPABASE_URL + '/rest/v1/sessions?project_id=eq.' +
        encodeURIComponent(pid) +
        '&ended_at=not.is.null' +
        '&select=id,monteur_id,started_at,ended_at,total_active_sec,monteurs(full_name,nickname)' +
        '&order=ended_at.desc&limit=10';
      return fetch(url2, { headers: sbHeaders() })
        .then(function (r2) {
          if (!r2.ok) throw new Error('sessions: HTTP ' + r2.status);
          return r2.json();
        });
    })
    .catch(function () { return []; });
}

// ────────── Рендер

function renderStatus(s) {
  currentStatus = s;
  var card = document.getElementById('status');
  var head = document.getElementById('status-headline');
  var detail = document.getElementById('status-detail');
  var total = document.getElementById('total');

  // прибираємо всі класи стану
  card.classList.remove('working', 'idle', 'break', 'no_work');

  if (!s) {
    card.classList.add('no_work');
    head.textContent = '— Завантаження статусу —';
    detail.textContent = '';
    total.textContent = 'Загальний час по картці: —';
    return;
  }

  card.classList.add(s.status);

  var name = s.monteur_full_name || '';
  var elapsed = s.elapsed_active_sec || 0;

  if (s.status === 'working') {
    head.innerHTML = '🟢 <span>Працює — <b>' + escapeHtml(name) + '</b></span>';
    detail.innerHTML = 'Сесія триває <b id="elapsed-tick">' + formatHMS(elapsed) + '</b>';
    startTick(s.session_started_at);
  } else if (s.status === 'idle') {
    head.innerHTML = '🟡 <span>💤 Бездіє — <b>' + escapeHtml(name) + '</b></span>';
    detail.innerHTML = 'Сесія активна, але без змін у Premiere понад 3 хв · триває <b id="elapsed-tick">' +
      formatHMS(elapsed) + '</b>';
    startTick(s.session_started_at);
  } else if (s.status === 'break') {
    head.innerHTML = '🟡 <span>☕ На перерві — <b>' + escapeHtml(name) + '</b></span>';
    detail.innerHTML = 'Сесія триває <b id="elapsed-tick">' + formatHMS(elapsed) + '</b>';
    startTick(s.session_started_at);
  } else {
    head.innerHTML = '🔴 <span>Не в роботі</span>';
    if (s.last_session_ended_at) {
      detail.textContent = 'Остання сесія завершена ' + formatDate(s.last_session_ended_at);
    } else {
      detail.textContent = 'Жодної сесії ще не було';
    }
    stopTick();
  }

  total.textContent = 'Загальний час по картці: ' + formatHM(s.total_card_sec || 0);
  try { t.sizeTo('#root'); } catch (e) {}
}

function startTick(startedAtIso) {
  stopTick();
  if (!startedAtIso) return;
  var startedAtMs = new Date(startedAtIso).getTime();
  tickInterval = setInterval(function () {
    var el = document.getElementById('elapsed-tick');
    if (!el) return;
    var sec = Math.floor((Date.now() - startedAtMs) / 1000);
    el.textContent = formatHMS(sec);
  }, 1000);
}

function stopTick() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function renderSessions(sessions) {
  var list = document.getElementById('sessions');
  var summary = document.getElementById('sessions-summary');
  summary.textContent = 'Останні сесії (' + sessions.length + ')';

  if (!sessions.length) {
    list.innerHTML = '<li class="muted">Сесій ще не було</li>';
    return;
  }

  list.innerHTML = sessions.map(function (s) {
    var who = s.monteurs && s.monteurs.full_name ? s.monteurs.full_name : 'Невідомо';
    return '<li><b>' + escapeHtml(who) + '</b> · ' +
      formatHMS(s.total_active_sec || 0) +
      ' <span class="muted">(' + formatDate(s.ended_at) + ')</span></li>';
  }).join('');

  try { t.sizeTo('#root'); } catch (e) {}
}

// ────────── Основний цикл

function refresh() {
  if (!currentCardId) return Promise.resolve();
  return Promise.all([
    fetchCardStatus(currentCardId),
    fetchRecentSessions(currentCardId)
  ]).then(function (results) {
    renderStatus(results[0]);
    renderSessions(results[1] || []);
  }).catch(function (err) {
    var head = document.getElementById('status-headline');
    var detail = document.getElementById('status-detail');
    head.textContent = '⚠️ Помилка';
    detail.textContent = err.message || String(err);
  });
}

// ────────── Admin-блок: показ і логіка

function showAdminBlock(meta) {
  var block = document.getElementById('admin-block');
  var costEl = document.getElementById('admin-cost');
  var typeEl = document.getElementById('admin-type');
  block.classList.add('visible');
  if (meta && meta.cost != null) costEl.value = meta.cost;
  if (meta && meta.montage_type) typeEl.value = meta.montage_type;
  try { t.sizeTo('#root'); } catch (e) {}
}

function bindAdminInputs() {
  var costEl = document.getElementById('admin-cost');
  var typeEl = document.getElementById('admin-type');
  var savingEl = document.getElementById('admin-saving');

  function flush() {
    var cost = costEl.value === '' ? null : Number(costEl.value);
    var type = typeEl.value || null;
    savingEl.textContent = 'Зберігаю…';
    saveProjectMeta(currentMemberId, currentCardId, cost, type)
      .then(function (r) {
        savingEl.textContent = r.ok ? 'Збережено ✓' : ('Помилка: HTTP ' + r.status);
        setTimeout(function () { savingEl.textContent = ''; }, 2000);
      })
      .catch(function (err) {
        savingEl.textContent = 'Помилка: ' + (err.message || err);
      });
  }

  function debouncedFlush() {
    if (savingDebounce) clearTimeout(savingDebounce);
    savingDebounce = setTimeout(flush, 700);
  }

  costEl.addEventListener('input', debouncedFlush);
  costEl.addEventListener('blur', flush);
  typeEl.addEventListener('change', flush);
}

t.render(function () {
  Promise.all([
    t.card('id'),
    t.member('id')
  ]).then(function (results) {
    currentCardId = results[0].id;
    currentMemberId = results[1].id;

    refresh();
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(refresh, REFRESH_INTERVAL_MS);

    // Перевірка прав адміна — раз на завантаження
    return fetchIsAdmin(currentMemberId);
  }).then(function (admin) {
    if (admin === true) {
      isAdmin = true;
      bindAdminInputs();
      return fetchProjectMeta(currentMemberId, currentCardId).then(showAdminBlock);
    }
  });
});

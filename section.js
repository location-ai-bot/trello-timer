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
    .then(function (rows) {
      return (rows && rows.length) ? rows[0]
        : { cost: null, montage_type: null, client_id: null, client_name: null };
    })
    .catch(function () { return { cost: null, montage_type: null, client_id: null, client_name: null }; });
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

function fetchClientsList() {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/list_clients_for_powerup', {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify({})
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; });
}

function assignClientToCard(adminId, cardId, clientId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/assign_client_to_card', {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({
      p_admin_trello_member_id: adminId,
      p_trello_card_id: cardId,
      p_client_id: clientId
    })
  });
}

function createNewClient(adminId, name) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/create_client', {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({
      p_admin_trello_member_id: adminId,
      p_name: name,
      p_color: '#4cc2ff'
    })
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json(); // повертає uuid нового клієнта
  });
}

function fetchMonteursList(adminId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/list_monteurs_for_admin', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ p_admin_trello_member_id: adminId })
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; });
}

function fetchAssignedMonteur(cardId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/get_assigned_monteur', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ p_trello_card_id: cardId })
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) { return (rows && rows.length) ? rows[0] : { monteur_id: null }; })
    .catch(function () { return { monteur_id: null }; });
}

// При зміні монтажера у dropdown — викликаємо assign_monteur_to_card з назвою картки
function assignMonteurToCard(adminId, cardId, cardName, monteurId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/assign_monteur_to_card', {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({
      p_admin_trello_member_id: adminId,
      p_trello_card_id: cardId,
      p_trello_card_name: cardName,
      p_monteur_id: monteurId || null
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

  var stagePart = s.current_status
    ? ' · <span style="color:#0079bf">📋 ' + escapeHtml(s.current_status) + '</span>'
    : '';

  if (s.status === 'working') {
    head.innerHTML = '🟢 <span>Працює — <b>' + escapeHtml(name) + '</b></span>';
    detail.innerHTML = 'Сесія триває <b id="elapsed-tick">' + formatHMS(elapsed) + '</b>' + stagePart;
    startTick(s.session_started_at);
  } else if (s.status === 'idle') {
    head.innerHTML = '🟡 <span>💤 Бездіє — <b>' + escapeHtml(name) + '</b></span>';
    detail.innerHTML = 'Сесія активна, але без змін у Premiere понад 3 хв · триває <b id="elapsed-tick">' +
      formatHMS(elapsed) + '</b>' + stagePart;
    startTick(s.session_started_at);
  } else if (s.status === 'break') {
    head.innerHTML = '🟡 <span>☕ На перерві — <b>' + escapeHtml(name) + '</b></span>';
    detail.innerHTML = 'Сесія триває <b id="elapsed-tick">' + formatHMS(elapsed) + '</b>' + stagePart;
    startTick(s.session_started_at);
  } else {
    head.innerHTML = '🔴 <span>Не в роботі</span>';
    var parts = [];
    if (s.last_session_ended_at) parts.push('Остання сесія завершена ' + formatDate(s.last_session_ended_at));
    else parts.push('Жодної сесії ще не було');
    if (s.current_status) parts.push('Етап: <b>' + escapeHtml(s.current_status) + '</b>');
    detail.innerHTML = parts.join(' · ');
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

// Заповнює client dropdown списком, виділяє поточний клієнт картки.
function populateClientsDropdown(clients, currentClientId) {
  var clientSel = document.getElementById('admin-client');
  while (clientSel.firstChild) clientSel.removeChild(clientSel.firstChild);
  var empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '— обери —';
  clientSel.appendChild(empty);
  (clients || []).forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (currentClientId && currentClientId === c.id) opt.selected = true;
    clientSel.appendChild(opt);
  });
}

function showAdminBlock(meta, monteurs, currentAssigned, clients) {
  var block = document.getElementById('admin-block');
  var costEl = document.getElementById('admin-cost');
  var typeEl = document.getElementById('admin-type');
  var monteurSel = document.getElementById('admin-monteur');

  block.classList.add('visible');
  if (meta && meta.cost != null) costEl.value = meta.cost;
  if (meta && meta.montage_type) typeEl.value = meta.montage_type;

  populateClientsDropdown(clients, meta && meta.client_id);

  // Заповнюємо dropdown монтажерів
  while (monteurSel.firstChild) monteurSel.removeChild(monteurSel.firstChild);
  var emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— не призначено —';
  monteurSel.appendChild(emptyOpt);

  (monteurs || []).forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.full_name + ' (@' + m.nickname + ')';
    if (currentAssigned && currentAssigned.monteur_id === m.id) opt.selected = true;
    monteurSel.appendChild(opt);
  });

  // Початковий стан блокування monteur
  updateAssignLock();

  try { t.sizeTo('#root'); } catch (e) {}
}

// Блокує/розблоковує monteur dropdown залежно від наявності типу і клієнта.
// Якщо в monteur dropdown уже стояв вибір (картка вже мала монтажера) — лишаємо
// можливість зняти, але нову людину не дамо обрати без типу/клієнта.
function updateAssignLock() {
  var typeEl = document.getElementById('admin-type');
  var clientSel = document.getElementById('admin-client');
  var monteurSel = document.getElementById('admin-monteur');
  var warning = document.getElementById('admin-warning');

  var hasType = !!typeEl.value;
  var hasClient = !!clientSel.value;
  var ok = hasType && hasClient;

  monteurSel.disabled = !ok;
  warning.hidden = ok;
  try { t.sizeTo('#root'); } catch (e) {}
}

function bindAdminInputs() {
  var costEl = document.getElementById('admin-cost');
  var typeEl = document.getElementById('admin-type');
  var clientSel = document.getElementById('admin-client');
  var monteurSel = document.getElementById('admin-monteur');
  var savingEl = document.getElementById('admin-saving');
  var addClientBtn = document.getElementById('admin-add-client');
  var newClientForm = document.getElementById('admin-new-client');
  var newClientNameEl = document.getElementById('admin-new-client-name');
  var newClientSaveBtn = document.getElementById('admin-new-client-save');
  var newClientCancelBtn = document.getElementById('admin-new-client-cancel');

  function showStatus(msg, kind) {
    savingEl.textContent = msg;
    if (kind === 'error') savingEl.style.color = '#eb5a46';
    else savingEl.style.color = '';
    if (msg && msg.indexOf('…') === -1) {
      setTimeout(function () { savingEl.textContent = ''; }, 2000);
    }
  }

  function flushMeta() {
    var cost = costEl.value === '' ? null : Number(costEl.value);
    var type = typeEl.value || null;
    showStatus('Зберігаю…');
    saveProjectMeta(currentMemberId, currentCardId, cost, type)
      .then(function (r) {
        showStatus(r.ok ? 'Збережено ✓' : ('Помилка: HTTP ' + r.status), r.ok ? null : 'error');
      })
      .catch(function (err) { showStatus('Помилка: ' + (err.message || err), 'error'); });
  }

  function flushClient() {
    var clientId = clientSel.value || null;
    if (!clientId) {
      // Якщо знято — скидаємо в БД (передаємо null допустимо? Так, p_client_id uuid може бути null)
      showStatus('Знімаю клієнта…');
    } else {
      showStatus('Зберігаю клієнта…');
    }
    assignClientToCard(currentMemberId, currentCardId, clientId)
      .then(function (r) {
        showStatus(r.ok ? 'Збережено ✓' : ('Помилка: HTTP ' + r.status), r.ok ? null : 'error');
      })
      .catch(function (err) { showStatus('Помилка: ' + (err.message || err), 'error'); });
    updateAssignLock();
  }

  function flushAssignment() {
    var monteurId = monteurSel.value || null;
    showStatus('Призначаю…');
    t.card('name').then(function (card) {
      return assignMonteurToCard(currentMemberId, currentCardId, card.name, monteurId);
    }).then(function (r) {
      if (r.ok) {
        showStatus(monteurId ? 'Призначено ✓' : 'Знято ✓');
      } else {
        showStatus('Помилка: HTTP ' + r.status, 'error');
      }
    }).catch(function (err) {
      showStatus('Помилка: ' + (err.message || err), 'error');
    });
  }

  function debouncedFlushMeta() {
    if (savingDebounce) clearTimeout(savingDebounce);
    savingDebounce = setTimeout(flushMeta, 700);
  }

  // Додавання нового клієнта inline
  addClientBtn.addEventListener('click', function () {
    newClientForm.hidden = false;
    newClientNameEl.value = '';
    newClientNameEl.focus();
    try { t.sizeTo('#root'); } catch (e) {}
  });
  newClientCancelBtn.addEventListener('click', function () {
    newClientForm.hidden = true;
    try { t.sizeTo('#root'); } catch (e) {}
  });
  newClientNameEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') newClientSaveBtn.click();
    else if (e.key === 'Escape') newClientCancelBtn.click();
  });
  newClientSaveBtn.addEventListener('click', function () {
    var name = (newClientNameEl.value || '').trim();
    if (!name) { newClientNameEl.focus(); return; }
    showStatus('Створюю клієнта…');
    createNewClient(currentMemberId, name).then(function (newId) {
      // Перевантажимо список і виставимо новий як обраний
      return fetchClientsList().then(function (clients) {
        populateClientsDropdown(clients, newId);
        newClientForm.hidden = true;
        // Зберігаємо асоціацію картки з новим клієнтом
        return assignClientToCard(currentMemberId, currentCardId, newId);
      });
    }).then(function (r) {
      showStatus(r && r.ok ? 'Клієнт створений і прикріплений ✓' : ('Помилка: HTTP ' + (r && r.status)), r && r.ok ? null : 'error');
      updateAssignLock();
    }).catch(function (err) {
      showStatus('Помилка: ' + (err.message || err), 'error');
    });
  });

  costEl.addEventListener('input', debouncedFlushMeta);
  costEl.addEventListener('blur', flushMeta);
  typeEl.addEventListener('change', function () { flushMeta(); updateAssignLock(); });
  clientSel.addEventListener('change', flushClient);
  monteurSel.addEventListener('change', flushAssignment);
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
      return Promise.all([
        fetchProjectMeta(currentMemberId, currentCardId),
        fetchMonteursList(currentMemberId),
        fetchAssignedMonteur(currentCardId),
        fetchClientsList()
      ]).then(function (results) {
        showAdminBlock(results[0], results[1], results[2], results[3]);
      });
    }
  });
});

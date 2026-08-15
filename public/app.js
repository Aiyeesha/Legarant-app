const $ = (sel) => document.querySelector(sel);

const THEME_KEY = 'socmob-theme';
const API_KEY_STORAGE = 'socmob-api-key';

function show(el, data, ok) {
  el.textContent = JSON.stringify(data, null, 2);
  el.classList.remove('out-ok', 'out-err');
  if (ok === true) el.classList.add('out-ok');
  if (ok === false) el.classList.add('out-err');
}

/** fetch() qui ajoute automatiquement la clé API (si définie) et le Content-Type JSON. */
async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const key = localStorage.getItem(API_KEY_STORAGE);
  if (key) headers['X-Api-Key'] = key;
  return fetch(url, { ...opts, headers });
}

/** Désactive le bouton (avec indicateur visuel) le temps de l'appel async. */
async function withButtonLoading(btn, fn) {
  if (!btn) return fn();
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

document.querySelectorAll('.out').forEach(el => el.setAttribute('aria-live', 'polite'));

/* ================= Thème clair/sombre ================= */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('#themeToggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
}
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
applyTheme(localStorage.getItem(THEME_KEY) || (prefersDark ? 'dark' : 'light'));
$('#themeToggle')?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* ================= Paramètres (clé API) ================= */
const settingsPanel = $('#settingsPanel');
function updateApiKeyStatus() {
  const el = $('#apiKeyStatus');
  if (!el) return;
  const has = !!localStorage.getItem(API_KEY_STORAGE);
  el.textContent = has ? 'Clé API définie ✓' : 'Aucune clé API définie';
  el.classList.toggle('ok-text', has);
}
const savedKey = localStorage.getItem(API_KEY_STORAGE);
if (savedKey && $('#apiKeyInput')) $('#apiKeyInput').value = savedKey;
updateApiKeyStatus();

$('#settingsToggle')?.addEventListener('click', () => settingsPanel?.classList.toggle('open'));
document.addEventListener('click', (e) => {
  if (!settingsPanel?.classList.contains('open')) return;
  if (settingsPanel.contains(e.target) || e.target === $('#settingsToggle')) return;
  settingsPanel.classList.remove('open');
});
$('#formApiKey')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = $('#apiKeyInput').value.trim();
  if (val) localStorage.setItem(API_KEY_STORAGE, val);
  else localStorage.removeItem(API_KEY_STORAGE);
  updateApiKeyStatus();
  settingsPanel?.classList.remove('open');
});
$('#btnClearApiKey')?.addEventListener('click', () => {
  localStorage.removeItem(API_KEY_STORAGE);
  $('#apiKeyInput').value = '';
  updateApiKeyStatus();
});

/* ================= Navigation (sidebar) ================= */
const VIEW_TITLES = {
  health: 'Santé API',
  accounts: 'Comptes',
  contacts: 'Contacts',
  contracts: 'Contrats',
  catalog: 'Catalogue',
  orders: 'Commandes',
};

const sidebar = $('#sidebar');
const overlay = $('#overlay');

function setView(view) {
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== `view-${view}`; });
  document.querySelectorAll('.navlink').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#viewTitle').textContent = VIEW_TITLES[view] || view;
  closeSidebar();
  history.replaceState(null, '', `#${view}`);
}

document.querySelectorAll('.navlink').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
$('#menuToggle').addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlay.addEventListener('click', closeSidebar);

const initialView = (location.hash || '#health').slice(1);
setView(VIEW_TITLES[initialView] ? initialView : 'health');

/* ================= Table rendering helper ================= */
function renderTable(container, rows, columns) {
  container.innerHTML = '';
  if (!Array.isArray(rows) || !rows.length) {
    container.innerHTML = '<div class="empty-state">Aucun résultat.</div>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'result-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map(c => `<td>${row[c.key] ?? ''}</td>`).join('');
    tbody.appendChild(tr);
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

/* ================= Healthcheck ================= */
$('#btnHealth').addEventListener('click', () => withButtonLoading($('#btnHealth'), async () => {
  const badge = $('#apiBadge');
  try {
    const r = await apiFetch('/health');
    const t = await r.text();
    show($('#outHealth'), { ok: r.ok, text: t }, r.ok);
    badge.textContent = r.ok ? 'API OK' : 'API KO';
    badge.className = 'badge ' + (r.ok ? 'ok' : 'err');
  } catch (e) {
    show($('#outHealth'), { error: e.message }, false);
    badge.textContent = 'API KO';
    badge.className = 'badge err';
  }
}));

/* ================= Create Account ================= */
$('#formAccount').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  body.active = fd.get('active') === 'on';
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });

  await withButtonLoading(btn, async () => {
    try {
      const r = await apiFetch('/account', { method: 'POST', body: JSON.stringify(body) });
      const json = await r.json().catch(()=>({}));
      show($('#outAccount'), { status: r.status, ...json }, r.ok);
    } catch (e2) { show($('#outAccount'), { error: e2.message }, false); }
  });
});

/* ================= Register Contact ================= */
$('#formRegister').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const body = Object.fromEntries(new FormData(e.target).entries());
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });

  await withButtonLoading(btn, async () => {
    try {
      const r = await apiFetch('/register', { method: 'POST', body: JSON.stringify(body) });
      const json = await r.json().catch(()=>({}));
      show($('#outRegister'), { status: r.status, ...json }, r.ok);
    } catch (e) { show($('#outRegister'), { error: e.message }, false); }
  });
});

/* ================= Lookup contact by email ================= */
$('#btnLookup').addEventListener('click', () => withButtonLoading($('#btnLookup'), async () => {
  const email = encodeURIComponent($('#emailLookup').value.trim());
  if (!email) return show($('#outLookup'), { error: 'Email requis' }, false);
  try {
    const r = await apiFetch(`/contact/${email}`);
    const json = await r.json().catch(()=>({}));
    show($('#outLookup'), { status: r.status, ...json }, r.ok);
  } catch (e) { show($('#outLookup'), { error: e.message }, false); }
}));

/* ================= Account contacts ================= */
$('#btnAccContacts').addEventListener('click', () => withButtonLoading($('#btnAccContacts'), async () => {
  const ext = $('#accExtId').value.trim();
  const active = $('#accActive').value;
  if (!ext) return show($('#outAccContacts'), { error: 'External Id requis' }, false);
  const q = active ? `?active=${active}` : '';
  try {
    const r = await apiFetch(`/account/${encodeURIComponent(ext)}/contacts${q}`);
    const json = await r.json().catch(()=>([]));
    const rows = Array.isArray(json) ? json : [];
    renderTable($('#tblAccContacts'), rows, [
      { key: 'axg_contact_id__c', label: 'External Id' },
      { key: 'firstname', label: 'Prénom' },
      { key: 'lastname', label: 'Nom' },
      { key: 'email', label: 'Email' },
      { key: 'active__c', label: 'Actif' },
    ]);
    show($('#outAccContacts'), { count: rows.length, items: json }, r.ok);
  } catch (e) { show($('#outAccContacts'), { error: e.message }, false); }
}));

/* ================= Contract by external id ================= */
$('#btnContract').addEventListener('click', () => withButtonLoading($('#btnContract'), async () => {
  const id = $('#contractExtId').value.trim();
  if (!id) return show($('#outContract'), { error: 'External Id requis' }, false);
  try {
    const r = await apiFetch(`/contract/${encodeURIComponent(id)}`);
    const json = await r.json().catch(()=>({}));
    show($('#outContract'), { status: r.status, ...json }, r.ok);
  } catch (e) { show($('#outContract'), { error: e.message }, false); }
}));

/* ================= Products ================= */
$('#btnProducts').addEventListener('click', () => withButtonLoading($('#btnProducts'), async () => {
  const q = $('#qProducts').value.trim();
  const pb = $('#pbName').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (pb) params.set('pricebookName', pb);
  try {
    const r = await apiFetch(`/products?${params.toString()}`);
    const json = await r.json().catch(()=>({}));
    const rows = Array.isArray(json.items) ? json.items : [];
    renderTable($('#tblProducts'), rows, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Nom' },
      { key: 'pricebook_name', label: 'Pricebook' },
      { key: 'unitprice', label: 'Prix' },
    ]);
    show($('#outProducts'), json, r.ok);
  } catch (e) { show($('#outProducts'), { error: e.message }, false); }
}));

/* ================= Orders ================= */
$('#btnOrders').addEventListener('click', () => withButtonLoading($('#btnOrders'), async () => {
  const acc = $('#ordersAccExtId').value.trim();
  const status = $('#ordersStatus').value.trim();
  if (!acc) return show($('#outOrders'), { error: 'External Id requis' }, false);
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  try {
    const r = await apiFetch(`/orders/${encodeURIComponent(acc)}?${params.toString()}`);
    const json = await r.json().catch(()=>({}));
    const rows = Array.isArray(json.items) ? json.items : [];
    renderTable($('#tblOrders'), rows, [
      { key: 'order_number', label: 'N° commande' },
      { key: 'status', label: 'Statut' },
      { key: 'start_date', label: 'Début' },
      { key: 'end_date', label: 'Fin' },
      { key: 'total_amount', label: 'Montant' },
    ]);
    show($('#outOrders'), json, r.ok);
  } catch (e) { show($('#outOrders'), { error: e.message }, false); }
}));

/* ================= PATCH CONTACT ================= */
$('#formPatchContact').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const fd = new FormData(e.target);
  const externalId = fd.get('externalId')?.trim();
  if (!externalId) return show($('#outPatchContact'), { error: 'External Id requis' }, false);

  const allowed = [
    'FirstName','LastName','Email','Phone','MobilePhone',
    'MailingStreet','MailingCity','MailingPostalCode','MailingCountry',
    'Active__c','Title','Department'
  ];
  const body = {};
  for (const k of allowed) {
    const v = fd.get(k);
    if (v !== null && v !== '') body[k] = (k === 'Active__c' ? (v === 'true') : v);
  }
  if (body.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.Email)) {
    return show($('#outPatchContact'), { error: 'Email invalide' }, false);
  }

  await withButtonLoading(btn, async () => {
    try {
      const r = await apiFetch(`/contact/${encodeURIComponent(externalId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      const json = await r.json().catch(() => ({}));
      show($('#outPatchContact'), { status: r.status, ...json, sent: body }, r.ok);
    } catch (e) {
      show($('#outPatchContact'), { error: e.message }, false);
    }
  });
});

/* ================= PATCH ACCOUNT ================= */
$('#formPatchAccount').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const fd = new FormData(e.target);
  const externalId = fd.get('externalId')?.trim();
  if (!externalId) return show($('#outPatchAccount'), { error: 'External Id requis' }, false);

  const allowed = ['Name','Phone','BillingStreet','BillingCity','BillingPostalCode','BillingCountry','Active__c'];
  const body = {};
  for (const k of allowed) {
    const v = fd.get(k);
    if (v !== null && v !== '') body[k] = (k === 'Active__c' ? (v === 'true') : v);
  }

  await withButtonLoading(btn, async () => {
    try {
      const r = await apiFetch(`/account/${encodeURIComponent(externalId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      const json = await r.json().catch(() => ({}));
      show($('#outPatchAccount'), { status: r.status, ...json, sent: body }, r.ok);
    } catch (e) {
      show($('#outPatchAccount'), { error: e.message }, false);
    }
  });
});

/* ================= POST /contract ================= */
$('#formContractCreate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });

  if (!body.accountExternalId || !body.externalId) {
    return show($('#outContractCreate'), { error: 'accountExternalId et externalId sont requis' }, false);
  }

  await withButtonLoading(btn, async () => {
    try {
      const r = await apiFetch('/contract', { method: 'POST', body: JSON.stringify(body) });
      const json = await r.json().catch(() => ({}));
      show($('#outContractCreate'), { status: r.status, ...json, sent: body }, r.ok);
    } catch (e2) {
      show($('#outContractCreate'), { error: e2.message }, false);
    }
  });
});

/* ================= PATCH /contract/:externalId ================= */
$('#formContractPatch').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const fd = new FormData(e.target);
  const externalId = (fd.get('externalId') || '').trim();
  if (!externalId) {
    return show($('#outContractPatch'), { error: 'External Id requis' }, false);
  }

  const allowed = ['Status','StartDate','EndDate','ContractTerm','Description','SpecialTerms'];
  const body = {};
  for (const k of allowed) {
    const v = fd.get(k);
    if (v !== null && v !== '') {
      body[k] = (k === 'ContractTerm') ? Number(v) : v;
    }
  }
  if (!Object.keys(body).length) {
    return show($('#outContractPatch'), { error: 'Aucun champ modifié' }, false);
  }

  await withButtonLoading(btn, async () => {
    try {
      const r = await apiFetch(`/contract/${encodeURIComponent(externalId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const json = await r.json().catch(() => ({}));
      show($('#outContractPatch'), { status: r.status, ...json, sent: body }, r.ok);
    } catch (e2) {
      show($('#outContractPatch'), { error: e2.message }, false);
    }
  });
});

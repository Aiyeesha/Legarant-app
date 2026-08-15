const $ = (sel) => document.querySelector(sel);
const show = (el, data) => el.textContent = JSON.stringify(data, null, 2);

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
$('#btnHealth').addEventListener('click', async () => {
  const badge = $('#apiBadge');
  try {
    const r = await fetch('/health');
    const t = await r.text();
    show($('#outHealth'), { ok: r.ok, text: t });
    badge.textContent = r.ok ? 'API OK' : 'API KO';
    badge.className = 'badge ' + (r.ok ? 'ok' : 'err');
  } catch (e) {
    show($('#outHealth'), { error: e.message });
    badge.textContent = 'API KO';
    badge.className = 'badge err';
  }
});

/* ================= Create Account ================= */
$('#formAccount').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  body.active = fd.get('active') === 'on';
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });

  try {
    const r = await fetch('/account', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(()=>({}));
    show($('#outAccount'), { status: r.status, ...json });
  } catch (e) { show($('#outAccount'), { error: e.message }); }
});

/* ================= Register Contact ================= */
$('#formRegister').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });
  try {
    const r = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(()=>({}));
    show($('#outRegister'), { status: r.status, ...json });
  } catch (e) { show($('#outRegister'), { error: e.message }); }
});

/* ================= Lookup contact by email ================= */
$('#btnLookup').addEventListener('click', async () => {
  const email = encodeURIComponent($('#emailLookup').value.trim());
  if (!email) return show($('#outLookup'), { error: 'Email requis' });
  try {
    const r = await fetch(`/contact/${email}`);
    const json = await r.json().catch(()=>({}));
    show($('#outLookup'), { status: r.status, ...json });
  } catch (e) { show($('#outLookup'), { error: e.message }); }
});

/* ================= Account contacts ================= */
$('#btnAccContacts').addEventListener('click', async () => {
  const ext = $('#accExtId').value.trim();
  const active = $('#accActive').value;
  if (!ext) return show($('#outAccContacts'), { error: 'External Id requis' });
  const q = active ? `?active=${active}` : '';
  try {
    const r = await fetch(`/account/${encodeURIComponent(ext)}/contacts${q}`);
    const json = await r.json().catch(()=>([]));
    const rows = Array.isArray(json) ? json : [];
    renderTable($('#tblAccContacts'), rows, [
      { key: 'axg_contact_id__c', label: 'External Id' },
      { key: 'firstname', label: 'Prénom' },
      { key: 'lastname', label: 'Nom' },
      { key: 'email', label: 'Email' },
      { key: 'active__c', label: 'Actif' },
    ]);
    show($('#outAccContacts'), { count: rows.length, items: json });
  } catch (e) { show($('#outAccContacts'), { error: e.message }); }
});

/* ================= Contract by external id ================= */
$('#btnContract').addEventListener('click', async () => {
  const id = $('#contractExtId').value.trim();
  if (!id) return show($('#outContract'), { error: 'External Id requis' });
  try {
    const r = await fetch(`/contract/${encodeURIComponent(id)}`);
    const json = await r.json().catch(()=>({}));
    show($('#outContract'), { status: r.status, ...json });
  } catch (e) { show($('#outContract'), { error: e.message }); }
});

/* ================= Products ================= */
$('#btnProducts').addEventListener('click', async () => {
  const q = $('#qProducts').value.trim();
  const pb = $('#pbName').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (pb) params.set('pricebookName', pb);
  try {
    const r = await fetch(`/products?${params.toString()}`);
    const json = await r.json().catch(()=>({}));
    const rows = Array.isArray(json.items) ? json.items : [];
    renderTable($('#tblProducts'), rows, [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Nom' },
      { key: 'pricebook_name', label: 'Pricebook' },
      { key: 'unitprice', label: 'Prix' },
    ]);
    show($('#outProducts'), json);
  } catch (e) { show($('#outProducts'), { error: e.message }); }
});

/* ================= Orders ================= */
$('#btnOrders').addEventListener('click', async () => {
  const acc = $('#ordersAccExtId').value.trim();
  const status = $('#ordersStatus').value.trim();
  if (!acc) return show($('#outOrders'), { error: 'External Id requis' });
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  try {
    const r = await fetch(`/orders/${encodeURIComponent(acc)}?${params.toString()}`);
    const json = await r.json().catch(()=>({}));
    const rows = Array.isArray(json.items) ? json.items : [];
    renderTable($('#tblOrders'), rows, [
      { key: 'order_number', label: 'N° commande' },
      { key: 'status', label: 'Statut' },
      { key: 'start_date', label: 'Début' },
      { key: 'end_date', label: 'Fin' },
      { key: 'total_amount', label: 'Montant' },
    ]);
    show($('#outOrders'), json);
  } catch (e) { show($('#outOrders'), { error: e.message }); }
});

/* ================= PATCH CONTACT ================= */
$('#formPatchContact').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const externalId = fd.get('externalId')?.trim();
  if (!externalId) return show($('#outPatchContact'), { error: 'External Id requis' });

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
    return show($('#outPatchContact'), { error: 'Email invalide' });
  }

  try {
    const r = await fetch(`/contact/${encodeURIComponent(externalId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(() => ({}));
    show($('#outPatchContact'), { status: r.status, ...json, sent: body });
  } catch (e) {
    show($('#outPatchContact'), { error: e.message });
  }
});

/* ================= PATCH ACCOUNT ================= */
$('#formPatchAccount').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const externalId = fd.get('externalId')?.trim();
  if (!externalId) return show($('#outPatchAccount'), { error: 'External Id requis' });

  const allowed = ['Name','Phone','BillingStreet','BillingCity','BillingPostalCode','BillingCountry','Active__c'];
  const body = {};
  for (const k of allowed) {
    const v = fd.get(k);
    if (v !== null && v !== '') body[k] = (k === 'Active__c' ? (v === 'true') : v);
  }

  try {
    const r = await fetch(`/account/${encodeURIComponent(externalId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(() => ({}));
    show($('#outPatchAccount'), { status: r.status, ...json, sent: body });
  } catch (e) {
    show($('#outPatchAccount'), { error: e.message });
  }
});

/* ================= POST /contract ================= */
$('#formContractCreate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });

  if (!body.accountExternalId || !body.externalId) {
    return show($('#outContractCreate'), { error: 'accountExternalId et externalId sont requis' });
  }

  try {
    const r = await fetch('/contract', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => ({}));
    show($('#outContractCreate'), { status: r.status, ...json, sent: body });
  } catch (e2) {
    show($('#outContractCreate'), { error: e2.message });
  }
});

/* ================= PATCH /contract/:externalId ================= */
$('#formContractPatch').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const externalId = (fd.get('externalId') || '').trim();
  if (!externalId) {
    return show($('#outContractPatch'), { error: 'External Id requis' });
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
    return show($('#outContractPatch'), { error: 'Aucun champ modifié' });
  }

  try {
    const r = await fetch(`/contract/${encodeURIComponent(externalId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => ({}));
    show($('#outContractPatch'), { status: r.status, ...json, sent: body });
  } catch (e2) {
    show($('#outContractPatch'), { error: e2.message });
  }
});

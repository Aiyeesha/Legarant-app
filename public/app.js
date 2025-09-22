const $ = (sel) => document.querySelector(sel);
const show = (el, data) => el.textContent = JSON.stringify(data, null, 2);

/* Healthcheck */
$('#btnHealth').addEventListener('click', async () => {
  try {
    const r = await fetch('/health');
    const t = await r.text();
    show($('#outHealth'), { ok: r.ok, text: t });
  } catch (e) { show($('#outHealth'), { error: e.message }); }
});

/* Create Account */
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

/* Register Contact */
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

/* Lookup contact by email */
$('#btnLookup').addEventListener('click', async () => {
  const email = encodeURIComponent($('#emailLookup').value.trim());
  if (!email) return show($('#outLookup'), { error: 'Email requis' });
  try {
    const r = await fetch(`/contact/${email}`);
    const json = await r.json().catch(()=>({}));
    show($('#outLookup'), { status: r.status, ...json });
  } catch (e) { show($('#outLookup'), { error: e.message }); }
});

/* Account contacts */
$('#btnAccContacts').addEventListener('click', async () => {
  const ext = $('#accExtId').value.trim();
  const active = $('#accActive').value;
  if (!ext) return show($('#outAccContacts'), { error: 'External Id requis' });
  const q = active ? `?active=${active}` : '';
  try {
    const r = await fetch(`/account/${encodeURIComponent(ext)}/contacts${q}`);
    const json = await r.json().catch(()=>([]));
    show($('#outAccContacts'), { count: Array.isArray(json) ? json.length : 0, items: json });
  } catch (e) { show($('#outAccContacts'), { error: e.message }); }
});

/* Contract by external id */
$('#btnContract').addEventListener('click', async () => {
  const id = $('#contractExtId').value.trim();
  if (!id) return show($('#outContract'), { error: 'External Id requis' });
  try {
    const r = await fetch(`/contract/${encodeURIComponent(id)}`);
    const json = await r.json().catch(()=>({}));
    show($('#outContract'), { status: r.status, ...json });
  } catch (e) { show($('#outContract'), { error: e.message }); }
});

/* Products */
$('#btnProducts').addEventListener('click', async () => {
  const q = $('#qProducts').value.trim();
  const pb = $('#pbName').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (pb) params.set('pricebookName', pb);
  try {
    const r = await fetch(`/products?${params.toString()}`);
    const json = await r.json().catch(()=>({}));
    show($('#outProducts'), json);
  } catch (e) { show($('#outProducts'), { error: e.message }); }
});

/* Orders */
$('#btnOrders').addEventListener('click', async () => {
  const acc = $('#ordersAccExtId').value.trim();
  const status = $('#ordersStatus').value.trim();
  if (!acc) return show($('#outOrders'), { error: 'External Id requis' });
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  try {
    const r = await fetch(`/orders/${encodeURIComponent(acc)}?${params.toString()}`);
    const json = await r.json().catch(()=>({}));
    show($('#outOrders'), json);
  } catch (e) { show($('#outOrders'), { error: e.message }); }
});

/* ---------- PATCH CONTACT ---------- */
document.querySelector('#formPatchContact').addEventListener('submit', async (e) => {
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

/* ---------- PATCH ACCOUNT ---------- */
document.querySelector('#formPatchAccount').addEventListener('submit', async (e) => {
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
/* ========= POST /contract ========= */
$('#formContractCreate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());

  // Nettoie les champs vides
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

/* ========= PATCH /contract/:externalId ========= */
$('#formContractPatch').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const externalId = (fd.get('externalId') || '').trim();
  if (!externalId) {
    return show($('#outContractPatch'), { error: 'External Id requis' });
  }

  // Autorisés côté API : Status, StartDate, EndDate, ContractTerm, Description, SpecialTerms
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

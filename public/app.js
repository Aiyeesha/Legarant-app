const $ = (sel) => document.querySelector(sel);
const show = (el, data) => el.textContent = JSON.stringify(data, null, 2);

/* Healthcheck */
$('#btnHealth').addEventListener('click', async () => {
  try {
    const r = await fetch('/');
    const t = await r.text();
    show($('#outHealth'), { ok: r.ok, text: t });
  } catch (e) { show($('#outHealth'), { error: e.message }); }
});

/* Register */
document.querySelector('#formAccount')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });
  try {
    const r = await fetch('/account', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json();
    document.querySelector('#outAccount').textContent = JSON.stringify({ status: r.status, ...json }, null, 2);
  } catch (e2) {
    document.querySelector('#outAccount').textContent = JSON.stringify({ error: e2.message }, null, 2);
  }
});


$('#formRegister').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  // Normalise clés vides
  Object.keys(body).forEach(k => { if (body[k] === '') delete body[k]; });
  try {
    const r = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json();
    show($('#outRegister'), { status: r.status, ...json });
  } catch (e) { show($('#outRegister'), { error: e.message }); }
});

/* Lookup contact by email */
$('#btnLookup').addEventListener('click', async () => {
  const email = encodeURIComponent($('#emailLookup').value.trim());
  if (!email) return show($('#outLookup'), { error: 'Email requis' });
  try {
    const r = await fetch(`/contact/${email}`);
    const json = await r.json();
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
    const json = await r.json();
    show($('#outAccContacts'), { count: json.length ?? 0, items: json });
  } catch (e) { show($('#outAccContacts'), { error: e.message }); }
});

/* Contract by external id */
$('#btnContract').addEventListener('click', async () => {
  const id = $('#contractExtId').value.trim();
  if (!id) return show($('#outContract'), { error: 'External Id requis' });
  try {
    const r = await fetch(`/contract/${encodeURIComponent(id)}`);
    const json = await r.json();
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
    const json = await r.json();
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
    const json = await r.json();
    show($('#outOrders'), json);
  } catch (e) { show($('#outOrders'), { error: e.message }); }
});

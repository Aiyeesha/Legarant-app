// server.js — LEGARANT SOCMOB (Heroku)
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

/* ---------- middlewares ---------- */
app.use(express.json({ limit: '512kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Email');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------- static front ---------- */
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/health', (_req, res) => res.type('text').send('OK'));

/* ---------- DB (Heroku Postgres via Heroku Connect) ---------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true, rejectUnauthorized: false },
});

/* ---------- utils ---------- */
const isEmail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const pick = (obj, allowed) => Object.fromEntries(
  Object.entries(obj || {}).filter(([k, v]) => allowed.includes(k) && v !== undefined)
);

/* ======================= API ======================= */
/* POST /account — créer un Account sans contact */
app.post('/account', async (req, res) => {
  try {
    const { name, externalId, phone, billingCity, active = true } = req.body || {};
    if (!name || !externalId) return res.status(400).json({ error: 'name_and_externalId_required' });

    const dup = await pool.query(
      'SELECT sfid FROM salesforce.account WHERE axg_account_id__c=$1 LIMIT 1',
      [externalId]
    );
    if (dup.rowCount) return res.status(409).json({ error: 'account_exists', sfid: dup.rows[0].sfid });

    const ins = await pool.query(
      `INSERT INTO salesforce.account (name, axg_account_id__c, phone, billingcity, active__c)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING sfid, name, axg_account_id__c, active__c`,
      [name, externalId, phone || null, billingCity || null, !!active]
    );

    res.status(201).json({ account: ins.rows[0], sync: 'pending' });
  } catch (e) {
    console.error('POST /account error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* POST /register — créer un Contact (option : rattacher via Account External Id) */
app.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, accountExternalId } = req.body || {};
    if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

    const dup = await pool.query(
      `SELECT sfid FROM salesforce.contact
       WHERE lower(email)=lower($1) AND (isdeleted=false OR isdeleted IS NULL)
       LIMIT 1`, [email]
    );
    if (dup.rowCount) return res.status(409).json({ error: 'email_exists', sfid: dup.rows[0].sfid });

    let accountId = null;
    if (accountExternalId) {
      const acc = await pool.query(
        `SELECT sfid FROM salesforce.account WHERE axg_account_id__c=$1 LIMIT 1`,
        [accountExternalId]
      );
      accountId = acc.rows[0]?.sfid || null;
    }

    const ins = await pool.query(
      `INSERT INTO salesforce.contact (firstname, lastname, email, mobilephone, active__c, accountid)
       VALUES ($1,$2,$3,$4,true,$5)
       RETURNING sfid, firstname, lastname, email, accountid`,
      [firstName || null, lastName || null, email, mobile || null, accountId]
    );

    res.status(201).json({ contact: ins.rows[0], sync: 'pending' });
  } catch (e) {
    console.error('POST /register error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* PATCH /contact/:externalId — mise à jour partielle d’un Contact (AXG_Contact_Id__c) */
app.patch('/contact/:externalId', async (req, res) => {
  const { externalId } = req.params;
  if (!externalId) return res.status(400).json({ error: 'missing_external_id' });

  const allowed = [
    'FirstName','LastName','Email','Phone','MobilePhone',
    'MailingStreet','MailingCity','MailingPostalCode','MailingCountry',
    'Active__c','Title','Department','AccountId'
  ];
  const body = pick(req.body, allowed);
  if (body.Email && !isEmail(body.Email)) return res.status(400).json({ error: 'invalid_email' });

  const mapCol = {
    FirstName:'firstname', LastName:'lastname', Email:'email', Phone:'phone',
    MobilePhone:'mobilephone', MailingStreet:'mailingstreet', MailingCity:'mailingcity',
    MailingPostalCode:'mailingpostalcode', MailingCountry:'mailingcountry',
    Active__c:'active__c', Title:'title', Department:'department', AccountId:'accountid'
  };

  const sets = [], params = [];
  Object.entries(body).forEach(([api, val]) => { params.push(val); sets.push(`${mapCol[api]}=$${params.length}`); });
  if (!sets.length) return res.status(400).json({ error: 'no_updatable_fields' });

  params.push(externalId);
  const sql = `
    UPDATE salesforce.contact
       SET ${sets.join(', ')},
           systemmodstamp = systemmodstamp
     WHERE axg_contact_id__c = $${params.length}
     RETURNING sfid, axg_contact_id__c, firstname, lastname, email, phone, mobilephone, mailingcity, active__c, accountid
  `;
  try {
    const r = await pool.query(sql, params);
    if (!r.rowCount) return res.status(404).json({ error: 'contact_not_found' });
    res.json({ contact: r.rows[0] });
  } catch (e) {
    console.error('PATCH /contact error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* PATCH /account/:externalId — mise à jour partielle d’un Account (AXG_Account_Id__c) */
app.patch('/account/:externalId', async (req, res) => {
  const { externalId } = req.params;
  if (!externalId) return res.status(400).json({ error: 'missing_external_id' });

  const allowed = [
    'Name','Phone','Website','Industry','NumberOfEmployees','AnnualRevenue',
    'Type','Rating','AccountSource','Active__c',
    'BillingStreet','BillingCity','BillingPostalCode','BillingCountry',
    'ShippingStreet','ShippingCity','ShippingPostalCode','ShippingCountry'
  ];
  const mapCol = {
    Name:'name', Phone:'phone', Website:'website', Industry:'industry',
    NumberOfEmployees:'numberofemployees', AnnualRevenue:'annualrevenue',
    Type:'type', Rating:'rating', AccountSource:'accountsource', Active__c:'active__c',
    BillingStreet:'billingstreet', BillingCity:'billingcity', BillingPostalCode:'billingpostalcode', BillingCountry:'billingcountry',
    ShippingStreet:'shippingstreet', ShippingCity:'shippingcity', ShippingPostalCode:'shippingpostalcode', ShippingCountry:'shippingcountry'
  };

  const body = pick(req.body, allowed);
  if (!Object.keys(body).length) return res.status(400).json({ error: 'no_updatable_fields' });

  const sets = [], params = [];
  Object.entries(body).forEach(([api, val]) => { params.push(val); sets.push(`${mapCol[api]}=$${params.length}`); });

  params.push(externalId);
  const sql = `
    UPDATE salesforce.account
       SET ${sets.join(', ')},
           systemmodstamp = systemmodstamp
     WHERE axg_account_id__c = $${params.length}
     RETURNING sfid, axg_account_id__c, name, phone, website, industry,
               numberofemployees, annualrevenue, type, rating, accountsource, active__c
  `;
  try {
    const r = await pool.query(sql, params);
    if (!r.rowCount) return res.status(404).json({ error: 'account_not_found' });
    res.json({ account: r.rows[0] });
  } catch (e) {
    console.error('PATCH /account error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* --- GET utilitaires déjà en place --- */
app.get('/contact/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const { rows } = await pool.query(`
      SELECT sfid, firstname, lastname, email, active__c, axg_contact_id__c
      FROM salesforce.contact
      WHERE lower(email)=lower($1) AND (isdeleted=false OR isdeleted IS NULL)
      ORDER BY systemmodstamp DESC
      LIMIT 1
    `, [email]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/account/:externalId/contacts', async (req, res) => {
  const { externalId } = req.params;
  const { active } = req.query;
  try {
    const params = [externalId];
    let where = `a.axg_account_id__c = $1`;
    if (active === 'true' || active === 'false') { params.push(active === 'true'); where += ` AND c.active__c = $${params.length}`; }
    const { rows } = await pool.query(`
      SELECT c.sfid, c.firstname, c.lastname, c.email, c.active__c, c.axg_contact_id__c
      FROM salesforce.contact c
      JOIN salesforce.account a ON c.accountid = a.sfid
      WHERE ${where}
      ORDER BY c.lastname NULLS LAST, c.firstname NULLS LAST
    `, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/contract/:axgContractId', async (req, res) => {
  const { axgContractId } = req.params;
  try {
    const { rows } = await pool.query(`
      SELECT sfid, axg_contract_id__c AS axg_contract_id, contractnumber,
             accountid, status, startdate, enddate, activateddate
      FROM salesforce."contract"
      WHERE axg_contract_id__c = $1
      LIMIT 1
    `, [axgContractId]);
    if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /contract DB error:', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* catalogue & commandes */
app.get('/products', async (req, res) => {
  const { pricebookId, pricebookName, q, limit = 50, offset = 0 } = req.query;
  const params = [];
  let where = 'p.isactive = true';

  if (q && String(q).trim()) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where += ` AND (lower(p.name) LIKE $${params.length} OR lower(p.productcode) LIKE $${params.length})`;
  }

  let pbJoin = 'AND pb.isstandard = true';
  if (pricebookId || pricebookName) {
    if (pricebookId) { params.push(pricebookId); pbJoin = `AND pbe.pricebook2id = $${params.length}`; }
    else { params.push(pricebookName); pbJoin = `AND pb.name = $${params.length}`; }
  }

  params.push(Number(limit), Number(offset));
  const sql = `
    SELECT p.sfid AS product_id, p.name, p.productcode AS code, p.family, p.description, p.isactive AS active,
           pbe.sfid AS pricebook_entry_id, pbe.unitprice, pb.sfid AS pricebook_id, pb.name AS pricebook_name
    FROM salesforce.product2 p
    JOIN salesforce.pricebookentry pbe ON pbe.product2id = p.sfid AND pbe.isactive = true
    JOIN salesforce.pricebook2 pb      ON pb.sfid = pbe.pricebook2id
    WHERE ${where} ${pbJoin}
    ORDER BY p.name
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  try {
    const { rows } = await pool.query(sql, params);
    res.json({ items: rows, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    console.error('GET /products error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/orders/:accountExternalId', async (req, res) => {
  const { accountExternalId } = req.params;
  const { status, limit = 50, offset = 0 } = req.query;
  try {
    const acc = await pool.query(
      `SELECT sfid FROM salesforce.account WHERE axg_account_id__c=$1 LIMIT 1`,
      [accountExternalId]
    );
    const accountId = acc.rows[0]?.sfid;
    if (!accountId) return res.status(404).json({ error: 'account_not_found' });

    const params = [accountId];
    let where = 'o.accountid = $1';
    if (status) { params.push(status); where += ` AND o.status = $${params.length}`; }
    params.push(Number(limit), Number(offset));

    const ordersSql = `
      SELECT o.sfid AS order_id, o.ordernumber AS order_number, o.name,
             o.effectivedate AS start_date, o.enddate AS end_date,
             o.totalamount AS total_amount, o.status, o.pricebook2id AS pricebook_id
      FROM salesforce."order" o
      WHERE ${where}
      ORDER BY o.ordereddate DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const orders = await pool.query(ordersSql, params);
    if (!orders.rowCount) return res.json({ items: [], limit: Number(limit), offset: Number(offset) });

    const ids = orders.rows.map(r => r.order_id);
    const items = await pool.query(`
      SELECT oi.sfid AS orderitem_id, oi.orderid AS order_id, oi.product2id AS product_id,
             oi.quantity, oi.unitprice AS unit_price, oi.totalprice AS total_price
      FROM salesforce.orderitem oi
      WHERE oi.orderid = ANY($1::varchar[])
    `, [ids]);

    const byOrder = items.rows.reduce((m, it) => ((m[it.order_id] ||= []).push(it), m), {});
    const payload = orders.rows.map(o => ({ ...o, items: byOrder[o.order_id] || [] }));
    res.json({ items: payload, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    console.error('GET /orders error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------- boot ---------- */
app.listen(port, () => console.log(`SOCMOB API running on ${port}`));

// server.js – SOCMOB API (Heroku)
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// ---- Middlewares ----
app.use(express.json({ limit: '512kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Email');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- DB pool (Heroku Postgres via Heroku Connect) ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true, rejectUnauthorized: false },
});

// Santé
app.get('/', (_req, res) => res.send('SOCMOB API: OK'));

// ---------- Utilitaires ----------
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const pick = (obj, allowed) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k, v]) => allowed.includes(k) && v !== undefined));

// ---------- 1) POST /register (auto-inscription) ----------
/*
  Body JSON minimum:
  {
    "firstName": "Anna",
    "lastName": "Schmidt",
    "email": "anna@example.de",
    "mobile": "+49 170 ...",
    "accountExternalId": "AXG-ACCT-10001"   // optionnel: rattacher à un compte
  }
*/
app.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, accountExternalId } = req.body || {};

    if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

    // 1) anti-doublon local (le doublon final sera encore contrôlé par SF via Duplicate Rule)
    const dup = await pool.query(
      `SELECT sfid FROM salesforce.contact
       WHERE lower(email)=lower($1) AND (isdeleted=false OR isdeleted IS NULL)
       LIMIT 1`,
      [email]
    );
    if (dup.rowCount) {
      return res.status(409).json({ error: 'email_exists', sfid: dup.rows[0].sfid });
    }

    // 2) trouver l'account SFID si external id fourni
    let accountId = null;
    if (accountExternalId) {
      const acc = await pool.query(
        `SELECT sfid FROM salesforce.account WHERE axg_account_id__c=$1 LIMIT 1`,
        [accountExternalId]
      );
      accountId = acc.rows[0]?.sfid || null;
    }

    // 3) insérer dans la table Connect (write-back -> SF)
    const ins = await pool.query(
      `INSERT INTO salesforce.contact (firstname, lastname, email, mobilephone, active__c, accountid)
       VALUES ($1,$2,$3,$4,true,$5)
       RETURNING sfid, firstname, lastname, email, accountid`,
      [firstName || null, lastName || null, email, mobile || null, accountId]
    );

    // NB: sfid peut être null tant que la synchro SF n’a pas finalisé
    return res.status(201).json({ contact: ins.rows[0], sync: 'pending' });
  } catch (e) {
    console.error('POST /register error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ---------- 2) PUT /contact/:externalId (mise à jour profil) ----------
/*
  :externalId = AXG_Contact_Id__c
  Body JSON: autorisé uniquement sur un sous-ensemble de champs (sécurité FLS côté SF en plus)
*/
app.put('/contact/:externalId', async (req, res) => {
  const { externalId } = req.params;
  if (!externalId) return res.status(400).json({ error: 'missing_external_id' });

  // Champs modifiables par l’app (adapter au besoin)
  const allowed = [
    'FirstName', 'LastName', 'Email', 'Phone', 'MobilePhone',
    'MailingStreet', 'MailingCity', 'MailingPostalCode', 'MailingCountry',
    'Active__c', 'Title', 'Department'
  ];
  const body = pick(req.body, allowed);

  if (body.Email && !isEmail(body.Email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  // Construire UPDATE dynamique en respectant la casse (colonnes en lower dans PG)
  const mapCol = {
    FirstName: 'firstname',
    LastName: 'lastname',
    Email: 'email',
    Phone: 'phone',
    MobilePhone: 'mobilephone',
    MailingStreet: 'mailingstreet',
    MailingCity: 'mailingcity',
    MailingPostalCode: 'mailingpostalcode',
    MailingCountry: 'mailingcountry',
    Active__c: 'active__c',
    Title: 'title',
    Department: 'department',
  };

  const sets = [];
  const params = [];
  Object.entries(body).forEach(([api, val]) => {
    params.push(val);
    sets.push(`${mapCol[api]} = $${params.length}`);
  });

  if (sets.length === 0) return res.status(400).json({ error: 'no_updatable_fields' });

  // WHERE via external id
  params.push(externalId);
  const sql = `
    UPDATE salesforce.contact
       SET ${sets.join(', ')},
           systemmodstamp = systemmodstamp  -- no-op pour laisser Connect gérer
     WHERE axg_contact_id__c = $${params.length}
     RETURNING sfid, firstname, lastname, email, phone, mobilephone, mailingcity, active__c
  `;

  try {
    const r = await pool.query(sql, params);
    if (!r.rowCount) return res.status(404).json({ error: 'contact_not_found' });
    return res.json({ contact: r.rows[0] }); // write-back -> SF en arrière-plan
  } catch (e) {
    console.error('PUT /contact error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ---------- 3) GET /products (catalogue) ----------
/*
  Query params:
   - pricebookId (sfid) ou pricebookName (ex: 'Standard Price Book')
   - q (recherche plein texte sur name/productcode)
   - limit / offset (pagination)
*/
app.get('/products', async (req, res) => {
  const { pricebookId, pricebookName, q, limit = 50, offset = 0 } = req.query;

  const params = [];
  let where = 'p.isactive = true';

  if (q && String(q).trim()) {
    params.push(`%${String(q).trim().toLowerCase()}%`);
    where += ` AND (lower(p.name) LIKE $${params.length} OR lower(p.productcode) LIKE $${params.length})`;
  }

  // Résoudre le pricebook
  let pbJoin = '';
  if (pricebookId || pricebookName) {
    if (pricebookId) {
      params.push(pricebookId);
      pbJoin = `AND pbe.pricebook2id = $${params.length}`;
    } else {
      params.push(pricebookName);
      pbJoin = `AND pb.name = $${params.length}`;
    }
  } else {
    // Standard price book par défaut si mappé : IsStandard = true
    pbJoin = `AND pb.isstandard = true`;
  }

  params.push(Number(limit));
  params.push(Number(offset));

  const sql = `
    SELECT
      p.sfid            AS product_id,
      p.name            AS name,
      p.productcode     AS code,
      p.family          AS family,
      p.description     AS description,
      p.isactive        AS active,
      pbe.sfid          AS pricebook_entry_id,
      pbe.unitprice     AS unitprice,
      pb.sfid           AS pricebook_id,
      pb.name           AS pricebook_name
    FROM salesforce.product2 p
    JOIN salesforce.pricebookentry pbe ON pbe.product2id = p.sfid AND pbe.isactive = true
    JOIN salesforce.pricebook2 pb      ON pb.sfid = pbe.pricebook2id
    WHERE ${where} ${pbJoin}
    ORDER BY p.name
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  try {
    const { rows } = await pool.query(sql, params);
    return res.json({ items: rows, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    console.error('GET /products error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ---------- 4) GET /orders/:accountExternalId (commandes + lignes) ----------
/*
  Retourne les Orders d’un compte (via AXG_Account_Id__c) avec leurs OrderItems.
  Query params: status, limit, offset
*/
app.get('/orders/:accountExternalId', async (req, res) => {
  const { accountExternalId } = req.params;
  const { status, limit = 50, offset = 0 } = req.query;

  try {
    // 1) trouver le SFID du compte
    const acc = await pool.query(
      `SELECT sfid FROM salesforce.account WHERE axg_account_id__c = $1 LIMIT 1`,
      [accountExternalId]
    );
    const accountId = acc.rows[0]?.sfid;
    if (!accountId) return res.status(404).json({ error: 'account_not_found' });

    // 2) récupérer les orders
    const params = [accountId];
    let where = 'o.accountid = $1';
    if (status) {
      params.push(status);
      where += ` AND o.status = $${params.length}`;
    }
    params.push(Number(limit), Number(offset));

    const ordersSql = `
      SELECT
        o.sfid          AS order_id,
        o.ordernumber   AS order_number,
        o.name          AS name,
        o.effectivedate AS start_date,
        o.enddate       AS end_date,
        o.totalamount   AS total_amount,
        o.status        AS status,
        o.pricebook2id  AS pricebook_id
      FROM salesforce."order" o
      WHERE ${where}
      ORDER BY o.ordereddate DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const orders = await pool.query(ordersSql, params);

    if (orders.rowCount === 0) return res.json({ items: [], limit: Number(limit), offset: Number(offset) });

    // 3) items pour ces orders
    const ids = orders.rows.map((r) => r.order_id);
    const itemsSql = `
      SELECT
        oi.sfid          AS orderitem_id,
        oi.orderid       AS order_id,
        oi.product2id    AS product_id,
        oi.quantity      AS quantity,
        oi.unitprice     AS unit_price,
        oi.totalprice    AS total_price
      FROM salesforce.orderitem oi
      WHERE oi.orderid = ANY($1::varchar[])
    `;
    const items = await pool.query(itemsSql, [ids]);

    // 4) regrouper
    const byOrder = items.rows.reduce((m, it) => {
      (m[it.order_id] ||= []).push(it);
      return m;
    }, {});
    const payload = orders.rows.map((o) => ({ ...o, items: byOrder[o.order_id] || [] }));

    return res.json({ items: payload, limit: Number(limit), offset: Number(offset) });
  } catch (e) {
    console.error('GET /orders error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ---------- Endpoints déjà en place chez toi (rappel) ----------
app.get('/contact/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const q = `
      SELECT sfid, firstname, lastname, email, active__c, axg_contact_id__c
      FROM salesforce.contact
      WHERE lower(email) = lower($1) AND (isdeleted = false OR isdeleted IS NULL)
      ORDER BY systemmodstamp DESC
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [email]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    return res.json(rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/account/:externalId/contacts', async (req, res) => {
  const { externalId } = req.params;
  const { active } = req.query;

  try {
    const params = [externalId];
    let where = `a.axg_account_id__c = $1`;

    if (active === 'true' || active === 'false') {
      params.push(active === 'true');
      where += ` AND c.active__c = $${params.length}`;
    }

    const sql = `
      SELECT
        c.sfid, c.firstname, c.lastname, c.email, c.active__c, c.axg_contact_id__c
      FROM salesforce.contact c
      JOIN salesforce.account a ON c.accountid = a.sfid
      WHERE ${where}
      ORDER BY c.lastname NULLS LAST, c.firstname NULLS LAST
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/contract/:axgContractId', async (req, res) => {
  const { axgContractId } = req.params;
  const sql = `
    SELECT
      sfid, axg_contract_id__c AS axg_contract_id, contractnumber,
      accountid, status, startdate, enddate, activateddate
    FROM salesforce."contract"
    WHERE axg_contract_id__c = $1
    LIMIT 1
  `;
  try {
    const { rows } = await pool.query(sql, [axgContractId]);
    if (!rows.length) return res.status(404).json({ error: 'Contract not found' });
    return res.json(rows[0]);
  } catch (e) {
    console.error('GET /contract DB error:', e);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ---- Static front (LAISSE / pour le front) ----
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ---- Boot ----
app.listen(port, () => console.log(`SOCMOB API running on ${port}`));

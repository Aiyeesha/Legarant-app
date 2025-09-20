// server.js
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Pool PG avec SSL requis par Heroku Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true, rejectUnauthorized: false },
});

// Page de santé
app.get('/', (_req, res) => res.send('SOCMOB API: OK'));

// Endpoint SOCMOB dédoublonnage email (lecture dans la table Heroku Connect)
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


// --- GET /account/:externalId/contacts?active=true ---
app.get('/account/:externalId/contacts', async (req, res) => {
  const { externalId } = req.params;
  const { active } = req.query;

  try {
    const params = [externalId];
    let where = `a.axg_account_id__c = $1`;

    // filtre optionnel sur Active__c
    if (active === 'true' || active === 'false') {
      params.push(active === 'true');
      where += ` AND c.active__c = $${params.length}`;
    }

    const sql = `
      SELECT
        c.sfid,
        c.firstname,
        c.lastname,
        c.email,
        c.active__c,
        c.axg_contact_id__c
      FROM salesforce.contact c
      JOIN salesforce.account a ON c.accountid = a.sfid
      WHERE ${where}
      ORDER BY c.lastname NULLS LAST, c.firstname NULLS LAST
    `;

    const { rows } = await pool.query(sql, params);
    res.json(rows);               // [] si aucun résultat
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});


// --- GET /contract/:axgContractId ---
app.get('/contract/:axgContractId', async (req, res) => {
  const { axgContractId } = req.params;

  // requête SQL: lecture dans le schéma "salesforce" d'Heroku Connect
  const sql = `
    SELECT
      sfid,
      axg_contract_id__c,
      name,
      accountid,
      status,
      startdate,
      enddate,
      activateddate,
      contractnumber,
      isdeleted
    FROM salesforce.contract
    WHERE axg_contract_id__c = $1
    LIMIT 1
  `;

  try {
    const { rows } = await pool.query(sql, [axgContractId]);

    if (!rows.length || rows[0].isdeleted === true) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // on retire le champ interne isdeleted de la réponse
    const { isdeleted, ...payload } = rows[0];
    return res.json(payload);
  } catch (e) {
    console.error('GET /contract error', e);
    return res.status(500).json({ error: 'Database error' });
  }
});


app.listen(port, () => console.log(`SOCMOB API running on ${port}`));

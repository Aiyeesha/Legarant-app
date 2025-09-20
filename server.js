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

app.listen(port, () => console.log(`SOCMOB API running on ${port}`));

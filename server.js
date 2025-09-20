const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Connexion Postgres
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 🔹 Route test
app.get('/', (_, res) => res.send('LEGARANT SOCMOB API: OK'));

// 🔹 1. Récupérer infos Contact par Email
app.get('/contact/:email', async (req, res) => {
  const { email } = req.params;
  const { rows } = await pool.query(
    'SELECT id, firstname, lastname, email, active__c FROM salesforce.contact WHERE email=$1',
    [email]
  );
  res.json(rows[0] || {});
});

// 🔹 2. Mettre à jour infos Contact
app.patch('/contact/:id', async (req, res) => {
  const { id } = req.params;
  const { phone, mobilephone } = req.body;
  const { rowCount } = await pool.query(
    'UPDATE salesforce.contact SET phone=$1, mobilephone=$2 WHERE id=$3',
    [phone, mobilephone, id]
  );
  res.json({ updated: rowCount });
});

// 🔹 3. Créer un nouveau Contact (auto-inscription)
app.post('/contact', async (req, res) => {
  const { firstname, lastname, email } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO salesforce.contact(firstname, lastname, email, active__c)
     VALUES($1,$2,$3,true) RETURNING id`,
    [firstname, lastname, email]
  );
  res.json({ id: rows[0].id });
});

// 🔹 4. Consulter contrats par Contact
app.get('/contracts/:contactId', async (req, res) => {
  const { contactId } = req.params;
  const { rows } = await pool.query(
    'SELECT id, startdate, enddate, status, description FROM salesforce.contract WHERE customersignedid=$1',
    [contactId]
  );
  res.json(rows);
});

// 🔹 5. Lister produits disponibles
app.get('/products', async (_, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, productcode, family, description, isactive FROM salesforce.product2 WHERE isactive=true'
  );
  res.json(rows);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SOCMOB API running on ${port}`));

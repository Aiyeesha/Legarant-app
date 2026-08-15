# LEGARANT — SOCMOB

API Node/Express déployée sur Heroku, faisant le pont entre l'app mobile LEGARANT et Salesforce. Les écritures passent par une base Postgres synchronisée avec Salesforce via **Heroku Connect** (schéma `salesforce`), avec une synchronisation asynchrone (`sync: "pending"` dans les réponses de création).

Une console web de test (`public/`) permet de manipuler l'API sans Postman.

## Structure

```
server.js       API Express (routes /account, /register, /contact, /contract, /products, /orders)
public/         Console web de test (HTML/CSS/JS vanilla)
postman/        Collections & environnements Postman (API Heroku + Connected App Salesforce direct)
salesforce/     Métadonnées Salesforce (Apex, Connected App, permission sets, règles de doublons)
Procfile        Commande de démarrage Heroku (web: node server.js)
```

`salesforce/default/classes/SignupApi.cls` expose un endpoint REST Apex (`/v1/signup`) alternatif, appelant directement Salesforce sans passer par Heroku Connect — conservé pour référence/tests.

## Démarrage local

```bash
npm install
cp .env.example .env   # puis renseigner DATABASE_URL au minimum
npm start
```

L'app écoute sur `http://localhost:3000`. `GET /health` renvoie `OK` si le service tourne (la connexion DB n'est testée qu'à la première requête qui l'utilise).

## Variables d'environnement

Voir [.env.example](.env.example) pour la liste complète et les valeurs par défaut :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion Postgres (Heroku Connect) |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Vérification du certificat TLS Postgres |
| `ALLOWED_ORIGINS` | Origines autorisées en CORS |
| `API_KEY` | Clé requise (header `X-Api-Key`) sur les routes d'écriture |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Paramètres du rate limiting global |

## Sécurité

- Toutes les routes `POST`/`PATCH` acceptent un header `X-Api-Key` vérifié contre `API_KEY`. **Si `API_KEY` n'est pas défini, aucune vérification n'est faite** (comportement historique, conservé pour ne pas casser l'app mobile existante) — un avertissement est loggé au démarrage dans ce cas. Définir `API_KEY` en production est fortement recommandé.
- `helmet` et un rate limiting global sont activés par défaut.
- La console web (`public/`) a un champ « Clé API » (icône ⚙️ dans la barre latérale) qui stocke la clé en `localStorage` et l'envoie automatiquement sur les requêtes d'écriture.

## Identifiants (Account/Contact/Contract)

`AXG_Account_Id__c`, `AXG_Contact_Id__c` et `AXG_Contract_Id__c` sont des champs **Auto-Number** côté Salesforce : leur valeur est **toujours générée par Salesforce**, jamais par un client — même quand le champ est marqué External ID, la seule opération valide est l'insert (jamais le matching en update). Voir [SFDX-Data-Move-Utility FAQ](https://forcedotcom.github.io/SFDX-Data-Move-Utility/faq/object-and-field-handling-in-soql-queries/can-autonumber-fields-be-used-as-external-ids) et la [doc Heroku Connect sur les échecs d'écriture](https://devcenter.heroku.com/articles/heroku-connect-write-errors) (mapper un champ en lecture seule comme un Auto-Number bloque la ligne en échec de synchronisation, visible dans la colonne `_hc_err`).

L'API n'écrit donc plus de valeur fournie par le client dans ces colonnes et identifie les enregistrements par :

- **`sfid`** — l'Id Salesforce réel, peuplé par Heroku Connect une fois la synchronisation terminée. C'est la clé utilisée pour tous les `PATCH`/`GET` (`/account/:sfid`, `/contact/:sfid`, `/contract/:sfid`, `/account/:sfid/contacts`, `/orders/:accountSfid`) et pour rattacher un Contact ou un Contract à un Account (`accountSfid` dans le corps de `POST /register` et `POST /contract`).
- **`id`** — l'identifiant interne Heroku Connect, disponible immédiatement après une création (`POST /account`, `/register`, `/contract`), utilisable pour poller le statut de synchronisation via `GET /account/:id/status`, `GET /contact/:id/status`, `GET /contract/:id/status` (réponse `{ id, sfid, last_op, error, synced }`) jusqu'à obtenir un `sfid`.

Conséquence pratique : un Contact ou un Contract ne peut être rattaché à un Account que si ce dernier a déjà fini de se synchroniser vers Salesforce (a un `sfid`) — ce qui reflète la réalité (`AccountId` est un vrai lookup Salesforce, impossible à pointer vers un compte qui n'existe pas encore côté SF).

## Tests API

Voir [postman/README.md](postman/README.md) pour importer les collections Postman.

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

## Tests API

Voir [postman/README.md](postman/README.md) pour importer les collections Postman.

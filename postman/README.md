# Postman — LEGARANT SOCMOB

Deux collections, deux cibles différentes :

| Collection | Cible | Auth |
| --- | --- | --- |
| `LEGARANT-SOCMOB-Heroku-API.postman_collection.json` | L'app Heroku (`server.js`) — endpoints `/account`, `/register`, `/contact`, `/contract`, `/products`, `/orders` | Aucune (protégée par CORS/réseau côté Heroku) |
| `LEGARANT-Connected-App-Salesforce.postman_collection.json` | L'API REST Salesforce directement, via le Connected App `Legarant_AXG_ConnectedApp` | OAuth2 (Password ou Client Credentials) |

## Import

Dans Postman : **Import** → glisser les 4 fichiers (2 collections + 2 environnements). Sélectionner l'environnement correspondant avant de lancer les requêtes (`LEGARANT SOCMOB – Heroku (staging)` ou `LEGARANT_AXG_Sandbox`).

## Avant de lancer la collection Salesforce

L'environnement `LEGARANT-Connected-App-Salesforce.postman_environment.json` est un **template** : `client_id`, `client_secret`, `username`, `password`, `security_token` sont vides et marqués `secret` — à remplir dans Postman (pas dans le fichier versionné) avant de lancer `Auth – Get Access Token`.

## Avant de lancer la collection Heroku

Mettre à jour `base_url` dans l'environnement : `http://localhost:3000` en local, ou l'URL Heroku en staging/prod.

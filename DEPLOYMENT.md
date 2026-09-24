# Guide de déploiement — AfriMarket

Plateforme e-commerce multi-boutiques : **FastAPI + MongoDB + React**.

Ce dépôt contient :
```
afrimarket/
├── backend/            # API FastAPI
├── frontend/           # Application React
├── database_dump/      # Export MongoDB (mongodump BSON) de la base de démonstration
├── DEPLOYMENT.md       # Ce document
└── memory/             # PRD.md + identifiants de test
```

---

## 1. Prérequis

- **Python 3.11+**
- **Node.js 18+** et **Yarn** (⚠️ ne pas utiliser npm)
- **MongoDB 5+** (local ou managé : MongoDB Atlas)
- Outils MongoDB : `mongorestore` / `mongodump` (paquet `mongodb-database-tools`)

---

## 2. Restaurer la base de données

Le dossier `database_dump/` contient un export `mongodump`.

```bash
# Base locale
mongorestore --uri="mongodb://localhost:27017" --nsInclude="test_database.*" database_dump/

# OU base MongoDB Atlas
mongorestore --uri="mongodb+srv://<user>:<pass>@cluster.mongodb.net" database_dump/
```

La base s'appelle `test_database` (modifiable via la variable `DB_NAME`).
> Note : au premier démarrage, le backend recrée automatiquement l'administrateur et les données de démonstration si la base est vide (`seed.py`). La restauration est donc optionnelle mais recommandée pour retrouver l'état exact.

---

## 3. Backend (FastAPI)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Créer `backend/.env` (un modèle prêt à copier est fourni : `backend/.env.example`) :
```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
CORS_ORIGINS="*"
JWT_SECRET="<chaîne aléatoire 64 caractères>"        # openssl rand -hex 32
ADMIN_EMAIL="flavorfrancois@gmail.com"
ADMIN_PASSWORD="<mot de passe admin fort>"
FRONTEND_URL="https://votre-domaine-frontend.com"     # origine HTTPS réelle
EMERGENT_EMAIL_KEY="<clé email>"                       # laisser vide pour désactiver l'envoi réel
EMAIL_FROM_NAME="AfriMarket"
EMERGENT_LLM_KEY="<clé Emergent>"                      # requis pour l'upload d'images (stockage objet). Vide = upload désactivé
```

> **Stockage objet / upload d'images** : l'upload des images produits (galerie) et le service des fichiers (`/api/files/...`) utilisent le stockage objet Emergent via `EMERGENT_LLM_KEY`. Sans cette clé, l'application démarre normalement mais l'upload de fichiers échouera (les URLs d'images externes restent utilisables). En déploiement Emergent, la clé est fournie automatiquement dans l'onglet Secrets.

Lancer :
```bash
uvicorn server:app --host 0.0.0.0 --port 8001
# Production : uvicorn server:app --host 0.0.0.0 --port 8001 --workers 4
```

Toutes les routes API sont préfixées par `/api`. Vérification :
```bash
curl http://localhost:8001/api/
```

---

## 4. Frontend (React)

```bash
cd frontend
yarn install
```

Créer `frontend/.env` (modèle : `frontend/.env.example`) :
```env
REACT_APP_BACKEND_URL=https://votre-domaine-backend.com   # URL publique du backend (sans /api final)
```

Développement :
```bash
yarn start          # http://localhost:3000
```

Build de production :
```bash
yarn build          # génère le dossier build/
# servir avec nginx, serve, ou un CDN
npx serve -s build
```

---

## 5. Déploiement en production

### Option A — Reverse proxy (nginx) sur un serveur
- Servir `frontend/build` en statique.
- Proxy `/api` → `http://127.0.0.1:8001`.
- Backend géré par un superviseur (systemd, supervisor, pm2) + `--workers`.

Exemple nginx :
```nginx
server {
  listen 80;
  server_name votre-domaine.com;

  location /api {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
  location / {
    root /var/www/afrimarket/build;
    try_files $uri /index.html;   # routage SPA
  }
}
```

### Option B — Conteneurs (Docker)
- Backend : image python:3.11-slim, `pip install -r requirements.txt`, `uvicorn ... --workers 4`.
- Frontend : build multi-stage node → nginx.
- MongoDB : service `mongo` ou Atlas.

### Option C — Déploiement Emergent (1 clic)
Depuis l'interface Emergent, utilisez le bouton **Deploy** : la plateforme construit et héberge le backend, le frontend et fournit une URL de production. Les variables secrètes (`JWT_SECRET`, `EMERGENT_EMAIL_KEY`, etc.) se configurent dans l'onglet **Secrets**.

---

## 6. Sécurité / production (à faire avant mise en ligne réelle)
- Restreindre `CORS_ORIGINS` à votre domaine (au lieu de `*`).
- Générer un `JWT_SECRET` unique et fort ; changer `ADMIN_PASSWORD`.
- Activer les **transactions MongoDB** (replica set) pour les opérations financières.
- Remplacer les MOCK : OTP téléphone (Twilio), paiement (Mobile Money/Stripe).
- Hacher/expirer les codes OTP et de vérification e-mail.
- Activer HTTPS partout ; protéger l'accès aux documents KYC.

---

## 7. Comptes de démonstration
| Rôle | E-mail | Mot de passe |
|------|--------|--------------|
| Super Admin | flavorfrancois@gmail.com | Admin@2026 |
| Commerçant (approuvé) | marchand@demo.com | Demo@2026 |
| Commerçant (en attente) | marchand3@demo.com | Demo@2026 |
| Client (Simple) | client@demo.com | Demo@2026 |
| Client (Entreprise) | client2@demo.com | Demo@2026 |

OTP téléphone (MOCK) : **123456**.

### Comptes de test additionnels (mot de passe : `Test@2026`)
| Rôle | E-mails |
|------|---------|
| Clients | client.test1@afrimarket.demo … client.test5@afrimarket.demo |
| Commerçants | marchand.test1@afrimarket.demo, marchand.test2@…, marchand.test3@… |
| Gestionnaire produits (PRODUCT_MANAGER) | gestionnaire.produits@afrimarket.demo |
| Gestionnaire commandes (ORDER_MANAGER) | gestionnaire.commandes@afrimarket.demo |

Les administrateurs/gestionnaires se connectent via la page `/login` et sont redirigés vers `/admin`.

> ⚠️ Changez tous ces mots de passe avant tout déploiement en production.

---

## 8. Endpoint d'export de l'application
`GET /api/download/export` sert l'archive `afrimarket_export.zip` (code + configuration `.env.example` + dump MongoDB + ce guide).
> ⚠️ **Production** : cet endpoint expose un dump de base de données. Protégez-le (authentification admin) ou retirez-le avant la mise en ligne réelle.

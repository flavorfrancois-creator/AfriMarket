# PRD — AfriMarket (Plateforme e-commerce multi-boutiques)

## Problème / Vision
Marketplace SaaS multi-boutiques pour l'Afrique : commerçants créent et gèrent leurs boutiques (après KYC + validation admin), clients achètent, gagnent bonus/recettes et retirent leurs gains. Multi-devises africaines, interface FR/EN/ES, paiement MOCK extensible (Mobile Money/Monity).

## Stack
- Backend: FastAPI + MongoDB (motor). Modules: server.py (routes), security.py (JWT/bcrypt/RBAC), business.py (finance), config_data.py (52 pays/devises), emailer.py (Resend), seed.py (démo).
- Frontend: React 19 + React Router + Tailwind + shadcn/ui + recharts + sonner. i18n FR/EN/ES. Auth par Bearer token (localStorage).
- Intégrations: Auth JWT custom (bcrypt), Email Resend (Emergent managed), OTP téléphone MOCK.

## Personas
- SUPER_ADMIN : gère plateforme, valide boutiques/KYC, traite retraits, audit.
- MERCHANT : onboarding (vérif tél/email → KYC → boutique → soumission), dashboard boutique.
- CLIENT : achète, portefeuille (bonus/recettes), parrainage INVITE, retraits.

## Règles financières (côté serveur, vérifiées par tests)
- Bonus promo = prix normal (selon type) − prix promotionnel.
- Recette : RPE=X·(PCS−PE), RPP=X·(PCS−PP), RPR=X·(PCS−PPR), X configurable par boutique (défaut 0.5).
- Crédits PENDING à la commande → AVAILABLE à la livraison ; restock + suppression PENDING si ANNULEE/REJETEE.
- Retrait : refus si > solde dispo, anti double-demande, débit idempotent au statut TRAITE.
- Stock décrémenté atomiquement ($inc conditionnel) avec rollback.

## Implémenté (2026-06 — v1)
- Auth complète : register/login/me/logout implicite, forgot/reset password, vérif OTP tél (MOCK) + email (Resend).
- Onboarding marchand multi-étapes + KYC + création/soumission boutique.
- Admin : dashboard global, file d'approbation boutiques (approve/reject + motif + validation KYC), users, orders, retraits, pays/devises, audit log.
- Marchand : dashboard (stats+graph), articles CRUD (4 prix + promo), commandes (cycle de vie), suivi client (types), stocks, statistiques, fidélités, promotions, opportunités (produits similaires), paramètres (coefficients).
- Client : dashboard, commandes, portefeuille (ledger + 5 sous-soldes), retraits, invitation, profil, favoris.
- Public : accueil, recherche produits/boutiques, catégories, fiches produits (grille prix par type), panier, checkout (MOCK), pages statiques.
- Données démo (3 boutiques, 6 produits, commandes, wallet) marquées is_demo.
- 52 pays/devises africaines configurables ; multi-devises par boutique.
- RBAC, isolation par boutique, audit log, anti double retrait/remboursement.

## Testé
- 21/21 tests backend (auth, isolation, finance, cycle commande, wallet, retraits idempotents). Flows frontend clés OK. Suite: /app/backend/tests/backend_test.py.

## Implémenté (2026-06 — Phase 1 admin : Module 1 + Module 9)
- **Module 1 — Sécurité & identité :** 2FA par OTP à la connexion (canaux email réel via Resend, SMS/WhatsApp MOCK avec code loggé/renvoyé en dev_code) ; portée configurable par l'admin (NONE/STAFF/ALL) ; challenge `/auth/2fa/verify` ; préférence 2FA par compte (`/auth/2fa`). Journal des connexions (IP, user-agent, date) via `login_journal`. Audit trail étendu (nouvelles actions RBAC/staff/settings/approvals).
- **Module 9 — Admins & gestionnaires (RBAC) :** 6 rôles (SUPER_ADMIN, ADMIN, SHOP_ADMIN, PRODUCT_MANAGER, ORDER_MANAGER, MODERATOR, ACCOUNTANT). Permissions granulaires par module (11 modules, cocher/décocher). CRUD gestionnaires (super-admin). Rattachement à des boutiques (`shop_ids`). Statuts ACTIVE/SUSPENDED/DISABLED (blocage login + token_version bump). Délégation temporaire (fenêtre start/end). Double-validation des actions sensibles (retrait > seuil configurable, suppression vendeur) via `approval_requests` (2ᵉ admin ≠ demandeur).
- Endpoints admin existants migrés vers gating par permission (`require_module`). Login bloqué si statut ≠ ACTIVE (tous rôles). Référence obligatoire pour retrait TRAITE (fix iter4).
- Frontend : étape 2FA au login ; nav admin filtrée par permissions ; pages `/admin/staff`, `/admin/security`, `/admin/approvals`, `/admin/journal` ; bouton suppression vendeur (double-validation) dans Utilisateurs.
- Testé : iteration_5.json — 16/16 tests Phase 1 + tous les flux UI Phase 1 validés. (4 échecs de régression pré-existants dus à la dérive des données de seed, non liés à Phase 1.)

## Implémenté (2026-06 — Module 2 : Boutiques)
- **Suspension / réactivation** de boutiques par l'admin (motif, notification vendeur). Une boutique suspendue disparaît des listes/fiches publiques, ses produits sont masqués, et toute commande la concernant est bloquée. Création de produit bloquée si boutique suspendue.
- **Commissions configurables** : défaut plateforme (global), par catégorie, et override par boutique. Précédence : boutique > catégorie > défaut. La commission est calculée par ligne et stockée sur chaque commande (`commission`, `commission_rate`) au checkout.
- **Quotas produits** : quota par défaut global + override par boutique ; création de produit refusée (403) au-delà du quota. **Quota de stockage (Mo)** désormais appliqué réellement : poids des images produit (data: décodé, sinon longueur) sommé par boutique ; création/mise à jour refusée si le quota est dépassé. Usage exposé (`storage_used_mb`, `product_count`) dans /shops/mine et l'admin.
- Endpoints : PUT /admin/shops/{id}/suspend|reactivate|commission|quota ; /admin/settings étendu (default_commission_rate, category_commissions, default_product_quota) ; product_count dans /admin/shops ; `_public_shop` masque commission/quota/suspension.
- Frontend : /admin/shops (onglet Suspendues, colonnes Produits & Commission, badge SUSPENDUE, dialog « Gérer » avec commission/quota/suspension) ; /admin/security (carte Commissions & quotas globales + par catégorie). **Tableau de bord admin** : indicateur « Revenus commission » (global `commission_total`) + tableau « Revenus de commission par boutique » (`commission_by_shop`, CA + commission par devise).
- Testé : iteration_6.json — 11/11 backend + tous les flux UI validés.

## Implémenté (2026-06 — Module 3 : Produits, modération & signalements)
- **Workflow de modération** : nouveau produit → `moderation_status` PENDING ; visible/commandable seulement si APPROVED. Édition d'un produit → re-modération (repasse en PENDING). Refus avec motif visible par le commerçant. Migration : produits existants marqués APPROVED.
- **File de validation admin** : GET /admin/products (filtre status/flagged, avec report_count) ; PUT /admin/products/{id}/moderate (APPROVE/REJECT + notification vendeur). Colonne Modération côté marchand.
- **Signalements** : POST /products/{id}/report (client authentifié) ; escalade **automatique** (flagged=true + rapport « Système ») dès 3 signalements ouverts. Admin : GET /admin/reports (module moderation), PUT /admin/reports/{id} (DISMISS ou REJECT_PRODUCT → retire le produit + clôt les signalements). Bouton « Signaler ce produit » sur la fiche publique.
- Gating RBAC : modération produits = module `products` ; signalements = module `moderation`.
- Testé : iteration_7.json — 15/15 backend + tous les flux UI validés.

## Implémenté (2026-06 — Module 4 : Finance)
- **Factures PDF** générées côté serveur (reportlab) : GET /orders/{id}/invoice (accès acheteur / vendeur / staff), facture de marque AfriMarket, téléchargeable depuis le dashboard client (commande livrée) et les commandes marchand.
- **Reversements vendeurs** : à la livraison (LIVREE), crédit atomique du **net = sous-total − commission** dans le portefeuille `seller_payout` du commerçant + enregistrement `payouts`. Idempotent (claim atomique `payout_done`). Vues : GET /merchant/payouts, GET /admin/payouts (résumé brut/commission/net).
- **Export comptable** : GET /admin/export/accounting?format=csv|xlsx (CSV UTF-8 BOM `;`, XLSX openpyxl) — colonnes date/réf/boutique/client/statut/paiement/devise/sous-total/livraison/total/commission/net.
- Frontend : page admin **Reversements** (/admin/payouts) avec cartes récap + boutons Export CSV/Excel + tableau ; boutons Facture PDF (client livré, marchand). Gating RBAC module `finance`.
- Testé : iteration_8.json — 19/19 backend + tous les flux UI validés.

## Implémenté (2026-06 — Module 5 : Livraisons, cœur)
- **Vue commandes multi-boutiques admin** (/admin/orders) : filtres boutique / statut / transporteur / dates, colonne transporteur, badge RETARD, bannière d'alerte retard (`late_count`), téléchargement d'étiquette.
- **Transporteurs modulaires** (collection `carriers`, 5 seeds : Colissimo/Chronopost/UPS/DHL/Local) : CRUD admin (module settings) — ajout, activation, suspension/réactivation, suppression, délai SLA par transporteur. GET /carriers pour la sélection.
- **Attribution + étiquette + suivi** : PUT /orders/{id}/shipping (marchand) assigne transporteur + n° de suivi ; GET /orders/{id}/label = étiquette PDF avec code-barres Code128 (marchand/admin). EXPEDIEE renseigne `shipped_at` + `expected_delivery` (= expédition + délai transporteur).
- **Alertes retard** : `is_late` calculé (EXPEDIEE non livrée dont l'échéance est dépassée) + filtre `late=true` + compteur.
- Frontend : page admin Transporteurs (CRUD), commandes marchand avec sélecteur de transporteur + étiquette + facture.
- Testé : iteration_9.json — 11/11 backend + tous les flux UI validés.

## Implémenté (2026-06 — Suivi Client : timeline de suivi de commande)
- **Timeline de suivi** (frontend only, données déjà exposées par `/orders/mine` et `/shops/{id}/orders`) : bouton « Suivre » sur chaque carte commande, côté **Client** (/account/orders) et **Marchand** (commandes boutique). Ouvre un dialog avec timeline verticale des étapes (Commande passée → Confirmée → En préparation → Prête → Expédiée → Livrée) dérivée de `status_history`, chaque étape franchie horodatée, étape courante marquée « En cours », étapes futures grisées.
- En-tête du dialog : transporteur (`carrier_name`), n° de suivi (`tracking_number`), date de livraison estimée (`expected_delivery`, ou « Livrée le … » si LIVREE). Alerte de retard si EXPEDIEE non confirmée et échéance dépassée. Cas terminaux (ANNULEE/REJETEE/REMBOURSEE) affichés en encart dédié.
- Composant réutilisable `/app/frontend/src/components/OrderTracking.jsx` (TrackingButton + TrackingDialog + TrackingTimeline).
- Testé : iteration_10.json — 100% frontend, aucun bug/régression.

## Implémenté (2026-06 — Module 8 : Reporting Ventes)
- **Dashboard reporting admin** (`/admin/reporting`, module RBAC `reporting`) : KPIs **groupés par devise** (CA, commission plateforme, net vendeurs, nb commandes, articles, panier moyen) — évite de sommer des devises différentes.
- **Sélection de période** : presets Mois / Trimestre / Semestre / Année + **plage personnalisée via calendrier** (react-day-picker range dans un Popover). Défaut = mois en cours.
- **Graphique d'évolution du CA** (recharts BarChart) : granularité quotidienne si span ≤ 62 jours, sinon mensuelle.
- **Top boutiques / vendeurs** (CA, commission, nb commandes) et **Top produits** (quantité vendue + CA généré), + répartition des commandes par statut.
- **Export CSV** : `GET /admin/reporting/export?date_from=&date_to=` (UTF-8 BOM, séparateur `;`, sections CA par devise / top boutiques / top produits / statuts).
- Endpoints : `GET /admin/reporting`, `GET /admin/reporting/export` (helper `_compute_reporting`).
- Testé : iteration_11.json — 8/8 backend + 100% flux UI (presets, calendrier, graphique, tableaux, export CSV 200 text/csv, RBAC ACCOUNTANT).

## Implémenté (2026-06 — Module 8 : Reporting Fraude / détection d'anomalies)
- **Alertes d'anomalies** affichées en haut de `/admin/reporting` (calculées sur la période, `rep['anomalies']`) : paniers anormaux (montant > moyenne + σ×écart-type par devise), pic d'annulations global + par boutique, clients à surveiller (annulations répétées), pic de remboursements. Chaque alerte : type, sévérité (rouge/ambre/bleu), message explicite.
- **Seuils configurables** depuis Paramètres (`/admin/security`) : `fraud_basket_sigma` (σ, défaut 3), `fraud_cancel_rate` (défaut 30%), `fraud_customer_cancels` (défaut 3), `fraud_refund_count` (défaut 3). Ajoutés à `DEFAULT_SETTINGS`, `SettingsReq` et `PUT /admin/settings`.
- Helper backend `_detect_anomalies(orders, date_from, date_to, settings)`.
- Testé : iteration_12.json — 5/5 backend + 100% flux UI ; seuils modifient bien les alertes en direct, aucune régression.

## Implémenté (2026-06 — Module 7 : Paramétrage global, partiel)
- **Éditeur de pages légales** (FR) : admin édite titre + corps de CGU/CGV (`terms`), Confidentialité (`privacy`), Mentions légales (`mentions`), FAQ (`faq`), Contact (`contact`). Stocké dans `platform_settings.legal_content`. Endpoint public `GET /api/legal` (fallback sur `LEGAL_DEFAULTS`). Les pages publiques `StaticPage` récupèrent le contenu édité.
- **Taxes par pays / zone** : collection `tax_rules` (pays, zone/région optionnelle, taux %, libellé, actif). CRUD admin `GET/POST/PUT/DELETE /admin/taxes` (module settings). Toggle global `taxes_enabled`. **Configuration/affichage uniquement — aucun impact sur les totaux du checkout** (choix utilisateur).
- Page admin `/admin/settings-global` (nav « Paramétrage global », module settings) : éditeur légal + gestion des taxes. `SettingsReq`/`PUT /admin/settings` étendus (`legal_content`, `taxes_enabled`) ; `DEFAULT_SETTINGS` mis à jour.
- **Thème/logo : non implémenté** (skippé par l'utilisateur pour l'instant).
- Testé : iteration_13.json — 5/5 backend + 100% flux UI (éditeur légal + répercussion publique, CRUD taxes, toggles), aucune régression.

## Implémenté (2026-06 — P1 Lot A : Produits enrichis)
Système client (types PCS/PP/PPR/PE, coefficients, bonus/fidélité) **préservé intact**.
- **Variantes produit** : chaque variante redéfinit ses 4 prix + stock + SKU + label. Stock produit = somme des stocks de variantes. Checkout adapté : `CartItem.variant_id`, sélection obligatoire d'une variante (400 sinon), prix calculé sur la variante selon le type client, décrément atomique du stock de variante (`variants.$.stock`) + restauration en cas d'échec (`_restore_stock`).
- **Multi-images (upload réel)** : intégration **stockage objet Emergent** (`backend/storage.py`, `EMERGENT_LLM_KEY`). `POST /api/upload/image` (validation type/6 Mo) + `GET /api/files/{path}` (public). Galerie produit multi-images côté marchand (`ImageUploader`) et affichée sur la fiche publique (miniatures cliquables).
- **Import CSV/Excel** : `POST /api/products/import` (gated par `csv_import_enabled`), `GET /api/products/import/template` (modèle), rapport d'erreurs ligne par ligne. **Activable/désactivable par l'admin** via `/admin/settings-global` (toggle `csv-import-toggle`) ; bouton marchand masqué + 403 si désactivé. `GET /api/features` expose l'état au frontend.
- Frontend : `CartContext` keye les lignes par `product_id::variant_id` ; `Public.jsx` ProductDetail (galerie + sélecteur de variantes + prix dynamique) ; `Merchant.jsx` (ImageUploader, VariantsEditor, dialog import CSV).
- Testé : iteration_14.json — 11/11 backend + 100% flux UI. Aucune régression du pricing client. Correctifs LOW appliqués (testids variantes PP/PPR/PE, DialogDescription).
- **Reste du P1 (à venir)** : Lot B Codes promo, Lot C Livraison (zones/frais/délais, en complément admin), Lot D Remboursements vendeur.

## Comptes de test créés (2026-06) — password Test@2026
- 5 clients : client.test1..5@afrimarket.demo (CLIENT)
- 3 commerçants : marchand.test1..3@afrimarket.demo (MERCHANT, à onboarder)
- 2 gestionnaires : gestionnaire.produits@afrimarket.demo (PRODUCT_MANAGER), gestionnaire.commandes@afrimarket.demo (ORDER_MANAGER)
- ZIP d'installation régénéré (code + dump MongoDB frais + .env.example, sans secrets) : `GET /api/download/export` → https://shop-platform-755.preview.emergentagent.com/api/download/export
- Testé : iteration_15.json — 14/14 backend (login des 10 comptes OK, staff listés, ZIP 200/valide, aucune régression).

## Règle métier (2026-06) — Promotions sans bonus
- **Un achat en promotion ne génère plus AUCUN bonus** (`business.py::compute_line`, `bonus = 0.0`). Le prix promo continue de s'appliquer ; seul le bonus est supprimé. Recette (PARTENAIRE/PRO/ENTREPRISE) et marges revendeur inchangées.
- Copie FAQ/légale mise à jour en conséquence (backend `LEGAL_DEFAULTS` + `Public.jsx`).
- Testé : iteration_16.json — 4/4 backend (bonus=0 sur promo, prix promo appliqué, wallet bonus_promo non crédité, aucune régression recette/variantes).

## Fonctionnalité (2026-06) — Validation admin des gains clients
- **Nouveau flux de disponibilité** : les gains clients (bonus_promo + earning_partner/pro/enterprise = recettes ET marges revendeur) restent `PENDING` à la commande, puis passent en **`AWAITING_VALIDATION`** à la **livraison** (au lieu de devenir disponibles automatiquement). Un admin doit les **valider** (→ `AVAILABLE`) ou les **rejeter** (→ `REJECTED`). `wallet_balances` compte `AWAITING_VALIDATION` comme *pending*.
- **Page admin `/admin/earnings`** (« Validation gains », module `finance`) : liste des gains avec client/montant/origine/statut, boutons Valider/Rejeter, compteurs (à valider / en attente de livraison). Endpoints `GET /admin/earnings`, `POST /admin/earnings/{id}/validate`, `POST /admin/earnings/{id}/reject` (audit + notification client).
- Annulation de commande : suppression des gains `PENDING` **et** `AWAITING_VALIDATION`. Reversement vendeur (seller_payout) reste crédité `AVAILABLE` à la livraison (inchangé).
- Correctif : jointure client via `ObjectId(_id)` (les users n'ont pas de champ `id`).
- Testé : iteration_17.json (5/5) + iteration_18.json (100% back+front) — flux complet validé, noms clients affichés, aucune régression.

## Roadmap modules admin restants (par phases testées)
- **Module 5 (reste) — SAV & litiges :** retours/tickets SAV, médiation acheteur/vendeur, remboursements.
- **Module 6 — Acheteurs :** modération comptes clients, avis/notations + modération, RGPD (export/suppression).
- **Module 7 — Paramétrage global :** éditeur CGU/CGV/mentions, modes paiement/retrait (Monity/Stripe/PayPal/mobile money/VISA), thème (logo/couleurs), taxes par pays/zone, routes & points relais/dépôt/retrait, tarifs transport (km/kg/volume/route) + frais douane/transit.
- **Module 8 — Reporting :** dashboards KPI (CA global/par boutique, top vendeurs/produits), trafic & conversion, alertes fraude/anomalies, système routes/trafic.
- Transversal : notifications temps réel (polling), doc API REST, responsive desktop.

## Backlog (P1/P2)
- P1: Remboursements (argent/code/bonus), variantes produit multi-dimensions, frais livraison par distance/zone (moteur), messages/signalements/litiges, greffe complément de stock inter-boutiques.
- P1: Vrai SMS (Twilio) + emails transactionnels étendus, stockage objet pour images/KYC (upload réel).
- P2: Intégration paiement réelle (Mobile Money/Stripe), conversion multi-devises, permissions granulaires par sous-rôle boutique, transactions Mongo (replica set), pagination/cache, notifications email/SMS.

## Notes techniques
- server.py monolithique (~1150 lignes) — à découper en routers ultérieurement.
- CORS ouvert (tokens en localStorage) — à restreindre en prod.
- Codes OTP/email en clair (MOCK/démo) — hacher + TTL en prod.

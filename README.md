# RecipeLog

> **Gestion de recettes de pâtisserie — Application web auto-hébergée**

Outil personnel de gestion de recettes conçu pour un usage en pâtisserie professionnelle (BTM). Auto-hébergé sur Proxmox LXC, intégré à l'écosystème [`super-nono.cc`](https://super-nono.cc).

**Version actuelle : V1.5** · En production sur [`recipe.super-nono.cc`](https://recipe.super-nono.cc)

---

## 📋 Documentation

- **[Cahier des charges V1.5](./CDC.md)** — Spécifications complètes + changelog détaillé
- **[Guide d'installation dev](./docs/INSTALL.md)** — Environnement local (Node, Docker, pnpm)
- **[Guide de déploiement prod](./docs/DEPLOYMENT.md)** — Proxmox LXC + Cloudflare Zero Trust

---

## ✅ Fonctionnalités

### 🍰 Recettes
- Création / édition / suppression de recettes avec photo
- Ingrédients en grammes avec **masse totale calculée automatiquement**
- **Saisie en liste** (champ par champ) ou **texte libre** (parsing intelligent multi-format)
- **Autocomplétion des ingrédients** : base constituée automatiquement au fil des saisies, dropdown debounced 200 ms
- Étapes en texte riche (gras, italique, souligné) via Tiptap
- Tags libres + catégories colorées
- Note 1–5 étoiles, favori
- Source (livre, site, chef)
- Notes & astuces
- **Rangement dans un dossier** (0 ou 1 dossier par recette)
- Duplication en un clic

### 🗂️ Organisation
- **Dossiers** : vue explorateur style Apple Files (grille de cards), fil d'Ariane, rangement en masse
- **Catégories colorées** : tags secondaires structurés pour décrire la recette
- **Tags libres** : mots-clés libres pour la recherche
- **Recherche globale** : barre de recherche toutes recettes (tous dossiers confondus) + filtres tag/catégorie
- **Favoris** : page dédiée avec filtre favoris

### 🧮 Multiplication & sous-recettes
- **3 modes de calcul** : coefficient libre · masse totale cible · ingrédient pivot
- **Sous-recettes** imbriquées pour composer des entremets complexes
- Propagation en cascade du coefficient global
- **Verrouillage individuel** 🔒 des sous-recettes pour un contrôle fin
- **Masse exacte ⚖️** : ajuste ±1g sur les plus gros ingrédients pour atteindre la masse cible exacte (disponible dans les 3 panneaux de modification)
- **Mettre à jour la recette** : applique le coefficient affiché comme nouvelle base en BDD

### 📖 Cahiers PDF
- Création de cahiers multi-recettes
- **Mode liée** 🔗 (recalcul dynamique) ou **figée** 📌 (snapshot au moment de l'ajout)
- Auto-filtre des recettes déjà dans le cahier lors de l'ajout
- Drag & drop pour réordonner les entrées
- Pages chapitres avec titre, intro, image
- Titres de section entre les recettes
- **Génération PDF** via Puppeteer (Chromium headless)
- Templates : classique · moderne · fiche technique · magazine
- Formats A4 et A5
- Page de garde personnalisable (titre, couleur d'accent, image)
- Sommaire avec sous-recettes indentées (`↳`)
- **1 page par recette** (parent + chaque sous-recette sur sa propre page)
- Numérotation logique (couverture + sommaire exclus)
- Pied de page 3 zones (gauche / **numéro centré** / droite)
- Aperçu PDF manuel sans enregistrement

### 📄 PDF d'une recette seule
- Téléchargement PDF d'une recette individuelle
- Réglages personnalisés dans les paramètres (format, couleurs, polices, sections)

### 🛒 Liste de courses
- Création de listes nommées
- Génération automatique depuis une recette (tous ingrédients extraits)
- Cases à cocher par article
- Partage d'une liste via lien public

### 🔗 Partage public
- Partage d'une recette via lien public (token UUID)
- Vue lecture seule sans authentification (bypass Cloudflare Zero Trust)

### ⚙️ Paramètres
- **Dossiers** : CRUD complet + rangement en masse (`/settings/folders`)
- **Catégories** : CRUD complet avec couleur (`/settings/categories`)
- **Ingrédients** : base consultable, renommer, supprimer (`/settings/ingredients`)
- **Lien du logo** : URL externe ouverte au clic depuis l'accueil (configurable)
- **Réglages PDF** : format, couleurs, polices pour les PDF individuels
- **Import Recipe Keeper** : import CSV ou HTML/ZIP avec extraction des photos
- **Mise à jour du site** : bouton qui déclenche `deploy.sh` sur le serveur

---

## 🏗️ Stack technique

| Couche | Choix |
|---|---|
| **Framework** | Next.js 15 (App Router, Server Actions) |
| **Langage** | TypeScript strict |
| **ORM** | Prisma 6 |
| **Base de données** | PostgreSQL 17 |
| **Style** | Tailwind CSS v4 + design system FuelLog |
| **Validation** | Zod |
| **PDF** | Puppeteer 24 + pdf-lib (fusion multi-pass) |
| **Éditeur riche** | Tiptap v3 (StarterKit + Underline + Placeholder) |
| **Tests** | Vitest 4 (50 tests unitaires) |
| **Hébergement** | LXC Debian 12 sur Proxmox |
| **Accès** | Cloudflare Zero Trust |
| **Domaine** | `recipe.super-nono.cc` |

---

## 🚀 Commandes

### Développement local

```bash
pnpm install
cp .env.example .env          # remplir DATABASE_URL et autres vars
docker compose up -d          # démarre PostgreSQL en local
pnpm exec prisma migrate dev  # applique les migrations
pnpm exec prisma db seed      # peuple les données initiales
pnpm dev                      # http://localhost:3000
```

### Tests

```bash
pnpm test                     # lance tous les tests Vitest
pnpm test --watch             # mode watch
```

### Base de données

```bash
pnpm exec prisma migrate dev --name <nom>   # nouvelle migration
pnpm exec prisma migrate deploy             # applique en prod
pnpm exec prisma generate                   # regénère le client Prisma
pnpm exec prisma studio                     # interface graphique BDD
```

### Production — Proxmox LXC

**Installation initiale** (dans le container Debian 12) :

```bash
apt-get install -y curl git
curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/main/deploy/proxmox/setup.sh | bash
```

**Déploiement / mise à jour** (depuis le container ou via le bouton dans `/settings`) :

```bash
bash /opt/recipelog/deploy/proxmox/deploy.sh
```

Le script enchaîne : `git pull` → `pnpm install` → `prisma migrate deploy` → `prisma generate` → `pnpm build` → `systemctl restart recipelog`

**Commandes de gestion du service** :

```bash
systemctl status recipelog      # état du service
systemctl restart recipelog     # redémarrer l'app
systemctl stop recipelog        # arrêter
journalctl -u recipelog -f      # logs en temps réel
journalctl -u recipelog -n 100  # 100 dernières lignes de logs
```

**Commandes PostgreSQL** :

```bash
# Vérifier que la BDD tourne
pg_lsclusters

# Se connecter à la base
sudo -u postgres psql -d recipelog

# Réinitialiser le mot de passe du user recipelog (si connexion impossible)
sudo -u postgres psql -c "ALTER USER recipelog WITH PASSWORD 'nouveau_mdp';"

# Backup manuel
bash /opt/recipelog/deploy/proxmox/backup.sh
```

**Collecte de logs** :

```bash
bash /opt/recipelog/deploy/proxmox/collect-logs.sh
```

---

## 📁 Structure du projet

```
src/
├── app/
│   ├── page.tsx                  # Accueil — vue explorateur / recettes
│   ├── recipes/[id]/             # Fiche recette + édition
│   ├── favorites/                # Page favoris
│   ├── cookbooks/                # Cahiers PDF
│   ├── shopping/                 # Listes de courses
│   ├── settings/                 # Paramètres
│   │   ├── folders/              # Gestion des dossiers
│   │   ├── categories/           # Gestion des catégories
│   │   └── ingredients/          # Gestion de la base d'ingrédients
│   ├── share/                    # Vue publique partagée
│   └── api/
│       └── ingredient-bases/     # Autocomplétion ingrédients
├── components/                   # Composants React réutilisables
├── lib/                          # Logique métier, Prisma, PDF, utils
└── app/actions/                  # Server Actions Next.js
prisma/
├── schema.prisma                 # Modèle de données
└── migrations/                   # Migrations versionnées
deploy/
└── proxmox/
    ├── setup.sh                  # Installation initiale LXC
    ├── deploy.sh                 # Mise à jour prod
    ├── backup.sh                 # Backup manuel
    └── collect-logs.sh           # Collecte de logs
```

---

## 🗺️ Roadmap

### En cours / priorité haute
- [ ] **Logo personnel** sur les cahiers PDF (UI prévue, branchement à finaliser)
- [ ] **Export JSON** — sauvegarde complète des données (recettes, ingrédients, dossiers)

### Priorité moyenne
- [ ] **Import depuis URL** — coller un lien de recette → import automatique (titre, ingrédients, étapes, photo)
- [ ] **Coût de revient** — base d'ingrédients avec prix unitaire, calcul auto du coût total et par portion
- [ ] **Liste de courses** — groupement par rayon magasin

### Priorité basse / nice-to-have
- [ ] **PWA + mode hors-ligne** — installation sur mobile + consultation des recettes sans réseau
- [ ] **Backups automatiques externes** — envoi vers S3 / Backblaze / NAS sur cron
- [ ] **Scan OCR** — photo d'une recette papier → conversion en texte éditable
- [ ] **Partage de liste de courses** — lien partageable vers une liste

### Hors périmètre (non prévu)
- Conversion d'unités automatique (g ↔ ml ↔ cuillères)
- Multi-utilisateurs / gestion de comptes
- Calendrier de cuisine / planificateur de repas
- Recherche par IA / langage naturel

---

## 🌐 Écosystème super-nono.cc

| Outil | Rôle |
|---|---|
| **FuelLog** | Suivi carburant |
| **Salaire** | Calculateur fiches de paie |
| **RecipeLog** | *(ce projet)* Gestion de recettes |
| **n8n** | Automatisation |
| **DiscoPanel** | Gestion serveur Minecraft |
| **BotPanel** | Notifications Discord |

---

*Projet personnel — Tous droits réservés*

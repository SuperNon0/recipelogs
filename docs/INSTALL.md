# RecipeLog — Installation (développement)

> Ce guide couvre l'installation en **environnement de développement local**. Les scripts Proxmox LXC pour la prod arrivent en phase 7.

## 1. Prérequis

- **Node.js** ≥ 20 (testé sur 22.x)
- **pnpm** ≥ 10
- **PostgreSQL** ≥ 15 (ou Docker + docker-compose pour l'embarqué)
- **Git**

## 2. Installation

```bash
git clone <repo>
cd recipelogs
pnpm install
cp .env.example .env
```

Adapter `DATABASE_URL` si nécessaire.

## 3. Base de données

### Option A — PostgreSQL local déjà installé

```bash
sudo -u postgres psql <<SQL
CREATE USER recipelog WITH PASSWORD 'recipelog' CREATEDB;
CREATE DATABASE recipelog OWNER recipelog;
SQL
```

### Option B — Docker

```bash
docker compose up -d
```

Puis initialisation du schéma :

```bash
pnpm db:migrate       # applique les migrations versionnées
pnpm db:seed          # injecte templates PDF + catégories par défaut
```

### Données de démo (optionnel)

```bash
pnpm tsx scripts/seed-test-recipe.ts
```

## 4. Lancement

```bash
pnpm dev              # http://localhost:3000
```

Build de production :

```bash
pnpm build
pnpm start
```

## 5. Scripts utiles

| Commande | Effet |
|---|---|
| `pnpm dev` | Dev server Next.js |
| `pnpm build` | Build production |
| `pnpm start` | Démarre le build |
| `pnpm typecheck` | Vérifie les types TypeScript |
| `pnpm db:migrate` | Applique les migrations Prisma |
| `pnpm db:push` | Push direct sans migration (dev rapide) |
| `pnpm db:studio` | Ouvre Prisma Studio |
| `pnpm db:seed` | Injecte les données de base |

## 6. Structure

```
recipelogs/
├── CDC.md                  # Cahier des charges V1.1
├── prisma/
│   ├── schema.prisma       # Modèle de données (16 entités)
│   ├── migrations/         # Migrations versionnées
│   └── seed.ts             # Seed : templates PDF + catégories
├── src/
│   ├── app/                # App Router Next.js 15
│   │   ├── actions/        # Server actions (CRUD recettes…)
│   │   ├── recipes/        # Routes recettes
│   │   ├── favorites/
│   │   ├── cookbooks/      # Placeholder phase 4
│   │   ├── shopping/       # Placeholder phase 5
│   │   ├── settings/
│   │   ├── layout.tsx      # Layout global (header, nav, polices)
│   │   ├── globals.css     # Design system FuelLog
│   │   └── page.tsx        # Liste recettes
│   ├── components/         # Composants UI
│   └── lib/                # Prisma client, helpers, validation
├── scripts/                # Scripts utilitaires (seed démo, etc.)
├── docker-compose.yml      # Postgres dev
└── docs/                   # Documentation
```

## 7. Déviation par rapport au CDC

Le CDC suggère un split `backend/` + `frontend/`. Ce projet utilise un **monolithe Next.js 15 (App Router)** : les routes API sont des Server Actions et Route Handlers intégrés au même repo. Ce choix simplifie la maintenance solo et réduit la surface d'exécution. Les contraintes LXC / Cloudflare ZT / PostgreSQL 15+ / PDF côté serveur restent respectées.

## 8. État d'avancement

- **Phase 1 — Cadrage & setup** ✓
- **Phase 2 — Socle & recettes V1** ✓ (CRUD, tags, catégories, favoris, recherche, commentaires)
- **Phase 3 — Multiplication & sous-recettes** ✓ (3 modes, cascade, verrouillage 🔒, détection de cycle)
- **Phase 4 — Cahiers & PDF** ✓ (CRUD cahiers, mode liée/figée, modal ajout recette, PDF Puppeteer, `/cookbooks/[id]/pdf` + `/recipes/[id]/pdf`)
- **Phase 5 — Listes de courses** ✓ (CRUD listes, ajout recettes avec coefficient, agrégation auto des ingrédients, items manuels, cases à cocher avec useOptimistic, bouton 🛒 depuis fiche recette)
- **Phase 6 — Partage public & paramètres** — À venir
- **Phase 7 — Scripts Proxmox** — À venir
- **Phase 8 — Tests & import initial** — À venir
- **Phase 9 — Mise en production** — À venir

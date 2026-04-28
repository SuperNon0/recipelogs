# RecipeLog — Document de transmission

> Document destiné à un développeur reprenant le projet.
> Dernière mise à jour : 2026-04-28.

---

## 1. Le projet en 30 secondes

**RecipeLog** = gestionnaire de recettes de pâtisserie auto-hébergé, pensé pour un usage pro (cap pâtissier / fiche technique BTM). Comble les manques de Recipe Keeper sur la précision (gramme près), la multiplication (3 modes), les sous-recettes, et la génération de cahiers PDF.

- **Domaine de prod** : `recipe.super-nono.cc`
- **Hébergement** : Proxmox LXC + Cloudflare Zero Trust
- **Cahier des charges complet** : [`CDC.md`](../CDC.md)

---

## 2. Stack technique

| Couche | Choix | Version |
|---|---|---|
| Framework | Next.js (App Router, Server Actions) | 15.1.4 |
| React | React + `useOptimistic` | 19 |
| Langage | TypeScript strict | 5.9 |
| ORM | Prisma | 6.19 |
| BDD | PostgreSQL + extension `pg_trgm` | 16 |
| Style | Tailwind CSS v4 + design system FuelLog | 4.2 |
| Validation | Zod | 3.x |
| PDF | Puppeteer (Chromium système) | 24.41 |
| Tests | Vitest | 4.1 |
| Package manager | pnpm | 10.33 |

**Architecture** : monolithe Next.js (pas de split frontend/backend). Les routes API sont des Server Actions et des Route Handlers. Voir [`docs/INSTALL.md`](./INSTALL.md) §7 pour la justification.

---

## 3. État d'avancement

| Phase | État |
|---|---|
| 1. Cadrage & setup | ✅ |
| 2. Socle & recettes V1 (CRUD, tags, catégories, favoris, recherche, commentaires) | ✅ |
| 3. Multiplication (3 modes) & sous-recettes (cascade, verrouillage, détection cycle) | ✅ |
| 4. Cahiers & PDF (CRUD cahiers, mode liée/figée, modal ajout, Puppeteer) | ✅ |
| 5. Listes de courses (CRUD, agrégation auto, useOptimistic) | ✅ |
| 6. Partage public & paramètres (ShareToken, /share/[token], CRUD catégories) | ✅ |
| 7. Scripts Proxmox (create/setup/deploy/backup/collect-logs) | ✅ |
| 8. Tests & import (39 tests, 5 suites, import CSV Recipe Keeper) | ✅ |
| 9. Mise en production | ✅ (déployé sur Proxmox `192.168.0.99`) |

---

## 4. Travail restant

### 🟡 Templates PDF — 3 sur 4 à styler

Le fichier [`src/lib/pdf/template.ts`](../src/lib/pdf/template.ts) définit un dispatcher `TemplateSlug` :

```typescript
export type TemplateSlug = "classique" | "moderne" | "fiche-technique" | "magazine";
```

**Seul `classique` a un CSS dédié** (reproduit le style BTM examen blanc — voir `docs/samples/BTM examen blanc_.pdf`). Les 3 autres slugs retombent actuellement sur le rendu classique via la fonction `getCss()`.

À faire :

| Template | Direction artistique | Fichier de référence |
|---|---|---|
| `moderne` | Dark mode / cream + bordeaux, serif typographique (DM Serif Display + Georgia), une seule colonne flowing | — |
| `fiche-technique` | Pro / spec sheet, tableaux compacts avec % de masse, header style étiquette (date, masse totale, n° fiche) | — |
| `magazine` | Editorial, photo plein bleed, drop-cap première lettre, ingrédients en sidebar | — |

**Approche recommandée** : extraire chaque template dans son propre fichier `src/lib/pdf/templates/<slug>.ts` exportant `getCss()` et `renderRecipeCard()`. Le dispatcher dans `template.ts` les compose. Pour les 3 manquants, repartir de la structure de `classique` (cover, TOC, recipe card, sub-recipe block, footer) et changer le CSS uniquement.

### 🟡 Tests à étendre

Suites actuelles dans `tests/` (39 tests passent) :
- `subRecipes.test.ts` — multiplication & cascade
- `shopping.test.ts` — agrégation des listes
- `format.test.ts` — utilitaires
- `importRecipeKeeper.test.ts` — parser CSV
- `parseIngredientsText.test.ts` — parser texte libre

Manque potentiellement :
- Tests E2E (Playwright) — pas commencé
- Tests sur la génération PDF (snapshot HTML)
- Tests sur les Server Actions (cookbooks, recipes)

### 🟡 Features secondaires non démarrées (hors scope V1)

Voir CDC.md pour le détail. Pas critique :
- **Recherche full-text** (`pg_trgm` activé mais index pas configurés)
- **Photos** des recettes (modèle Prisma prêt mais upload pas implémenté)
- **Authentification** (NEXTAUTH_SECRET dans `.env` mais pas de provider configuré — protégé par Cloudflare Access en prod)

---

## 5. Démarrage rapide

### Dev local

```bash
git clone https://github.com/SuperNon0/recipelogs
cd recipelogs
pnpm install
cp .env.example .env
docker compose up -d        # PostgreSQL local
pnpm db:migrate
pnpm db:seed
pnpm dev                    # http://localhost:3000
```

### Production (LXC Proxmox)

Container : Debian 12, 2 CPU, 2 Go RAM, 20 Go disque, **Nesting activé** (obligatoire pour Chromium).

```bash
# Sur l'hôte Proxmox
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/debian.sh)"

# Dans le container (après avoir activé Nesting)
apt-get install -y curl git && \
curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/main/deploy/proxmox/setup.sh | bash
```

Voir [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) pour le détail.

### Mise à jour (après push sur main)

Une seule commande dans le container :

```bash
bash /opt/recipelog/deploy/proxmox/deploy.sh
```

Le script gère : `git pull` → `pnpm install` → `prisma generate` → `prisma migrate deploy` → `pnpm build` → copie `static/` et `public/` dans `.next/standalone/` → `systemctl restart recipelog`.

---

## 6. Architecture & décisions

### Structure

```
src/
├── app/
│   ├── actions/          # Server Actions (cookbooks, recipes, shopping, settings, share, import)
│   ├── recipes/          # Routes recettes (list, detail, edit, new, pdf)
│   ├── cookbooks/        # Routes cahiers (list, detail, new, pdf)
│   ├── shopping/         # Listes de courses
│   ├── settings/         # CRUD catégories + import CSV
│   ├── share/[token]/    # Pages publiques
│   └── ...
├── components/           # Composants client (RecipeForm, AddToCookbookModal, ShareButton, etc.)
└── lib/
    ├── prisma.ts         # Client singleton
    ├── recipes.ts        # Queries recettes
    ├── cookbooks.ts      # Queries + buildRecipeSnapshot (figée)
    ├── shopping.ts       # Agrégation ingrédients
    ├── subRecipes.ts     # Multiplication cascade + détection cycle
    ├── share.ts          # Tokens publics
    ├── importRecipeKeeper.ts    # Parser CSV
    ├── parseIngredientsText.ts  # Parser texte libre (NEW)
    ├── pdf/
    │   ├── template.ts   # ⚠️ 4 templates, seul classique stylé
    │   └── renderer.ts   # Wrapper Puppeteer
    └── validation.ts     # Zod schemas
```

### Décisions importantes

1. **Monolithe Next.js** plutôt que split front/back. Réduit la surface d'exécution et simplifie le déploiement LXC.

2. **Pas d'auth applicative** — protection au niveau Cloudflare Zero Trust. Si déployé ailleurs, ajouter NextAuth ou Clerk.

3. **`output: "standalone"` toujours actif** (pas de condition NODE_ENV). Voir commit `fix(next.config): output standalone inconditionnel` — la condition lue avant que Next.js positionne `NODE_ENV=production` ne marchait jamais.

4. **Snapshot figé enrichi** (`buildRecipeSnapshot(recipeId, multiplier)`) — le multiplicateur permet de capturer une version multipliée de la recette dans un cahier sans modifier la recette source.

5. **Trois modes de multiplication identiques** entre la page recette (UI live) et la modale "Ajouter au cahier" (snapshot).

6. **Pas de stockage des "variantes"** d'une recette multipliée — c'est volontaire (CDC §2.3) : la multiplication est soit transient (page recette), soit figée dans un cahier.

7. **Saisie d'ingrédients : 2 modes** (`📋 Liste` / `📝 Texte libre`) avec import dans la liste structurée. Le parser texte libre est dans `src/lib/parseIngredientsText.ts` et accepte plusieurs formats (`200g farine`, `Farine\n- 200g`, `1kg sucre`, `500ml lait`).

---

## 7. Bugs corrigés pendant le déploiement (gotchas)

À connaître si on refait un container ou si on retombe dessus :

| Bug | Cause | Fix | Commit |
|---|---|---|---|
| `git clone` échoue avec "destination already exists" | `useradd --create-home --home /opt/recipelog` créait `.bashrc/.profile` avant le clone | `--home-dir` au lieu de `--create-home` + purge si dossier existe | `fix(setup.sh): collision dossier home / git clone` |
| `Module not found: '.prisma/client/index-browser'` | pnpm 10 bloque `postinstall` par défaut → client Prisma jamais généré | `pnpm exec prisma generate` explicite avant le build | `fix(setup.sh): prisma generate explicite avant le build` |
| `Cannot find module '.next/standalone/server.js'` | `next.config.ts` lu avant que NODE_ENV soit "production" → mode standalone jamais activé | `output: "standalone"` inconditionnel | `fix(next.config): output standalone inconditionnel` |
| Page web sans CSS (404 sur `/_next/static/css/*.css`) | Mode standalone : `static/` et `public/` ne sont pas auto-copiés dans `.next/standalone/` | `cp -r .next/static .next/standalone/.next/static` après chaque build | `fix(proxmox): copier static/ et public/ dans .next/standalone/` |
| Page web sans CSS (403 Forbidden) | nginx `www-data` ne pouvait pas traverser `/opt/recipelog` (perms restrictives) | `chmod 755 /opt/recipelog` + `chmod -R o+rX .next` | `fix(setup.sh): permissions pour que nginx serve les statiques` |

Tous ces fixes sont déjà dans `setup.sh` et `deploy.sh` actuels.

---

## 8. Configuration Cloudflare Zero Trust

- **Tunnel** : pointer vers `<IP-container>:80` ou `localhost:80` si `cloudflared` tourne dans le container
- **Public hostname** : `recipe.super-nono.cc` → `HTTP` → `localhost:80`
- **Access policy** : Self-hosted → email + OTP (ou autre selon préférence)
- **`NEXTAUTH_URL`** dans `/opt/recipelog/.env` doit matcher le domaine public

---

## 9. Logs & debug

| Action | Commande |
|---|---|
| Statut du service | `systemctl status recipelog` |
| Logs en temps réel | `journalctl -u recipelog -f` |
| Logs nginx | `tail -f /var/log/nginx/error.log` |
| Test direct Next.js | `curl -I http://localhost:3000` |
| Test via nginx | `curl -I http://localhost` |
| Bundle de logs (à transmettre) | `bash /opt/recipelog/deploy/proxmox/collect-logs.sh` |

`collect-logs.sh` génère `/tmp/recipelog-logs-<timestamp>.tar.gz` avec systemd, nginx, PostgreSQL, git, ports, etc.

---

## 10. Backup

Cron à configurer manuellement (pas dans `setup.sh` par défaut) :

```bash
crontab -e
# Ligne :
0 3 * * * /opt/recipelog/deploy/proxmox/backup.sh >> /var/log/recipelog-backup.log 2>&1
```

`backup.sh` fait `pg_dump` dans `/var/backups/recipelog/` avec rétention 30 jours.

---

## 11. Contacts & ressources

- **Repo GitHub** : https://github.com/SuperNon0/recipelogs
- **Cahier des charges** : [`CDC.md`](../CDC.md) — V1.1, validé
- **Guide install dev** : [`docs/INSTALL.md`](./INSTALL.md)
- **Guide déploiement prod** : [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md)
- **Sample PDF de référence** (style BTM) : [`docs/samples/BTM examen blanc_.pdf`](./samples/BTM%20examen%20blanc_.pdf)

---

## 12. Convention de commit / branche

- Branche de dev : `claude/develop-project-KAhMI` (legacy nom auto-généré, OK à renommer)
- PR vers `main` avec `squash merge`
- Préfixes de commit : `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
- Message en français (le projet l'est entièrement)

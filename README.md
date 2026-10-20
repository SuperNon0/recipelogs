# RecipeLog

> **Gestion de recettes de pâtisserie : application web auto-hébergée**

Outil personnel conçu pour la pâtisserie professionnelle (BTM). Il comble les manques de Recipe Keeper : précision au gramme, multiplication (3 modes), sous-recettes et cahiers PDF.

**Version actuelle : V1.7** · Production : [`recipe.super-nono.cc`](https://recipe.super-nono.cc) (Proxmox LXC + Cloudflare Zero Trust)

> Ce fichier est **la seule documentation du projet**. Il remplace l'ancien cahier des charges (`CDC.md`), le document de transmission (`HANDOFF.md`) et les guides `INSTALL.md` / `DEPLOYMENT.md`.

---

## Sommaire

1. [Mises à jour effectuées](#1--mises-à-jour-effectuées)
2. [Mises à jour proposées](#2--mises-à-jour-proposées)
3. [Problèmes connus restants](#3--problèmes-connus-restants)
4. [Fonctionnalités](#4--fonctionnalités)
5. [Règles de calcul](#5--règles-de-calcul)
6. [Architecture technique](#6--architecture-technique)
7. [Modèle de données](#7--modèle-de-données)
8. [Design system](#8--design-system)
9. [Installation (développement)](#9--installation-développement)
10. [Production (Proxmox LXC)](#10--production-proxmox-lxc)
11. [Historique des versions](#11--historique-des-versions)
12. [Conventions](#12--conventions)

---

## 1. 🆕 Mises à jour effectuées

### V1.7 (20 octobre 2026) : corrections et fiabilisation

**Bugs corrigés**

| # | Avant | Maintenant |
|---|---|---|
| 1 | **Dupliquer une recette** transformait toutes les unités (cc, cs, L, pièce, QS) en grammes. | Les unités sont conservées. La copie reste dans le même dossier et est trouvable par la recherche. |
| 2 | **« Mettre à jour la recette »** sur un ingrédient en litres donnait 500 **L** au lieu de 500 g. La valeur max d'une fourchette n'était pas multipliée. | Les litres sont convertis proprement en grammes et les fourchettes suivent le coefficient. |
| 3 | **Modifier une recette** utilisée comme sous-recette en mode « pivot » cassait le pivot : la sous-recette retombait à ×1 sans prévenir. | Le pivot est retrouvé automatiquement (même nom d'ingrédient, sinon même position). |
| 4 | **Saisie en texte libre / import CSV** : « 2 cc vanille » était enregistré comme 10 cc (≈ 50 g). | On garde le nombre de cuillères (2 cc ≈ 10 g). « 3 oeufs » donne maintenant 3 pièces au lieu de 0 g. |
| 5 | **Étapes affichées avec des balises `<p>`** dans les sous-recettes (anciennes recettes). | Affichage propre partout. |
| 6 | **Liste de courses** : 2 pièces + 100 g étaient additionnés (= 102), les sous-recettes étaient ignorées, et **toutes les cases se décochaient** dès qu'on ajoutait une recette. | Fusion uniquement à unité identique, sous-recettes incluses, unités affichées (écran et PDF), cases cochées conservées. |
| 7 | **Photos importées effacées à chaque mise à jour du site**, et jamais affichées. | Photos rangées dans `/var/lib/recipelog/uploads` (hors du build), affichées en haut de la fiche et incluses dans les sauvegardes. |
| 8 | **Cahier** : une recette ajoutée après un chapitre pouvait prendre la même place que lui. | Recettes et chapitres partagent correctement l'ordre. |
| 9 | **Recette figée** : « Mettre à jour le snapshot » remettait la masse d'origine (ex. 800 g → 400 g). | Le coefficient choisi est conservé. |
| 10 | **Recette figée** : « Modifier la masse » modifiait aussi les sous-recettes **verrouillées 🔒**, avec un arrondi différent. | Les sous-recettes verrouillées ne bougent plus et l'arrondi est identique partout. |
| 11 | **Recherche sans accents** : « creme » ne trouvait pas les recettes importées (CSV/HTML) ou dupliquées. | Toutes les recettes sont trouvées (la migration corrige aussi les recettes existantes). |
| 12 | **Masse totale différente selon l'écran** : la liste ignorait les litres, le formulaire ignorait L et les fourchettes, l'ajout au cahier ne comptait que les grammes. | Un seul calcul (`recipeMass`) utilisé partout. |
| 13 | **Cahier PDF vide** (sans recette ni couverture) : erreur serveur. | Message clair. |
| 14 | **Renommer une catégorie ou un dossier** avec un nom déjà pris : page d'erreur. | Message « existe déjà ». |

**Sécurité et serveur**
- **Partage public désactivé** : le site est entièrement derrière Cloudflare, donc les liens de partage ne fonctionnaient pas pour un tiers. Le bouton « Partager » est masqué et `/share/...` répond « introuvable ». Le code est conservé pour plus tard (voir [Mises à jour proposées](#2--mises-à-jour-proposées)).
- **Protection de `/share`** : même quand le partage sera réactivé, aucune action de modification ne pourra être lancée depuis cette adresse.
- **PDF un par un** : plusieurs PDF demandés en même temps lançaient plusieurs Chromium et pouvaient faire planter le serveur (limité à 800 Mo). Ils sont maintenant générés l'un après l'autre.
- **Sauvegarde** : `backup.sh` sauvegarde maintenant aussi les photos.

**Nettoyage du code**
- Suppression de l'ancien éditeur riche Tiptap (plus utilisé) et de ses 7 dépendances, ainsi que de fonctions jamais appelées.
- Code en double regroupé :
  - calcul de masse (7 copies → 1) ;
  - ajout à la base d'ingrédients (3 → 1) ;
  - renommer / fusionner un ingrédient (4 → 1) ;
  - génération PDF des cahiers (2 → 1) ;
  - formatage des quantités (5 → 1).
- La vérification des types TypeScript ne remonte plus aucune erreur (3 avant). Tests : 61, tous verts (6 échouaient avant).
- Documentation réunie dans ce seul fichier.

**Après le déploiement de cette version**
1. Cliquer **deux fois** sur « Mettre à jour le site » (la 1ʳᵉ fois, c'est encore l'ancien script de déploiement qui tourne ; la 2ᵉ installe le nouveau dossier photos).
2. Si les photos ont déjà été perdues : **Paramètres → Import Recipe Keeper → ZIP**, en réimportant le même ZIP. Les recettes existantes ne sont pas dupliquées, seules leurs photos sont rattachées.

---

## 2. 💡 Mises à jour proposées

Classées par intérêt. Chaque idée indique les options possibles.

### 🔗 Partage qui fonctionne vraiment
Aujourd'hui tout le site est protégé par Cloudflare, donc un lien partagé est bloqué. Options :
- **A. Bypass Cloudflare sur `/share/*`** (recommandé, le plus simple) : une règle Cloudflare Access « Bypass » limitée à ce chemin. Ensuite on passe `SHARE_ENABLED = true` dans `src/lib/features.ts`. La protection côté appli est déjà en place.
- **B. Sous-domaine public dédié** (`partage.super-nono.cc`) qui ne sert que `/share/*` : plus cloisonné, un peu plus de configuration.
- **C. Export autonome** : générer le PDF ou une page HTML à envoyer par message, sans lien public.

À ajouter en même temps : bouton « Télécharger le PDF » sur la page partagée, date d'expiration du lien, partage d'une liste de courses.

### 📄 Templates PDF
Seul le style « classique » est dessiné ; « moderne », « fiche technique » et « magazine » retombent dessus. Options :
- **Fiche technique** (style BTM) : tableau compact avec % de masse, en-tête étiquette (date, masse, n° fiche). C'est le plus utile pour l'examen.
- **Moderne** : une colonne, typographie serif.
- **Magazine** : photo pleine page (maintenant possible grâce aux photos).

### 💾 Export / import JSON complet
Sauvegarde téléchargeable de toutes les données (recettes, dossiers, cahiers, listes), avec restauration. Options : bouton manuel dans Paramètres, et/ou envoi automatique vers un NAS ou S3 (cron).

### 📸 Photos
Ajouter / changer la photo depuis le formulaire de recette (aujourd'hui seulement via l'import Recipe Keeper), et une miniature sur les cartes de la liste.

### 💰 Coût de revient
Prix au kilo dans la base d'ingrédients, puis coût total et par portion sur la fiche et dans le PDF.

### 🛒 Liste de courses
Groupement par rayon (frais, sec, fruits…) en réutilisant les catégories d'ingrédients (base / fruit / préparation) ; pluriel automatique (« 9 pièces »).

### 🔢 Sommaire PDF exact
Le sommaire suppose 1 page par recette. Option : 2ᵉ passe qui lit le vrai nombre de pages pour numéroter juste.

### 📱 PWA (application installable)
Installation sur iPad / téléphone et consultation hors-ligne des recettes en cuisine.

---

## 3. ⚠️ Problèmes connus restants

- **Sommaire PDF** : si une recette déborde sur 2 pages, les numéros suivants sont décalés.
- **3 templates PDF sur 4** ne sont pas stylés (rendu « classique »).
- **Variantes de recette** : table présente en base mais fonctionnalité jamais développée.
- **Logo personnel sur les cahiers** : option visible mais non branchée.
- **Format des étapes** : les anciennes recettes sont en HTML (ancien éditeur), les nouvelles en texte (1 étape par ligne). Les deux s'affichent correctement ; ouvrir puis enregistrer une ancienne recette la convertit en texte (le gras est perdu).

---

## 4. ✅ Fonctionnalités

### 🍰 Recettes
- Création / édition / suppression / duplication, suppression en lot (sélection multiple).
- Ingrédients : saisie **liste** (autocomplétion depuis la base, 200 ms) ou **texte libre** (`200g farine`, `Farine\n- 200g`, `1kg sucre`, `2 cc vanille`, `3 oeufs`, `100-150g sucre`).
- Unités : `g`, `L`, `cc` (≈ 5 g), `cs` (≈ 15 g), `pièce`, `QS`, et **fourchettes** min/max.
- Étapes : zone de texte, 1 étape par ligne (numérotée automatiquement dans les PDF).
- Tags libres, catégories colorées, note 1–5 étoiles, favori, source, notes & astuces, commentaires datés, photo (via import).
- Rangement dans **un dossier** (0 ou 1).

### 🗂️ Organisation
- Accueil en **vue explorateur** : cartes de dossiers, section « Sans dossier », « Tout afficher », fil d'Ariane.
- Recherche globale sans accents + filtres tag / catégorie, page Favoris.

### 🧮 Multiplication et sous-recettes
- 3 modes : **coefficient**, **masse totale cible**, **ingrédient pivot**.
- Affichage en décimales ou en entiers (arrondi au supérieur) ; en masse cible, ajustement ±1 g pour tomber pile sur la masse demandée.
- « Mettre à jour la recette » : enregistre les quantités affichées comme nouvelle base.
- **Sous-recettes** (accordéon) : chacune a son mode / sa valeur, suit le coefficient global, ou reste fixe si **verrouillée 🔒**. Détection des boucles (A dans B dans A).

### 📖 Cahiers PDF
- Recettes **liées 🔗** (toujours à jour) ou **figées 📌** (copie à une date, avec masse modifiable en 3 modes).
- Glisser-déposer, chapitres, titres de section, filtre des recettes déjà présentes.
- Couverture personnalisable (layouts, couleurs, image), sommaire avec sous-recettes `↳`, 1 page par recette et par sous-recette, numérotation à partir de la 1ʳᵉ recette, pied de page 3 zones, A4 / A5, aperçu sans enregistrer.
- Bouton « Liste de courses » : ajoute toutes les recettes du cahier à une liste.

### 📄 PDF d'une recette
Téléchargement depuis la fiche ; style réglable dans **Paramètres → PDF d'une recette**.

### 🛒 Listes de courses
- Plusieurs listes, recettes avec coefficient, articles libres.
- Fusion des ingrédients identiques **de même unité**, sous-recettes incluses, max des fourchettes.
- Cases à cocher (conservées quand la liste est recalculée), « décocher tout », « supprimer les cochés », export PDF.

### ⚙️ Paramètres
- Dossiers, catégories (CRUD + couleur), rangement en masse.
- **Base d'ingrédients** : classement (base / fruit / préparation / à classer), renommer (en cascade dans les recettes), fusionner, supprimer, sélection multiple, nettoyage des inutilisés, synchronisation.
- Lien du logo, réglages PDF.
- Import **Recipe Keeper** (ZIP/HTML avec photos, ou CSV) et **import JSON** (avec le prompt de conversion intégré pour une IA).
- **🚀 Mettre à jour le site** : lance `deploy.sh` avec un écran de maintenance.

### 🔗 Partage public
**Désactivé en V1.7** (voir [Mises à jour proposées](#2--mises-à-jour-proposées)). Interrupteur : `SHARE_ENABLED` dans `src/lib/features.ts`.

---

## 5. 📐 Règles de calcul

Toute la logique pure est dans **`src/lib/massAdjust.ts`**, importable côté client ET serveur : **ne jamais y importer Prisma**.

| Règle | Détail |
|---|---|
| Masse d'un ingrédient (`ingMass`) | g = valeur · cc × 5 · cs × 15 · L × 1000 · pièce / QS = 0 |
| Masse totale (`recipeMass`) | Somme des masses. Fourchette : `min` = bas, `max` = haut, **masse affichée = moyenne**. Seule fonction autorisée pour ce calcul. |
| Mise à l'échelle (`scaleQty`) | `qty × coef`, arrondi **au supérieur** ; les L deviennent des g entiers. |
| Masse cible exacte (`adjustToTarget`) | Après arrondi, retire/ajoute 1 g sur les plus gros ingrédients en grammes jusqu'à la cible exacte. |
| Sous-recette (`computeLocalCoef`) | coefficient = valeur · masse cible = cible ÷ masse de base de l'enfant · pivot = cible ÷ quantité du pivot. |
| Propagation | Non verrouillée : `coef_local × coef_global`. Verrouillée 🔒 : `coef_local` seul. |
| Snapshot figé (`buildRecipeSnapshot`) | Copie complète (ingrédients + sous-recettes calculées) avec son `multiplier`. |

Saisie / import : `mL → g ×1`, `cl → g ×10`, `dl → g ×100`, `kg → g ×1000` (import JSON) ; le texte libre convertit ml/cl en L. Les cuillères gardent leur **nombre**.

---

## 6. 🏗️ Architecture technique

| Couche | Choix |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions), mode `standalone` |
| Langage | TypeScript strict |
| BDD | PostgreSQL 16 + extensions `pg_trgm`, `unaccent` · ORM Prisma 6 |
| Style | Tailwind CSS v4 + design system FuelLog |
| Validation | Zod |
| PDF | Puppeteer 24 (Chromium système) + pdf-lib (fusion des passes) |
| Tests | Vitest 4 (61 tests) |
| Hébergement | LXC Debian 12 (Proxmox) · nginx · Cloudflare Tunnel + Zero Trust |

**Monolithe Next.js** : pas de séparation front/back ; les « API » sont des Server Actions (`src/app/actions/`) et des Route Handlers (`src/app/**/route.ts`).

```
src/
├── app/
│   ├── actions/        # Server Actions : recipes, subRecipes, cookbooks, shopping, settings, import, share, admin
│   ├── recipes/        # fiche, édition, création, PDF
│   ├── cookbooks/      # cahiers + PDF
│   ├── shopping/       # listes de courses + PDF
│   ├── settings/       # paramètres (dossiers, catégories, ingrédients, import JSON)
│   ├── share/[token]/  # page publique (désactivée)
│   ├── uploads/        # sert les photos depuis UPLOAD_DIR
│   └── api/            # recettes (autocomplétion), ingrédients, aperçu PDF, snapshot, health, deploy/log
├── components/         # composants React
├── middleware.ts       # protection de /share
└── lib/
    ├── massAdjust.ts       # calculs purs (voir §5)
    ├── recipes.ts / cookbooks.ts / shopping.ts / subRecipes.ts / share.ts
    ├── ingredientBases.ts  # ajout dédoublonné à la base d'ingrédients
    ├── parseIngredientsText.ts, importRecipeKeeper*.ts
    ├── uploads.ts          # dossier des photos
    ├── features.ts         # interrupteurs (SHARE_ENABLED)
    └── pdf/                # template.ts (HTML), theme.ts, renderer.ts (Puppeteer + file d'attente), cookbookPdf.ts
```

### Règles à respecter (pièges connus)
1. **Pas d'auth dans l'appli** : la sécurité est assurée par Cloudflare Zero Trust. Toute page « publique » doit passer par `middleware.ts`.
2. **`toggleSubRecipeLock` n'appelle pas `revalidatePath`** : sinon le panneau multiplicateur est réinitialisé. Le cadenas utilise un état optimiste.
3. **`output: "standalone"` inconditionnel** dans `next.config.ts`. Le build ignore le typecheck (LXC trop lent) : **lancer `pnpm typecheck` avant chaque push**.
4. **Le serveur standalone tourne dans `.next/standalone/`, effacé à chaque déploiement** : ne jamais y écrire de fichiers ; utiliser `UPLOAD_DIR`.
5. **`updateRecipe` recrée les ingrédients** (nouveaux id) puis re-pointe les pivots (`remapPivotIngredients`). Toute nouvelle référence à un id d'ingrédient doit faire de même.
6. Recettes et chapitres d'un cahier **partagent la même `position`** : utiliser `nextCookbookPosition`.
7. `layout.tsx` est `async` (lit `siteUrl`) ; `AppNav` affiche `CHANGELOG[0].version` (`src/lib/changelog.ts`) : ajouter une entrée à chaque version.
8. Le champ `cookbooks_recipes.subrecipe_mode` est ignoré (toujours « séparées »).

---

## 7. 🗃️ Modèle de données

Source de vérité : `prisma/schema.prisma`. Migrations versionnées dans `prisma/migrations/`.

| Table | Rôle |
|---|---|
| `recipes` | Recette : nom, `name_normalized` (recherche sans accents), photo, source, notes, favori, note, `folder_id` |
| `folders` | Dossier (nom unique, couleur) ; suppression = recettes « Sans dossier » |
| `ingredients` | Ingrédient d'une recette : nom, `quantity_g` (min), `quantity_g_max` (fourchette), `unit`, position, lien optionnel vers la base |
| `ingredients_base` | Base d'ingrédients (nom unique, catégorie base/fruit/préparation) |
| `steps_block` | Étapes (texte, ou HTML pour les anciennes recettes) |
| `sub_recipes` | Lien parent → enfant : label, `calc_mode`, `calc_value`, `pivot_ingredient_id`, `is_locked`, `is_exact` |
| `categories` / `recipes_categories` / `tags` / `comments` | Classement et journal des essais |
| `cookbooks` | Cahier : format, couverture/sommaire, thème JSON (`cover_config`), pied de page |
| `cookbooks_recipes` | Entrée de cahier : `link_mode` (linked/snapshot), `snapshot_data`, titre de section |
| `cookbooks_chapters` | Pages chapitre (même ordre que les recettes) |
| `shopping_lists` / `shopping_list_items` / `shopping_list_recipes` | Listes, articles (`unit` : NULL = g), recettes + coefficient |
| `share_tokens` | Liens publics (inutilisés tant que le partage est désactivé) |
| `settings` | Clé/valeur JSON : `recipePdfSettings`, `siteUrl` |
| `pdf_templates` / `variants` | Prévu, peu ou pas utilisé |

---

## 8. 🎨 Design system

RecipeLog reprend le design system **FuelLog** de l'écosystème super-nono.cc :
- **Sombre uniquement** : fond `#0e0f11`, surfaces `#16181c`, cartes `#1c1f25`, bordures `#2a2d35`.
- Couleurs = sens : jaune `#e8c547` action · vert `#4fc3a1` succès · orange `#e87c47` attention · violet `#a78bfa` en attente / verrou · rouge `#e85c47` danger.
- Typo : **DM Mono** partout, **DM Serif Display** pour titres et valeurs ; labels et navigation en MAJUSCULES espacées.
- Arrondis 8 / 12 / 20 px, pas de dégradé, modals « iOS sheet » (depuis le bas sur mobile).
- Classes utilitaires dans `src/app/globals.css` (`fl-card`, `fl-btn-*`, `fl-input`, `fl-label`, `fl-tag`…).

---

## 9. 💻 Installation (développement)

Prérequis : Node.js ≥ 20, pnpm ≥ 10, PostgreSQL ≥ 15 (ou Docker).

```bash
git clone https://github.com/SuperNon0/recipelogs
cd recipelogs
pnpm install
cp .env.example .env          # adapter DATABASE_URL
docker compose up -d          # PostgreSQL local (optionnel)
pnpm db:migrate               # applique les migrations
pnpm db:seed                  # catégories, dossiers, templates PDF
pnpm dev                      # http://localhost:3000
```

| Commande | Effet |
|---|---|
| `pnpm typecheck` | Vérifie les types (**obligatoire avant un push**) |
| `pnpm test` | Lance les tests Vitest |
| `pnpm build` / `pnpm start` | Build et lancement production |
| `pnpm exec prisma migrate dev --name <nom>` | Nouvelle migration |
| `pnpm db:studio` | Interface graphique de la base |
| `pnpm tsx scripts/seed-test-recipe.ts` | Recette de démo |

---

## 10. 🚀 Production (Proxmox LXC)

### Installation initiale
1. **Créer le container** sur l'hôte Proxmox :
   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/debian.sh)"
   ```
   Debian 12, unprivileged, **2 CPU, 2 Go RAM, 20 Go disque**.
2. **Activer Nesting** (obligatoire pour Chromium) : Options → Features → Nesting, ou `pct set <VMID> --features nesting=1 && pct reboot <VMID>`.
3. **Installer l'appli** dans le container (`pct enter <VMID>`) :
   ```bash
   apt-get install -y curl git && \
   curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/main/deploy/proxmox/setup.sh | bash
   ```
   `setup.sh` installe Node 22, pnpm, PostgreSQL, Chromium, nginx, clone dans `/opt/recipelog`, crée la base, le `.env`, le dossier photos `/var/lib/recipelog/uploads`, build, puis installe le service systemd `recipelog`, nginx, UFW et la règle sudoers du bouton de mise à jour.

### Cloudflare Zero Trust
- **Tunnel** (`cloudflared service install <TOKEN>` dans le container) → hostname `recipe.super-nono.cc` → `HTTP localhost:80`.
- **Access** : application self-hosted sur le domaine, politique email + OTP.
- `NEXTAUTH_URL` dans `/opt/recipelog/.env` doit correspondre au domaine.

### Mise à jour
Bouton **Paramètres → 🚀 Mettre à jour le site**, ou :
```bash
bash /opt/recipelog/deploy/proxmox/deploy.sh
```
Enchaîne : dossier photos → `git pull` → `pnpm install` → `prisma migrate deploy` → `prisma generate` → `pnpm build` → copie `static/` et `public/` dans `.next/standalone/` → `systemctl restart recipelog`.

### Sauvegardes
```bash
crontab -e
0 3 * * * /opt/recipelog/deploy/proxmox/backup.sh >> /var/log/recipelog-backup.log 2>&1
```
Base (`pg_dump`) + photos dans `/var/backups/recipelog/`, rétention 30 jours.

### Fichiers et ports
| Élément | Emplacement |
|---|---|
| Application | `/opt/recipelog` (service `recipelog`, port 3000 local) |
| Configuration | `/opt/recipelog/.env` (`DATABASE_URL`, `UPLOAD_DIR`, `PUPPETEER_EXECUTABLE_PATH`…) |
| Photos | `/var/lib/recipelog/uploads` |
| nginx | port 80 → 3000 |
| Logs de mise à jour | `/tmp/recipelog-deploy.log` |

### Logs et dépannage
| Besoin | Commande |
|---|---|
| Statut / logs | `systemctl status recipelog` · `journalctl -u recipelog -f` |
| nginx | `tail -f /var/log/nginx/error.log` · `nginx -t` |
| Test direct | `curl -I http://localhost:3000` (Next) · `curl -I http://localhost` (nginx) |
| Pack de logs | `bash /opt/recipelog/deploy/proxmox/collect-logs.sh` → `/tmp/recipelog-logs-*.tar.gz` |
| Mise à jour bloquée | bouton « débloquer » dans Paramètres, ou `rm /tmp/recipelog-deploy.lock` |
| PDF en erreur | `which chromium` et `grep PUPPETEER /opt/recipelog/.env` ; vérifier Nesting |
| Retour arrière | `cd /opt/recipelog && git checkout <commit> && pnpm install --frozen-lockfile && pnpm build && systemctl restart recipelog` |

**Pièges déjà rencontrés** (tous corrigés dans les scripts) : clone bloqué par le dossier home de l'utilisateur, client Prisma non généré (pnpm 10), mode standalone non activé, CSS en 404 (`static/` à copier) ou 403 (droits nginx), photos effacées au déploiement.

---

## 11. 📜 Historique des versions

| Version | Contenu principal |
|---|---|
| **V1.7** | Corrections et fiabilisation (voir §1), partage désactivé, photos persistantes. |
| **V1.6** | Affichage décimales / entiers, masse cible exacte à l'écran, navigation en pilules, refonte de la page ingrédients, suppression de la page « Nouveautés ». Puis : classement rapide et sélection multiple des ingrédients, sélection multiple des recettes, liste de courses depuis un cahier, PDF de liste de courses, éditeur d'étapes en texte simple. |
| **V1.5** | Masse exacte (`adjustToTarget`, `is_exact`), filtre des recettes déjà dans un cahier, cadenas optimiste, index de recherche. |
| **V1.4** | Quantités en fourchette, page détail ingrédient (renommage en cascade, fusion), synchronisation de la base, import JSON (normalisation des unités). |
| **V1.3** | Correctif de la recherche dans les dossiers, sous-pages Paramètres, autocomplétion des ingrédients, lien du logo, unités (g, L, cc, cs, pièce, QS). |
| **V1.2** | Dossiers et vue explorateur, combobox catégories, réglages PDF d'une recette, « Mettre à jour la recette », masse modifiable des recettes figées, PDF 1 page par recette avec numérotation logique, import Recipe Keeper ZIP/HTML, bouton « Mettre à jour le site ». |
| **V1.1** | Livraison initiale : recettes, multiplication 3 modes, sous-recettes, cahiers PDF, listes de courses, partage, scripts Proxmox. |

---

## 12. Conventions

- Tout en **français** (interface, code commenté, commits).
- Préfixes de commit : `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Travail sur une branche, puis **Pull Request vers `main`** ; `main` = ce qui part en production.
- Avant chaque push : `pnpm typecheck && pnpm test`.
- À chaque version : ajouter une entrée dans `src/lib/changelog.ts` et dans les sections 1 et 11 de ce fichier.

---

*Projet personnel. Tous droits réservés.*

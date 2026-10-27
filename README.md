# RecipeLog

> **Recettes de pâtisserie professionnelle : application web auto-hébergée**

Outil conçu pour le travail d'un pâtissier pro (et quelques recettes perso). Il comble les manques de Recipe Keeper : précision au gramme, multiplicateur (coefficient, masse, pivot, pièces, moule), sous-recettes à tous les niveaux, fiches de production, allergènes, coût de revient, cahiers PDF et accès par Claude (MCP).

**Version actuelle : V2.5** (le numéro complet, par ex. V2.5.106, est affiché dans le menu et dans Réglages → Version et nouveautés) · Production : [`recipe.super-nono.cc`](https://recipe.super-nono.cc) (Proxmox LXC + Cloudflare Zero Trust)

> Ce fichier est **la documentation du projet**. Le journal des nouveautés affiché dans l'appli est `src/lib/changelog.ts` (règles dans `CLAUDE.md`). Les idées mises de côté pour plus tard sont dans [`docs/futures-mises-a-jour.md`](docs/futures-mises-a-jour.md).

Choix de fond : pas de planning ni de calendrier, pas de photos, aucun service payant (API), une appli sobre avec peu de boutons visibles.

---

## Sommaire

1. [Dernières mises à jour](#1-dernières-mises-à-jour)
2. [Futures mises à jour](#2-futures-mises-à-jour)
3. [Problèmes connus restants](#3-problèmes-connus-restants)
4. [Fonctionnalités](#4-fonctionnalités)
5. [Règles de calcul](#5-règles-de-calcul)
6. [Accès Claude (MCP)](#6-accès-claude-mcp)
7. [Architecture technique](#7-architecture-technique)
8. [Modèle de données](#8-modèle-de-données)
9. [Design system](#9-design-system)
10. [Installation (développement)](#10-installation-développement)
11. [Production (Proxmox LXC)](#11-production-proxmox-lxc)
12. [Historique des versions](#12-historique-des-versions)
13. [Conventions](#13-conventions)

---

## 1. Dernières mises à jour

Le détail complet de chaque version est dans l'appli (Réglages → Version et nouveautés), avec la liste des dernières PR fusionnées.

### V2.5 (27 octobre 2026) : moules, variantes, production et mode labo

**Moules**
- Le multiplicateur a un mode **« Moule »** : de « cercle Ø18 » vers « cercle Ø24 », d'un cadre 40×60 vers des cercles, ou vers **plusieurs moules** (« 3 × Ø16 »). Calcul par la surface, ou par le **volume** si les deux hauteurs sont données.
- Le **moule d'origine** se note dans « Modifier » (formes cercle, carré, cadre, dimensions courantes proposées, ou « Autre dimension »). Il s'affiche sous « Base (×1) » et l'appli dit combien de moules la recette remplit à ×1.

**Variantes (essais d'une recette)**
- Menu **⋯** d'une recette → **Variantes** → « Nouvelle variante » : copie complète de la recette (sous-recettes, étapes, réglages) rangée sous la **version principale**, avec un nom d'essai (« moins sucré », « chocolat 64 % »).
- Menu ⋯ → Variantes → **« Voir les variantes »** (ou le badge « 2 variantes » sous le titre) : la liste des essais ; ouvrir, **comparer**, renommer, **en faire la version principale** (l'ancienne devient l'essai « ancienne version ») ou **détacher**.
- « Relier une recette existante » : range comme variante un essai fait avant dans une recette séparée.
- **Comparer** : tableau côte à côte (écart en g et en %, ajouté / retiré), étapes modifiées en couleur, bouton « Inverser ».
- Les variantes sont **masquées** de la liste des recettes et des compteurs de dossiers (lien « N variantes rangées sous leur recette » pour les afficher) ; la recherche les trouve toujours.

**Colonne %**
- Chaque ingrédient et chaque sous-recette affiche sa **part de la masse totale**, maintenant aussi sur téléphone. Les ingrédients d'une sous-recette dépliée affichent leur part **dans cette sous-recette**.

**Fiche de production**
- Menu ⋯ → **Fiche de production** : « 60 éclairs » (ou ×2 sans rendement) donne **toutes les pesées à l'échelle**, sous-recettes comprises, **une préparation par encadré dans l'ordre de fabrication** (sous-recettes d'abord), étapes en option, **PDF à imprimer** pour le labo.
- Page **Production** (menu de gauche, ou recherche) : plusieurs recettes en même temps, quantités modifiables sur place ; une préparation commune (la même pâte à choux pour éclairs et religieuses) n'a **qu'un encadré, aux quantités additionnées** ; **total à sortir** par ingrédient.

**Mode labo**
- Bouton **toque** sur la fiche : la recette **en grand** au multiplicateur choisi, **écran toujours allumé**, pesées à cocher (sous-recettes d'abord), étape en cours mise en avant, **minuteurs** créés depuis les durées des étapes (« cuire 18 min », « 1 h 30 », « 45 s ») avec sonnerie et vibration. Tout reste coché si on quitte et revient. Onglets sur téléphone, deux colonnes sur grand écran.

**Recherche complète** (Ctrl K ou loupe)
- Trouve aussi les recettes par **ce qui est écrit dans les étapes, les notes et les essais** (avec l'extrait), et **par ingrédient, sous-recettes comprises** ; « jaunes + crème » donne les recettes qui ont **les deux**. Sans accents ni majuscules.
- Fiche d'un ingrédient : la **quantité** utilisée par chaque recette et les recettes qui l'utilisent **à travers une sous-recette**.

**Claude (MCP)** : 10 nouveaux outils (variantes, comparaison, moule, production, recherche complète), `lire_recette` donne le moule, les variantes et le % de chaque ingrédient (voir §6).

### V2.4 (27 octobre 2026) : rendement, allergènes et coût de revient

- **Poids par pièce** sur la fiche de l'ingrédient (œuf 50 g, jaune 20 g…) : les pièces comptent dans la masse totale. **Rendement** d'une recette (« 40 financiers ») et mode **« Pièces »** du multiplicateur. Pièces arrondies **à la plus proche** quand on multiplie.
- **Allergènes** : les 14 allergènes à déclarer se cochent une fois par ingrédient ; chaque recette les **cumule, sous-recettes comprises**, avec l'ingrédient qui les apporte. Imprimés sur les PDF et dans les cahiers.
- **Coût de revient** : prix d'achat (€ le kg, le litre ou la pièce, avec **historique**), coût matière, coût par pièce et **prix de vente conseillé** (coefficient ×4 par défaut, réglable par recette). Page **Réglages → Prix des ingrédients** pour tout saisir d'un coup.
- **Intertitres** (« Pâte », « Crème », « Montage ») dans les ingrédients et dans les étapes (ligne qui commence par `#`).
- **Quantités liées dans les étapes** : « verser {167 g} de lait » suit le multiplicateur (×2 → 334 g), PDF compris.
- Le multiplicateur reste réglé entre les onglets Recette et Préparation.
- Corrections : masse cible et « Enregistrer comme base » avec des pièces, rendement et étapes mis à l'échelle à l'enregistrement, recettes figées dans un cahier, fusion d'ingrédients qui garde allergènes et prix, import JSON (intertitres, fourchettes, rendement), doublons dans l'historique des prix.

### V2.3 → V2.1 (22 au 24 octobre 2026)

- **V2.3** : recettes depuis **TikTok, Instagram, YouTube ou un lien** (Claude lit la vidéo et crée la recette, dossier dédié et étiquette « à vérifier », Raccourci iPhone) ; numéro de version complet. Corrections : **sous-recettes imbriquées** prises en compte partout (moteur `recipeTree.ts`), pivot en L / cc / cs, masse cible sur fourchettes, plus d'arrondi au gramme supérieur à ×1.
- **V2.2** : **mise à jour du site en une minute** (site construit par GitHub Actions et téléchargé par le serveur), écran de mise à jour qui suit les étapes.
- **V2.1** : **photos retirées** du site, éditeur de thème PDF enrichi (schémas, options masquées selon le modèle, marges, en-tête, pied de page…), **accès MCP** pour Claude (clé dans l'adresse ou en en-tête).

---

## 2. Futures mises à jour

Les idées étudiées mais **mises de côté** (avec ce qu'elles apportent, comment elles s'afficheraient et comment elles seraient faites) sont dans [`docs/futures-mises-a-jour.md`](docs/futures-mises-a-jour.md) :
- **% boulanger et hydratation** (viennoiserie, pain, levain) ;
- **Remplacer un ingrédient** dans une recette (avec correction des quantités) ;
- **Équilibrage** des ganaches et des glaces (sucres, matières grasses, extrait sec) ;
- petits plus (coût dans les PDF, etc.).

Pour en ajouter une : demander « ajoute le n° 10 » (ou le nom de l'idée) dans une nouvelle discussion.

Toujours en attente côté infrastructure : **partage public** (bloqué par Cloudflare ; une règle « Bypass » sur `/share/*` puis `SHARE_ENABLED = true` dans `src/lib/features.ts` suffirait) et **logo personnel des cahiers** (prévu en base, sans interface).

---

## 3. Problèmes connus restants

- **Arrondis à ×1,5 avec décimales** : les quantités liées des étapes et celles des ingrédients peuvent différer d'un gramme.
- **Anciennes étapes en HTML** (ancien éditeur) : affichées correctement, mais sans quantités liées ; ouvrir puis enregistrer la recette la convertit en texte (le gras est perdu).
- **Fiches d'ingrédients à compléter** : quelques allergènes à vérifier (chocolats et couvertures : soja ? pâte à glacer, croustillants, pâte sucrée : amande ?) ; aucun prix fournisseur saisi pour l'instant.
- **Base d'ingrédients importée** : quelques noms contiennent encore une quantité (« 1/4 pincée fleur de sel ») ; à renommer ou fusionner depuis Réglages → Ingrédients.
- **Gros composants** (`RecipeBody`, `IngredientBaseManager`, `CookbookConfigForm`, `RecipeForm` : 700 à 1 200 lignes) : fonctionnels, à découper si on les fait évoluer.

---

## 4. Fonctionnalités

### Interface
- Thème sombre « Encre et ambre », icônes (aucun emoji), polices Geist / Fraunces.
- **Ordinateur** : menu latéral (recettes, favoris, cahiers, courses, **production**, ingrédients, dossiers avec compteurs, thèmes PDF, réglages). **Téléphone** : barre d'onglets, bouton « + », feuilles d'actions.
- **Menus d'actions** partout : clic droit, bouton ⋯ ou appui long ; sous-menus (Déplacer vers, Variantes).
- **Bulles d'aide « ? »** : explication, calcul avec les vrais chiffres, exemple.
- **Recherche Ctrl K** : noms (recettes, dossiers, ingrédients, cahiers, listes), recettes par ingrédient (sous-recettes comprises, « a + b »), texte des étapes / notes / essais, actions rapides.
- **PWA** : installable comme une application.

### Recettes
- Création, édition, suppression, duplication (sous-recettes comprises), suppression en lot.
- Ingrédients : saisie **liste** (autocomplétion, menu par ligne : fourchette, monter, descendre, supprimer), **intertitres**, ou **saisie en lot** (`200g farine`, `1kg sucre`, `2 cc vanille`, `3 oeufs`, `100-150g sucre`).
- Unités : `g`, `L`, `cc` (≈ 5 g), `cs` (≈ 15 g), `pièce` (poids réglé sur la fiche de l'ingrédient), `QS`, et **fourchettes** min/max.
- Étapes : une étape par ligne, intertitres `# Titre`, **quantités liées** `{167 g}`.
- **Rendement** (nombre + libellé), **moule d'origine**, coefficient de vente.
- Tags, catégories colorées, note 1–5, favori, source, notes et astuces, journal d'essais daté.
- Un dossier par recette (« Déplacer vers » dans le menu).
- **Variantes** : essais rangés sous la version principale, comparaison, promotion, détachement (menu ⋯ → Variantes).
- **Mode labo** : affichage cuisine plein écran, pesées à cocher, minuteurs.

### Fiche recette
- Onglets **Recette / Préparation / Notes et essais**.
- Cartes **Masse totale** (sous-recettes comprises, rendement), **Multiplicateur**, **Base ×1** (et moule).
- Tableau des ingrédients avec **quantité** et **% de la masse** (téléphone compris), sous-recettes dépliables avec leur menu (ouvrir, suivre le multiplicateur ou **garder sa quantité**, régler, monter / descendre, retirer).
- **Allergènes** (avec l'ingrédient qui les apporte) et **coût de revient** / prix conseillé.
- « Utilisée comme sous-recette dans… ».

### Multiplicateur
- 5 modes : **coefficient** (+ / −), **masse cible**, **ingrédient pivot**, **pièces** (si rendement), **moule** ; affichage décimales ou entiers.
- « Enregistrer comme base » : écrit les quantités affichées (rendement et quantités liées des étapes suivent).

### Production
- Fiche pour une recette (menu ⋯) ou page **Production** pour plusieurs recettes : pesées par préparation dans l'ordre de fabrication, préparations communes additionnées, total à sortir, étapes en option, **PDF**.

### Ingrédients
- Base d'ingrédients : catégorie (base / arôme / préparation), **poids par pièce**, **allergènes**, **prix d'achat** avec historique, renommage en cascade, fusion, nettoyage.
- Fiche d'un ingrédient : recettes qui l'utilisent avec la quantité, et celles qui l'utilisent via une sous-recette.
- **Prix des ingrédients** (Réglages) : tous les prix sur une page.

### Thèmes PDF, PDF d'une recette, cahiers
- 7 thèmes fournis (modifiables) + thèmes personnels ; éditeur avec **aperçu PDF en direct** et schémas pour chaque choix.
- PDF d'une recette : choix du thème avec aperçu ; sous-recettes sur des pages séparées ; rendement et allergènes imprimés.
- **Cahiers** : recettes **liées** (toujours à jour) ou **figées** (copie datée, masse modifiable), chapitres, couverture, sommaire aux numéros de page exacts, A4 / A5.

### Listes de courses
- Plusieurs listes, recettes avec coefficient, articles libres ; fusion des ingrédients identiques de même unité, sous-recettes comprises ; cases à cocher, export PDF.

### Réglages
- Dossiers, catégories, ingrédients, prix, thèmes PDF, **Accès MCP** (Claude), **Recettes depuis TikTok**, import Recipe Keeper et JSON, **Version et nouveautés**, **Mettre à jour le site**.

---

## 5. Règles de calcul

La logique pure est dans `src/lib/` (**ne jamais y importer Prisma**, sauf les fichiers `*Data.ts`, `recipes.ts`, `cookbooks.ts`…) : `massAdjust.ts`, `recipeTree.ts`, `subRecipeCalc.ts`, `mold.ts`, `production.ts`, `compare.ts`, `cost.ts`, `allergens.ts`, `stepQty.ts`, `durations.ts`, `textSearch.ts`.

| Règle | Détail |
|---|---|
| Masse d'un ingrédient (`ingMass`) | g = valeur · cc × 5 · cs × 15 · L × 1000 · pièce × poids par pièce (0 si non réglé) · QS = 0 |
| Masse totale (`recipeMass`, `treeBaseMass`) | Somme des masses, sous-recettes comprises. Fourchette : bas / haut, **affichée = moyenne**. |
| Mise à l'échelle (`scaleQty`, `roundScaled`) | À ×1 : valeur exacte. Sinon gramme **supérieur**, pièce **la plus proche** ; les L deviennent des g. |
| Masse cible exacte (`adjustToTarget`) | Vise la moyenne (min+max)/2 ; ne bouge que les ingrédients ≥ 20 g. |
| Sous-recettes (`resolveLink` dans `recipeTree.ts`) | Arbre récursif à tous les niveaux, anti-boucle. coefficient = valeur · masse cible = cible ÷ masse de base de l'enfant · pivot = cible (en g via `ingMass`) ÷ quantité du pivot. Non verrouillée : × multiplicateur du parent ; verrouillée : seule. |
| Moule (`moldCoef`) | surface cible ÷ surface d'origine (× rapport des hauteurs si les deux sont connues) × nombre de moules. |
| % de la masse | masse de la ligne ÷ masse totale (sous-recettes comprises) ; ingrédient d'une sous-recette dépliée : ÷ masse de la sous-recette. |
| Production (`buildProduction`) | Parcours en profondeur (sous-recettes d'abord) ; même sous-recette = un bloc, quantités additionnées ; pièces = quantité ÷ rendement, sinon multiplicateur ; fourchettes pesées au haut. |
| Coût (`costOf`) | Σ masse × prix ramené au gramme (ou à la pièce) ; prix conseillé = coût × coefficient de vente. |
| Allergènes (`collectAllergens`) | Union des allergènes des fiches ingrédients, sous-recettes comprises. |
| Quantités liées (`rescaleStepText`) | `{167 g}` × coefficient (celui de la sous-recette pour ses étapes). |
| Minuteurs (`findDurations`) | « 18 min », « 1 h 30 », « 45 s » ; fourchette « 15 à 20 min » → la plus longue. |
| Recherche (`textSearch.ts`) | Sans accents ni casse ; « a + b » = toutes les recettes qui contiennent a ET b, directement ou dans une sous-recette. |

Saisie / import : `mL → g ×1`, `cl → g ×10`, `dl → g ×100`, `kg → g ×1000` ; les cuillères gardent leur **nombre**.

---

## 6. Accès Claude (MCP)

Serveur MCP intégré à l'appli : `POST /api/mcp` (JSON-RPC sans état, écrit à la main). Clé dans **Réglages → Accès MCP**, envoyée en en-tête `Authorization: Bearer <clé>` ou `X-API-Key`, ou dans l'adresse `/api/mcp/<clé>`. Cloudflare Access doit avoir une règle **Bypass** sur `/api/mcp` et `/api/mcp/*`. Les outils sont dans `src/lib/mcp/tools/` (un fichier par groupe, liste dans `index.ts`).

**Après une mise à jour qui ajoute des outils, reconnecter le connecteur « RecipeLog » dans Claude** pour qu'ils apparaissent.

| Groupe | Outils |
|---|---|
| Ingrédients | lister, classer, renommer, fusionner, supprimer les inutilisés, `regler_fiches_ingredients` (allergènes, poids pièce, prix en lot), recettes d'un ingrédient… |
| Recettes | `chercher_recettes`, `lire_recette` (rendement, moule, variantes, allergènes, coût, **% de chaque ingrédient**), créer, modifier, dupliquer, supprimer, ajuster les quantités, sous-recettes, commentaires, favoris, import / export JSON |
| Variantes, moules, production et recherche (V2.5) | `voir_variantes`, `creer_variante`, `relier_variante`, `gerer_variante` (renommer, principale, détacher), `comparer_recettes`, `adapter_au_moule`, `voir_fiche_production`, `ajouter_a_production`, `modifier_production`, `recherche_complete` |
| Vidéos et liens | `lire_video` (TikTok, Instagram, YouTube, page web ; yt-dlp + ffmpeg sur le serveur) |
| Dossiers et catégories, Listes de courses, Cahiers | création, rangement, couleurs, articles, recettes… |
| Site | `infos_recipelog`, `lancer_mise_a_jour`, `etat_du_site` |

---

## 7. Architecture technique

| Couche | Choix |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions), mode `standalone` |
| Langage | TypeScript strict |
| BDD | PostgreSQL 16 + `pg_trgm`, `unaccent` · ORM Prisma 6 |
| Style | Tailwind CSS v4 + design system « Encre et ambre » (§9), icônes lucide-react |
| Validation | Zod |
| PDF | Puppeteer 24 (Chromium système) + pdf-lib ; aperçus avec pdf.js |
| Tests | Vitest (27 fichiers, ~175 tests) |
| Build | GitHub Actions (`server-build.yml`) → release `server-builds`, téléchargée par le serveur |
| Hébergement | LXC Debian 13 (Proxmox) · nginx · Cloudflare Tunnel + Zero Trust |

**Monolithe Next.js** : les « API » sont des Server Actions (`src/app/actions/`) et des Route Handlers (`src/app/**/route.ts`).

```
src/
├── app/
│   ├── actions/        # Server Actions : recipes, subRecipes, variants, production, cookbooks, shopping, settings, pdfThemes, import, mcp, share, admin, modals
│   ├── recipes/[id]/   # fiche, edit, compare (variantes), pdf, production (PDF d'une recette)
│   ├── production/     # page Production + pdf
│   ├── cookbooks/  shopping/  favorites/  share/[token]/ (désactivé)
│   ├── settings/       # categories, folders, ingredients (+ prix), themes, mcp, import-video, import-json, import-recipekeeper
│   └── api/            # search (Ctrl K), mcp, recipes, ingredient-bases, pdf-preview, cookbooks, health, deploy
├── components/
│   ├── ui/             # Menu (clic droit, ⋯, appui long, sous-menus), Help (« ? »), CommandPalette (Ctrl K)
│   ├── recipe/         # RecipeView, RecipeMenu, RecipeTable, Variants, KitchenMode (mode labo), FolderTiles
│   ├── themes/  settings/
│   └── …               # RecipeBody (fiche : masses, multiplicateur, tableau, coût), RecipeForm, MoldPicker, Production, AppNav…
├── styles/             # CSS par zone, importés par globals.css
└── lib/
    ├── massAdjust.ts, recipeTree.ts, subRecipeCalc.ts     # calculs purs (§5)
    ├── mold.ts, production.ts, compare.ts, cost.ts, allergens.ts, stepQty.ts, durations.ts, textSearch.ts
    ├── recipes.ts (loadRecipeTree, listes), cookbooks.ts (snapshots), variants.ts, recipeCopy.ts, productionData.ts, fullSearch.ts
    ├── changelog.ts, version.ts, pr-log.ts                 # page « Version et nouveautés »
    ├── mcp/            # protocole, clé, outils (tools/*.ts)
    └── pdf/            # theme, template, recipePdf, cookbookPdf, productionPdf, renderer, fonts, decorate
```

### Règles à respecter (pièges connus)
1. **Pas d'auth dans l'appli** : la sécurité est assurée par Cloudflare Zero Trust. Toute page « publique » doit passer par `middleware.ts`.
2. **`toggleSubRecipeLock` n'appelle pas `revalidatePath`** : sinon le panneau multiplicateur est réinitialisé. Le cadenas utilise un état optimiste.
3. **`output: "standalone"` inconditionnel** dans `next.config.ts`. Le build ignore le typecheck (LXC trop lent) : **lancer `pnpm typecheck` avant chaque push**.
4. **Le serveur standalone tourne dans `.next/standalone/`, effacé à chaque déploiement** : ne jamais y écrire de fichiers ; utiliser `UPLOAD_DIR`.
5. **`updateRecipe` recrée les ingrédients** (nouveaux id) puis re-pointe les pivots (`remapPivotIngredients`). Toute nouvelle référence à un id d'ingrédient doit faire de même.
6. Recettes et chapitres d'un cahier **partagent la même `position`** : utiliser `nextCookbookPosition`.
7. `layout.tsx` est `async` et **dynamique** (lit `siteUrl` et les compteurs du menu) ; le menu affiche le numéro de version complet, ex. V2.3.88 (`src/lib/version.ts` : version en tête de `src/lib/changelog.ts` + numéro de la dernière PR fusionnée, lu dans git au build). Règles du journal : voir `CLAUDE.md`.
8. Le champ `cookbooks_recipes.subrecipe_mode` est ignoré (toujours « séparées »).
9. **Sommaire PDF** : les recettes sont rendues avant la couverture ; chaque page listée porte une ancre `toc-<n>` ciblée par un lien invisible, et `readAnchorPages` relit sa page réelle dans le PDF. Garder le même ordre dans `computeTocEntries` et `buildRecipesHtml` (les deux passent par `subSnapsOf`).
10. La mise en page (`recipeLayout`) est dans le thème : CSS dans `layoutCss()`, classes `layout-*`, `title-*`, `steps-*`, `ing-*` sur `<body>` (`bodyClass`). La table `pdf_templates` n'est plus utilisée pour le rendu.
11. **Papier et décor ne sont pas en CSS** : en impression, Chromium coupe fonds et éléments fixes aux marges. Ils sont dessinés dans le PDF par `decorate.ts` (papier sous le texte, décor par-dessus, dans les marges). Le `<body>` doit rester transparent.
12. **Rendu PDF** : un seul Chromium partagé (`getBrowser`), un rendu à la fois (`runExclusive`). Ne pas revenir à `waitUntil: "networkidle0"` (+500 ms par passe).
13. **Nouvelle option de thème** : l'ajouter avec une valeur par défaut dans `cookbookThemeSchema` (cahiers et thèmes existants gardent leur apparence), puis dans `ThemeEditor` et `CookbookConfigForm`. `recipePdfSettingsSchema` n'est plus qu'un ancien format, converti une fois en thème « Mon style ».
14. **Thèmes fournis** : créés une seule fois par clé (réglage `pdfThemesSeeded`) ; un thème fourni supprimé ne revient pas. Ajouter un style dans `THEME_PRESETS` le crée à la prochaine ouverture.
15. **Menus et bulles** (`components/ui`) : rendus dans un portail ; `STOP` arrête la propagation des clics à travers le portail (sinon un clic dans un menu ouvrirait la ligne). Ne pas placer un `MoreButton` dans un `<Link>`, et pas de `Help` dans un `<label>`.
16. **Styles** : tokens et composants communs dans `globals.css` ; styles propres à une zone dans `src/styles/<zone>.css`. Aucun emoji dans l'interface : icônes `lucide-react`.
17. **Arbre des recettes** : tout calcul qui traverse les sous-recettes passe par `loadRecipeTree` + `resolveLink` (`recipeTree.ts`), jamais par `computeSubRecipe` (gardé seulement pour l'ancien affichage et ses tests).
18. **Variantes masquées** : `listRecipes` cache les variantes sauf recherche, filtre ou `withVariants: true` (MCP) ; les compteurs de dossiers les excluent aussi. Une variante est une recette complète (table `variants` : version principale → variante + nom d'essai).
19. **Nouvelle fonction visible** = ligne dans `src/lib/changelog.ts` (règles dans `CLAUDE.md`) et, si utile, un outil MCP dans `src/lib/mcp/tools/`.


---

## 8. Modèle de données

Source de vérité : `prisma/schema.prisma`. Migrations versionnées dans `prisma/migrations/` (appliquées toutes seules à la mise à jour).

| Table | Rôle |
|---|---|
| `recipes` | Recette : nom, `name_normalized`, source, notes, favori, note, `folder_id`, `yield_count` / `yield_label` (rendement), `sale_coef`, `mold` (JSON : forme, a, b, h en cm) |
| `folders` | Dossier (nom unique, couleur) |
| `ingredients` | Ligne d'ingrédient : nom, `quantity_g` (min), `quantity_g_max`, `unit` (g, L, cc, cs, pièce, QS, **titre** = intertitre), position, lien vers la base |
| `ingredients_base` | Base d'ingrédients : nom unique, catégorie, `piece_g`, `allergens` (liste), prix d'achat |
| `ingredient_prices` | Historique des prix d'un ingrédient |
| `steps_block` | Étapes (texte, une par ligne ; HTML pour les anciennes recettes) |
| `sub_recipes` | Lien parent → enfant : label, `calc_mode`, `calc_value`, `pivot_ingredient_id`, `is_locked`, `is_exact` |
| `variants` | Version principale → variante, `note` = nom de l'essai |
| `production_items` | Fiche de production en cours : recette (unique), quantité, position |
| `categories` / `recipes_categories` / `tags` / `comments` | Classement et journal des essais |
| `cookbooks` / `cookbooks_recipes` / `cookbooks_chapters` | Cahiers, entrées liées ou figées (`snapshot_data`), chapitres |
| `shopping_lists` / `shopping_list_items` / `shopping_list_recipes` | Listes de courses |
| `pdf_themes` | Thèmes PDF enregistrés (`config` JSON, `is_default`, position) |
| `settings` | Clé/valeur JSON : `siteUrl`, `mcpToken`, `pdfThemesSeeded`… |
| `share_tokens` / `pdf_templates` | Partage (désactivé) / ancien format, inutilisés |

---

## 9. Design system

« Encre et ambre », **sombre uniquement**. Tokens dans `src/app/globals.css` (`:root`).
- **Couleurs** : fond `#0b0f17`, surface `#0f1520`, cartes `#141b28`, fenêtres `#182131`, bordures `#1e2737` / `#2b3549`, texte `#e7ebf3` / `#aab3c5` / `#6f7a90`.
- **Sens** : ambre `#f0a64a` action et sélection · vert `#4fc0ad` succès · violet `#8f9cf0` verrouillé / figé · rouge `#ef7d6b` danger.
- **Typo** : Geist (texte), Geist Mono (raccourcis, calculs), Fraunces (titres de page).
- **Icônes** : `lucide-react`, 14 à 20 px. **Aucun emoji.**
- **Mise en page** : menu latéral à partir de 900 px ; en dessous, barre du haut + barre d'onglets. Fenêtres centrées (≥ 700 px) ou feuilles du bas (téléphone).
- **Composants** : `fl-card`, `fl-btn` (+ `-primary`, `-secondary`, `-ghost`, `-danger`, `-edit`, `-icon`), `fl-input`, `fl-label`, `fl-tag`, `fl-chip`, `fl-seg`, `fl-tabs`, `fl-switch`, `fl-list` / `fl-row`, `page-head`, `crumb`, `sect-title`, `searchbox`, `kpi`, `itable`, `rtable`, `menu`, `sheet`, `modal`, `help-pop`, `cmdk`.
- **Règles** : peu de boutons visibles (actions secondaires dans un menu ⋯ / clic droit), une bulle « ? » sur chaque information calculée ou non évidente, cibles tactiles ≥ 36 px, aucun défilement horizontal à 390 px.

---

## 10. Installation (développement)

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

## 11. Production (Proxmox LXC)

### Installation initiale
1. **Créer le container** sur l'hôte Proxmox :
   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/debian.sh)"
   ```
   Debian 12 ou 13, unprivileged, **2 CPU, 4 Go RAM, 20 Go disque minimum** (le serveur actuel : Debian 13, 51 Go).
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
Bouton **Réglages, Mettre à jour le site**, ou :
```bash
bash /opt/recipelog/deploy/proxmox/deploy.sh   # --force : refait la mise à jour même sans nouveauté
                                               # --local-build : construit sur le serveur, sans GitHub
```
Le site n'est plus construit sur le serveur (15 à 20 min sur son disque dur) : à chaque mise à jour de `main`, GitHub Actions le construit (`.github/workflows/server-build.yml`, environ 2 min) et publie le paquet `recipelog-<commit>.tar.gz` dans la release **`server-builds`** du dépôt (10 derniers gardés, ne pas la supprimer).

Déroulé de `deploy.sh` :
1. lancé par le bouton, il se relance dans sa propre unité systemd `recipelog-deploy` (sinon `systemctl restart recipelog` l'arrêtait à la bascule) ;
2. dossier photos, `git pull` ; si le commit est déjà celui de `.next/DEPLOYED_COMMIT` → « Déjà à jour », fin ; sinon relance la version qui vient d'être téléchargée du script ;
3. `pnpm install` et `prisma generate`, seulement si `pnpm-lock.yaml` ou le schéma ont changé ;
4. télécharge le paquet GitHub du commit dans **`.next-build`** (le site reste en ligne sur `.next`) ; si GitHub le construit encore, attend (10 min maximum) ; sans paquet (build GitHub en échec, absent…) : build sur le serveur, comme avant ;
5. `prisma migrate deploy` ;
6. bascule `.next` → `.next-prev` et `.next-build` → `.next`, redémarrage, vérification de `/api/health?db=1` (site et base, 60 s) ;
7. si le site ne répond pas : retour automatique sur `.next-prev` ; si c'était le paquet GitHub, build sur le serveur puis nouvel essai.

Les messages « ✅ Déploiement terminé », « ✅ DÉJÀ À JOUR » et « ❌ ÉCHEC DU DÉPLOIEMENT » sont lus par l'écran de maintenance : ne pas les reformuler. Les lignes « ==> » sont les étapes (affichées par l'écran et par l'outil MCP `etat_du_site`). Tout le code du script est dans `main()` (bash le lit en entier avant de l'exécuter) : le `git pull` peut réécrire le fichier sans danger.

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
| Mise à jour bloquée | bouton « débloquer » dans Paramètres, ou `rm /tmp/recipelog-deploy.lock` ; en cours ? `systemctl status recipelog-deploy` |
| PDF en erreur | `which chromium` et `grep PUPPETEER /opt/recipelog/.env` ; vérifier Nesting |
| Retour arrière manuel | `cd /opt/recipelog && rm -rf .next-failed && mv .next .next-failed && mv .next-prev .next && systemctl restart recipelog` |

**Pièges déjà rencontrés** (tous corrigés dans les scripts) : clone bloqué par le dossier home de l'utilisateur, client Prisma non généré (pnpm 10), mode standalone non activé, CSS en 404 (`static/` à copier) ou 403 (droits nginx), photos effacées au déploiement.

---

## 12. Historique des versions

| Version | Contenu principal |
|---|---|
| **V2.5** | Moules (mode « Moule » du multiplicateur), variantes rangées sous la recette avec comparaison (menu ⋯ → Variantes), colonne % sur téléphone, fiche et page Production avec PDF, mode labo (écran allumé, pesées à cocher, minuteurs), recherche complète (texte et ingrédients, sous-recettes comprises), 10 outils MCP. |
| **V2.4** | Poids par pièce et rendement, 14 allergènes, coût de revient et prix conseillé, page des prix, intertitres, quantités liées dans les étapes. |
| **V2.3** | Recettes depuis TikTok / Instagram / YouTube via Claude ; sous-recettes imbriquées prises en compte partout ; corrections de calcul (pivot, masse cible, arrondi à ×1). |
| **V2.2** | Mise à jour du site en une minute (build GitHub Actions). |
| **V2.1** | Photos retirées, éditeur de thème PDF enrichi, accès MCP pour Claude. |
| **V2.0** | Nouveau design (menu latéral, menus clic droit / appui long, bulles « ? », Ctrl K, PWA), thèmes PDF personnalisables avec aperçu, nouvelles dispositions PDF, fiche recette et sous-recettes repensées, réparation des imports Recipe Keeper. |
| **V1.9** | PDF ~7× plus rapides, 7 styles prêts à l'emploi, habillage des pages, mise à jour du site avec retour arrière automatique. |
| **V1.8** | Sommaire PDF exact, 4 mises en page des recettes, petites corrections (voir §1). |
| **V1.7** | Corrections et fiabilisation (voir §1), partage désactivé, photos persistantes. |
| **V1.6** | Affichage décimales / entiers, masse cible exacte à l'écran, navigation en pilules, refonte de la page ingrédients, suppression de la page « Nouveautés ». Puis : classement rapide et sélection multiple des ingrédients, sélection multiple des recettes, liste de courses depuis un cahier, PDF de liste de courses, éditeur d'étapes en texte simple. |
| **V1.5** | Masse exacte (`adjustToTarget`, `is_exact`), filtre des recettes déjà dans un cahier, cadenas optimiste, index de recherche. |
| **V1.4** | Quantités en fourchette, page détail ingrédient (renommage en cascade, fusion), synchronisation de la base, import JSON (normalisation des unités). |
| **V1.3** | Correctif de la recherche dans les dossiers, sous-pages Paramètres, autocomplétion des ingrédients, lien du logo, unités (g, L, cc, cs, pièce, QS). |
| **V1.2** | Dossiers et vue explorateur, combobox catégories, réglages PDF d'une recette, « Mettre à jour la recette », masse modifiable des recettes figées, PDF 1 page par recette avec numérotation logique, import Recipe Keeper ZIP/HTML, bouton « Mettre à jour le site ». |
| **V1.1** | Livraison initiale : recettes, multiplication 3 modes, sous-recettes, cahiers PDF, listes de courses, partage, scripts Proxmox. |

## 13. Conventions

- Tout en **français** (interface, commentaires, commits, titres de PR : ils s'affichent dans « Version et nouveautés »).
- Travail sur une branche, puis **Pull Request vers `main`** ; `main` = ce qui part en production. Une PR par nouveauté.
- Avant chaque push : `pnpm typecheck && pnpm test`. Le workflow `server-build.yml` doit rester vert sur `main`.
- Journal : nouvelle fonction = nouvelle version mineure dans `src/lib/changelog.ts` ; correction = ligne dans `fixes` (détails dans `CLAUDE.md`). Mettre aussi à jour les sections 1 et 12 de ce fichier.

---

*Projet personnel. Tous droits réservés.*

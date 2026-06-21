# RecipeLog — Cahier des charges V1.6

> **Gestion de recettes de pâtisserie — Application web auto-hébergée**

---

| | |
|---|---|
| **Projet** | RecipeLog |
| **Version** | 1.6 — Toggle décimales · Navigation pill · Masse cible exacte · Optimisations |
| **Domaine** | `recipe.super-nono.cc` |
| **Écosystème** | `super-nono.cc` |
| **Hébergement** | Proxmox LXC · Cloudflare Zero Trust |
| **Cible** | Usage personnel — Pâtissier BTM 2ᵉ année |
| **Langue** | Français |
| **Design system** | FuelLog (dark · DM Serif Display · DM Mono) |
| **Stack** | Next.js 15 · TypeScript · Prisma 6 · PostgreSQL 15 · Tailwind v4 · Puppeteer · pdf-lib |

---

## 📝 Changelog V1.1 → V1.2 (itérations post-mise en production)

Le projet a été livré conformément à la V1.1, puis a fait l'objet d'**itérations correctives et fonctionnelles** suite à l'usage réel par le commanditaire. Les évolutions principales :

### 🆕 Nouvelles fonctionnalités

- **📁 Dossiers de recettes** : 1 dossier max par recette (rangement par grand type — Tartes, Entremets, etc.). Section CRUD dans `/settings`. Seed initial de 8 dossiers de pâtisserie.
- **🗂️ Vue explorateur sur `/recettes`** : grille de cards de dossiers (style Apple Files) + section « Sans dossier » en bas. Bouton « 📋 Tout afficher » pour la vue groupée plate. Fil d'Ariane quand on entre dans un dossier.
- **🗃️ Rangement en masse dans un dossier** (sans éditer chaque recette individuellement) : modal `AddRecipesToFolderModal` accessible à 2 endroits :
  - dans `/settings` via le bouton **« + Ajouter »** sur chaque ligne de dossier (utile pour ranger des dizaines de recettes après un import initial)
  - sur la vue d'un dossier via le bouton **« + Ranger des recettes ici »** (contextuel)
  - Multi-sélection avec chips ×, autocomplétion débouncée 200ms, toggle « N'afficher que les recettes sans dossier » activé par défaut. Assignation en `updateMany` une seule requête SQL.
- **🔍 Combobox catégories** : remplace la grille de 50+ chips par une saisie filtrée + dropdown (la liste des catégories pouvait dépasser 60 entrées chez l'utilisateur).
- **📄 Réglages PDF d'une recette individuelle** : nouvelle section `/settings` pour personnaliser format A4/A5, couleurs, polices, sections affichées du PDF d'une recette seule.
- **⚖️ Mettre à jour la recette** : bouton à côté de « Réinitialiser » sur la fiche recette → applique le coefficient/masse/pivot affiché et l'écrit comme nouvelle base en BDD (les sous-recettes liées ne sont pas touchées).
- **⚖️ Modifier la masse d'une recette figée** dans un cahier : nouvelle entrée du menu « ⋯ » avec les 3 modes (coefficient / masse / pivot) recalculant le snapshot proportionnellement.
- **🔄 Aperçu PDF manuel** dans la config d'un cahier : bouton « Mettre à jour l'aperçu » qui régénère le vrai PDF côté serveur sans avoir besoin d'enregistrer (Puppeteer ne tourne que sur clic, plus sur chaque frappe).

### 🛠️ Refontes / fixes majeurs

- **PDF — toujours 1 page par recette** : suppression du choix « 📄 Fiche unique / 📚 Séparées ». La recette parente et chaque sous-recette sont rendues sur leur propre page. Chaque page de sous-recette porte la mention `SOUS-RECETTE DE · [parent]` sous le titre.
- **PDF — sous-recettes indentées dans le sommaire** (préfixe `↳`, indentation 8mm, texte plus discret).
- **PDF — numérotation logique** : la couverture et le sommaire ne sont pas comptés. La 1ʳᵉ recette = page « 1 ». Implémenté via 2 passes Puppeteer (cover+TOC sans footer / recettes avec footer) fusionnées via **`pdf-lib`** (nouvelle dépendance).
- **PDF — pied de page en 3 zones** : gauche / **numéro centré** / droite. Alignement réduit à `Gauche` ou `Droite` (le centre est réservé au numéro de page).
- **PDF — couverture pleine page** (`@page :first { margin: 0 }` + `preferCSSPageSize`) et couleur d'accent de la couverture **découplée** de celle des recettes (`coverAccentColor` indépendant).
- **PDF — fix couleur du texte de la couverture** : était hardcodée sur le layout cercle.
- **PDF — étapes auto-numérotées (1. 2. 3.)** via CSS counters sur tous les PDF. Strip automatique de la numérotation manuelle existante en compatibilité.
- **PDF — étapes vides** : affichage `—` au lieu de « 1. » seul si l'éditeur Tiptap a sauvegardé `<p></p>`.

### 🎨 UX & simplifications

- **Éditeur d'étapes Tiptap** : toolbar réduite à **Gras / Italique / Souligné** (+ undo/redo). Tout le reste (titres, listes, couleurs, surlignage, code, citations, barré) retiré. Fix re-render React à chaque transaction (les étapes ne se sauvegardaient pas / les boutons ne changeaient pas de couleur). Placeholder via extension officielle Tiptap.
- **Formulaire de cahier épuré** : suppression de « Position des ingrédients », « Largeur colonne », « Mode du sommaire », « Numéros de page » → tous fixés aux bonnes valeurs par défaut (gauche / étroite / liste plate / toujours activé).
- **Menu « ⋯ » des entrées de cahier** : fix du clipping (`overflow-hidden` retiré) qui cachait le dropdown sur les dernières lignes du tableau.
- **Page de cahier refondue (wave 2)** : 2 onglets (Recettes / Apparence), liste compacte, drag-and-drop, pages chapitres, titres de section. Remplace l'ancienne page linéaire.
- **Réorganisation des couleurs/labels** dans `/settings` pour meilleure lisibilité des dossiers et catégories (pastille + nom en texte standard plutôt que texte dans la couleur).
- **Bouton « 🚀 Mettre à jour le site »** dans `/settings` + script `deploy.sh` Proxmox qui enchaîne git pull / install / migrate / build / restart.

### 📥 Import / intégrations

- **Import Recipe Keeper en HTML/ZIP** : parser microdata (140 recettes importées chez l'utilisateur) avec extraction automatique de la photo principale.

### 🗃️ Schéma BDD — modifications

- ➕ Nouvelle table `folders` (id, name unique, color, icon)
- ➕ Nouvelle colonne `recipes.folder_id` (FK, `ON DELETE SET NULL`)
- ➕ Nouvelles colonnes sur `cookbooks_recipes` :
  - `section_title` (titre de section affiché au-dessus d'une entrée)
- ➕ Nouvelle table `cookbooks_chapters` (id, cookbook_id, position, title, intro, image_url)
- 📌 Le champ `cookbooks_recipes.subrecipe_mode` reste en BDD pour compat mais est **ignoré au rendu** (toujours traité comme « separate »)
- 📌 La colonne `cookbooks_recipes.group_with_previous` a été **droppée** (fonctionnalité abandonnée)
- 📌 Settings clé `recipePdfSettings` (JSON) — réglages du PDF d'une recette individuelle

### 🏗️ Stack technique retenu

| Couche | Choix | Commentaire |
|---|---|---|
| Framework | **Next.js 15** (App Router, Server Actions) | SSR + actions serveur intégrées |
| Langage | **TypeScript strict** | typecheck propre obligatoire |
| ORM | **Prisma 6** | migrations versionnées, types auto-générés |
| Base | **PostgreSQL 15+** (ext `pg_trgm`) | recherche fuzzy `pg_trgm` |
| Style | **Tailwind CSS v4** + tokens FuelLog | dark only |
| Validation | **Zod** | sécurise tous les inputs / form data |
| PDF | **Puppeteer 24** + **pdf-lib** | rendu Chromium + fusion multi-pass |
| Éditeur riche | **Tiptap v3** (StarterKit + Underline + Placeholder) | étapes des recettes |
| Tests | **Vitest 4** | 50 tests unitaires en place |
| Déploiement | **LXC Debian 12** + script `deploy.sh` | géré depuis l'UI via `/settings` |

---

## 📝 Changelog V1.2 → V1.3 (correctifs UI dossiers + recherche + nouvelles fonctionnalités)

### 🐛 Bugs corrigés

- **🔍 Recherche globale cassée par les dossiers** (`src/app/page.tsx`) : en vue explorateur, la liste de recettes était toujours chargée avec `folderId: "none"` (uniquement les recettes sans dossier), même quand une recherche ou un filtre était actif. Résultat : taper un nom de recette dans la barre de recherche ne retournait que les recettes non rangées dans un dossier.
  - **Fix** : lorsqu'une recherche ou un filtre est actif en vue explorateur (`hasSearchOrFilters`), on passe `folderId: undefined` pour chercher dans **toutes** les recettes quel que soit leur dossier. Le filtre `folderId: "none"` est conservé uniquement pour l'affichage de la section « Sans dossier » en bas de l'explorateur quand aucun filtre n'est actif.

### 🎨 Correctifs UI / responsive

- **📱 FolderManager sur mobile** (`src/components/FolderManager.tsx`) : la ligne de chaque dossier dans `/settings` affichait le badge nom + les 3 boutons (« + Ajouter », « Éditer », « Supprimer ») côte à côte sur une seule ligne. Sur un petit écran, les boutons écrasaient le nom du dossier qui devenait illisible ou tronqué.
  - **Fix** : la ligne passe en `flex-col` sur mobile et `flex-row` à partir de `sm:`. Même fix appliqué à `CategoryManager`.

- **📦 FolderCard trop grande** (`src/components/FolderCard.tsx`, `src/app/page.tsx`) : les cards de dossiers en vue explorateur utilisaient `aspect-ratio: 1/1` avec 2 colonnes sur mobile, produisant des blocs carrés d'environ 165 × 165 px, jugés trop imposants.
  - **Fix** : grille → `grid-cols-3 sm:grid-cols-4 lg:grid-cols-5`, `aspect-ratio` → `4/3`, icône réduite à `1.6rem`, police à `0.85rem`.

### 🆕 Nouvelles fonctionnalités

- **🗂️ Paramètres allégés — sous-pages dédiées** : la page `/settings` ne montrait plus les listes complètes de dossiers et catégories (qui peuvent être très longues). Remplacées par des cartes cliquables avec compteur + flèche vers des sous-pages :
  - `/settings/folders` → `FolderManager` complet (inchangé fonctionnellement)
  - `/settings/categories` → `CategoryManager` complet
  - `/settings/ingredients` → `IngredientBaseManager` (voir ci-dessous)
  - Toutes les sous-pages ont un lien « ← Paramètres » de retour.

- **🧂 Base d'ingrédients + autocomplétion** :
  - La table `ingredients_base` (déjà dans le schéma Prisma depuis V1.2 mais inactive) est maintenant alimentée automatiquement : chaque nom d'ingrédient saisi dans `createRecipe` ou `updateRecipe` est upserted dans la base (dédoublonnage par nom unique).
  - Nouveau composant `IngredientNameInput` : remplace le `<input>` texte brut dans le mode « liste » de `RecipeForm`. Déclenche une requête debounced (200 ms) vers `GET /api/ingredient-bases?q=` dès 2 caractères saisis et affiche un dropdown de suggestions.
  - Nouvelle route API `GET /api/ingredient-bases` : recherche `contains` insensible à la casse, retourne 10 résultats max.
  - `IngredientBaseManager` : composant client avec liste filtrable (champ de recherche si > 5 entrées), actions **Renommer** et **Supprimer**. Supprimer un ingrédient de la base ne supprime pas les noms sur les recettes existantes (ON DELETE SET NULL sur `ingredientBaseId`).
  - Actions settings : `renameIngredientBase(id, formData)` et `deleteIngredientBase(id)`.

- **🔗 Logo cliquable avec lien externe paramétrable** :
  - Nouveau composant client `LogoLink` : sur la page d'accueil (`/`), clique vers l'URL externe configurée (ouvre dans un nouvel onglet) ; sur toutes les autres pages, clique vers `/` (comportement standard).
  - `layout.tsx` devient `async` pour lire `siteUrl` depuis la table `Setting` (clé `"siteUrl"`) et le passer à `LogoLink`.
  - Actions settings : `getSiteUrl()` et `saveSiteUrl(formData)`.
  - `/settings` : champ URL + bouton « Enregistrer » pour configurer le lien (laisser vide pour désactiver).

### 🆕 Nouvelles fonctionnalités post-V1.3

- **⚖️ Unités d'ingrédients** (`prisma/schema.prisma`, `src/components/RecipeForm.tsx`, `src/components/RecipeBody.tsx`, `src/lib/pdf/template.ts`) : chaque ingrédient possède désormais une unité sélectionnable.
  - **Unités disponibles** : `g` (défaut), `L`, `mL`, `pièce`, `QS` (quantité suffisante)
  - **UX** : bouton-badge cliquable à côté du champ quantité → dropdown des 5 unités. Quand `QS` est sélectionné, le champ quantité disparaît.
  - **Masse totale** : calculée uniquement sur les ingrédients en `g` (les autres unités sont exclues du total)
  - **Affichage** : fiche recette + sous-recettes affichent l'unité à côté de la quantité. `QS` s'affiche en couleur accent sans nombre.
  - **PDF** : même logique — `QS` en couleur, autres unités avec leur symbole.
  - **BDD** : migration `20260522100000_add_ingredient_unit` — colonne `unit TEXT NOT NULL DEFAULT 'g'` sur la table `ingredients`.

### 🐛 Correctifs post-V1.3

- **✏️ Boutons de formatage Tiptap (gras/italique/souligné)** (`src/components/RichTextEditor.tsx`) : les boutons utilisaient `onClick`, ce qui provoquait une perte de focus de l'éditeur avant l'exécution de la commande — la sélection était réinitialisée et le format basculait de façon imprévisible au clic sur un bouton ou dans la zone de texte.
  - **Fix** : remplacement de `onClick` par `onMouseDown` + `e.preventDefault()` sur tous les boutons de la toolbar (G / I / S / undo / redo). Le `preventDefault()` empêche le blur, l'éditeur conserve le focus et la sélection, et la commande s'applique correctement.

### 📌 Notes pour le prochain développeur

- La logique d'affichage de `src/app/page.tsx` distingue 4 modes : **explorateur** (défaut, grille de dossiers), **dossier ouvert** (`?folder=<id>`), **sans dossier** (`?folder=none`), **tout afficher** (`?view=all`). La variable `hasSearchOrFilters` doit être vérifiée avant d'appliquer tout filtre de dossier sur le chargement des recettes en mode explorateur.
- `FolderCard` est utilisée uniquement dans la `ExplorerView` de `page.tsx`.
- `FolderManager` et `CategoryManager` sont des composants client (`"use client"`). Layout responsive : `flex-col sm:flex-row`.
- La table `ingredients_base` est peuplée automatiquement via `upsertIngredientBases()` dans `src/app/actions/recipes.ts` — ne pas supprimer cette fonction ou les appels en fin de `createRecipe`/`updateRecipe`.
- `layout.tsx` est maintenant `async` pour lire `siteUrl`. Ne pas le repasser en synchrone sans retirer l'appel `getSiteUrl()`.
- Le pattern de sous-pages settings (`/settings/folders`, `/settings/categories`, `/settings/ingredients`) est standardisé : page Server Component, `export const dynamic = "force-dynamic"`, lien retour `← Paramètres`, carte `fl-card` autour du manager.

---

## 📝 Changelog V1.3 → V1.4 (quantités fourchette + gestion ingrédients + import)

### 🆕 Nouvelles fonctionnalités

- **↔ Quantités en fourchette (mode « entre »)** (`prisma/schema.prisma`, `src/lib/validation.ts`, `src/components/RecipeForm.tsx`, `src/components/RecipeBody.tsx`) :
  - Chaque ingrédient peut désormais avoir une **quantité min et max** en plus de son unité habituelle.
  - **UX** : le sélecteur d'unité expose un bouton **« ↔ entre (min/max) »** en bas du dropdown. Clic → deux champs quantité (min / max) + badge `↔` accentué. Le dropdown en mode fourchette propose toutes les unités sauf QS, avec un bouton **« ← unité simple »** pour revenir au mode standard.
  - **Toutes les unités supportées** : g, L, cc, cs, pièce.
  - **Affichage sur la fiche** : format `250/300g` ou `1/2 cs (≈10g)` (la masse estimée utilise la moyenne min+max).
  - **Masse totale** : calculée sur la **moyenne** `(min+max)/2` pour les ingrédients en fourchette, sur la valeur exacte pour les autres.
  - **BDD** : nouvelle colonne `ingredients.quantity_g_max DECIMAL(10,3) nullable` — migration `20260531140000_add_ingredient_quantity_max`.

- **🧂 Gestion avancée de la base d'ingrédients** (`src/settings/ingredients/[id]/page.tsx`, `src/components/IngredientDetailClient.tsx`, `src/app/actions/settings.ts`) :
  - **Page détail** `/settings/ingredients/:id` : formulaire de renommage avec **cascade automatique** (met à jour tous les ingrédients des recettes liés par ID ou par nom insensible à la casse), UI de **fusion** (picker de l'ingrédient cible, réassignation de toutes les recettes vers la cible puis suppression de la source), liste des recettes qui utilisent cet ingrédient avec lien direct.
  - **Badge compteur** sur chaque ligne de la liste : nombre de recettes distinctes via requête SQL `COUNT(DISTINCT recipe_id)` tenant compte des liens directs ET des correspondances de nom (insensible à la casse).
  - **Bouton « 🔄 Synchroniser »** dans `/settings/ingredients` : parcourt toutes les recettes et ajoute dans la base les ingrédients manquants (utile après un import ou si des entrées ont été ajoutées manuellement). Action `syncAllIngredientBases()`.

- **📥 Import JSON amélioré** (`src/app/actions/import.ts`) :
  - **Normalisation des unités à l'import** : `mL → g×1`, `cl → g×10`, `dl → g×100`, `kg → g×1000`, `cc`/`cs` acceptés nativement sans conversion.
  - **Dédoublonnage insensible à la casse** : `findFirst` avec `mode: "insensitive"` avant création dans `ingredients_base` — évite les doublons `Lait`/`lait`.

### 🛠️ Correctifs & améliorations UX

- **📱 Autocomplétion ingrédients sur mobile** (`src/components/IngredientNameInput.tsx`) : le dropdown se fermait correctement sur desktop (mousedown) mais restait ouvert sur mobile (aucun listener touch). Fix : ajout d'un listener `touchstart` + `onBlur` avec délai 150 ms pour laisser les events `onMouseDown`/`onTouchEnd` s'exécuter avant la fermeture. Le bouton « + Ajouter » est remplacé par un message informatif (plus de soumission accidentelle sur mobile).

- **⏱ Timeout d'overlay de déploiement** (`src/components/MaintenanceOverlay.tsx`) : porté de 5 min à **12 min** pour accommoder la durée réelle du build Next.js + Puppeteer sur le LXC. Redirection vers l'accueil (`/`) à la fin (anciennement `/whats-new`, supprimé en V1.6).

- **📦 pnpm — suppression des warnings de build scripts** (`package.json`) : ajout de `"pnpm": { "onlyBuiltDependencies": [...] }` listant explicitement les paquets autorisés à exécuter des scripts de build (Prisma, esbuild, sharp, puppeteer). Supprime les avertissements `Ignored build scripts` sur `pnpm install`.

### 🗃️ Schéma BDD — modifications

- ➕ Nouvelle colonne `ingredients.quantity_g_max` (`DECIMAL(10,3)`, nullable) — stocke la borne haute d'une quantité en fourchette. `quantity_g` stocke le minimum, `unit` reste l'unité effective.
- Migration : `prisma/migrations/20260531140000_add_ingredient_quantity_max/migration.sql`

### 📌 Notes pour le prochain développeur

- **Mode fourchette** : `quantityGMax` est `null` pour un ingrédient simple et `> quantityG` pour une fourchette. Il n'existe pas d'unité `"entre"` en BDD — c'est un mode d'interface uniquement. Le `UnitSelector` de `RecipeForm.tsx` gère le basculement via les props `isRange` / `onRangeEnter` / `onRangeExit`.
- `src/lib/recipes.ts` — `totalMassG` calcule `(quantityG + quantityGMax) / 2` pour les fourchettes (grammes uniquement).
- `RecipeBody.tsx` — le rendu d'un ingrédient en fourchette affiche `${min}/${max} ${unit}`. Pour les unités avec facteur (cc ≈ 5g, cs ≈ 15g), la masse approximative est indiquée en parenthèses.
- Ne pas ajouter `"QS"` aux options en mode fourchette (`UNITS_NO_QS` dans `RecipeForm.tsx`).
- `syncAllIngredientBases()` peut être appelée sans danger : idempotente, ne crée que les entrées manquantes.
- Le guide de conversion JSON (`CONVERSION_RECETTES_PROMPT.md`) a été mis à jour pour refléter que `mL` n'est plus une unité stockée (converti en `g×1` à l'import).

---

## 📝 Changelog V1.4 → V1.5 (masse exacte · corrections UI · optimisations)

### 🆕 Nouvelles fonctionnalités

- **⚖️ Masse exacte** (`src/lib/massAdjust.ts`, `MultiplierPanel`, `EditSubRecipeModal`, `EditSnapshotMassModal`) : toggle disponible dans les 3 panneaux de modification. Quand activé en mode « masse totale cible », applique `adjustToTarget()` qui ajuste ±1g sur les plus gros ingrédients en grammes pour atteindre la masse cible EXACTE (compense le Math.ceil systématique).
- **`isExact` en BDD** (`prisma/schema.prisma`) : champ `is_exact: Boolean` sur le modèle `SubRecipe`, colonne `is_exact` en base, migration `20260601000001_subrecipe_is_exact`. `buildRecipeSnapshot` applique `adjustToTarget` quand `link.isExact && link.calcMode === "mass_target"`.
- **Filtre recettes déjà dans le cahier** (`AddRecipesToCookbookModal`, `CookbookEntriesTable`) : la modal d'ajout accepte une prop `existingRecipeIds?: number[]` — les recettes déjà présentes dans le cahier n'apparaissent plus dans la liste de sélection.

### 🛠️ Correctifs

- **Cadenas sous-recettes — état optimiste** (`SubRecipeAccordion`) : `toggleSubRecipeLock` ne fait plus de `revalidatePath` (évitait un rechargement qui réinitialisait le panel multiplicateur). `SubRecipeAccordion` utilise un état optimiste `lockedOptimistic` pour le rendu immédiat du cadenas.
- **Limite recettes** (`src/app/api/recipes/route.ts`, `src/lib/recipes.ts`) : bug `parseInt("0") || 50 === 50` — `limit=0` retournait 50 résultats au lieu de tout charger. Fix : `parsedLimit === 0 ? undefined : parsedLimit`. Suppression du `take: 200` hardcodé dans `listRecipes`.
- **Logo réduit** (`LogoLink.tsx`) : `fontSize` réduit de 1.8rem à 1.4rem.
- **Page ingrédients — breakout CSS** : remplacé `width: 100vw` + `calc(-50vw + 50%)` par `marginLeft: "-1rem"` + `width: calc(100% + 2rem)` (l'approche `100vw` ne fonctionnait pas dans les conteneurs imbriqués).
- **Sous-recettes dans les PDFs — arrondi supérieur systématique** : `buildRecipeSnapshot` utilise désormais `scaleQty()` (Math.ceil) sur tous les ingrédients — plus jamais de décimales dans les PDFs/snapshots. Conversion L → grammes entiers (×1000, Math.ceil).

### 🏗️ Refactoring

- **`src/lib/massAdjust.ts`** — nouveau fichier de fonctions pures partagées entre client et serveur : `ingMass(q, unit)` (convertit une quantité en masse g), `scaleQty(qty, unit, coef)` (applique un coefficient avec Math.ceil, L→g retourne unit "g"), `adjustToTarget(ingredients, targetMassG)` (ajuste ±1g sur les gros ingrédients), type `AdjIngredient` exporté.
- **`buildRecipeSnapshot` — coefficients propres par sous-recette** (`src/lib/cookbooks.ts`) : chaque sous-recette est scalée avec `computeLocalCoef(calcMode, calcValue, childBaseTotalG, pivotBaseQtyG)` au lieu du coefficient global du parent. Sous-recette verrouillée : `effectiveCoef = localCoef`. Sous-recette non verrouillée : `effectiveCoef = localCoef * k`.
- **`applyMultiplierToRecipe`** (`src/app/actions/recipes.ts`) : accepte un paramètre optionnel `targetMassG` pour l'ajustement exact.

### 🗃️ Schéma BDD — modifications

- ➕ Nouvelle colonne `sub_recipes.is_exact` (`BOOLEAN NOT NULL DEFAULT false`) — migration `20260601000001_subrecipe_is_exact`
- ➕ Migration `20260601000000_add_perf_indexes` : index sur `name_normalized`, `ingredients(recipe_id)`, et index GIN `pg_trgm` sur `name` pour la recherche fuzzy

### 📌 Notes pour le prochain développeur

- **`src/lib/massAdjust.ts` est intentionnellement sans import Prisma** : fonctions pures uniquement, utilisables côté client ET serveur (le panneau multiplicateur est un composant client ; `buildRecipeSnapshot` est côté serveur). Ne pas y importer Prisma.
- **Ne pas remettre `revalidatePath` dans `toggleSubRecipeLock`** : le rechargement de route qu'il déclenchait réinitialisait l'état du panel multiplicateur (`MultiplierPanel`) en cours d'utilisation. L'état optimiste dans `SubRecipeAccordion` est la bonne approche.
- **Pattern `adjustToTarget`** : la fonction ajuste seulement les ingrédients dont la masse calculée est > 0g (exclut pièce/QS/L non convertis) et ne modifie qu'à ±1g par itération pour rester proche de la valeur Math.ceil. Elle est idempotente si `targetMassG` est déjà atteint.
- **Les 3 endroits du toggle masse exacte** : `MultiplierPanel` (recette principale, côté client), `EditSubRecipeModal` (sous-recettes de la fiche recette), `EditSnapshotMassModal` (recettes figées dans les cahiers). Les trois doivent rester synchronisés si on change la logique d'affichage ou le nom du champ.

---

## 📝 Changelog V1.5 → V1.6 (toggle décimales · navigation pill · masse cible exacte · suppression Nouveautés)

### 🆕 Nouvelles fonctionnalités

- **🔢 Toggle décimales / arrondi** (`src/components/RecipeBody.tsx`) : nouveau toggle dans le panneau de multiplication. Quand activé, les quantités affichent les décimales exactes au lieu de l'arrondi Math.ceil. Utilise `scaleQtyExact()` / `formatGDecimal()` pour l'affichage précis.
- **⚖️ Masse cible exacte en affichage** (`src/components/RecipeBody.tsx`) : en mode « masse totale cible » sans décimales, `adjustToTarget()` est désormais appliqué côté **affichage** (plus seulement côté sauvegarde). Le total affiché correspond exactement à la masse demandée. Les quantités pré-calculées sont passées à `IngredientsTable` via la prop `adjustedQties`.
- **🧮 Refonte de la page ingrédients** (`src/app/settings/ingredients/page.tsx`) : grille CSS `auto-fill` responsive remplaçant le layout fixe. Recherche intégrée avec compteur de résultats.

### 🛠️ Correctifs

- **⚖️ Précision masse cible** (`src/components/RecipeBody.tsx`) : le total affiché en mode « masse totale » pouvait dépasser la cible (ex : 393g demandé → 396g affiché) à cause du Math.ceil individuel sur chaque ingrédient. Fix : `adjustToTarget()` redistribue ±1g sur les plus gros ingrédients en grammes pour atteindre la cible exacte dans le rendu.
- **📱 ModeSwitcher responsive** (`src/components/RecipeBody.tsx`) : les tabs COEFFICIENT / MASSE TOTALE / PIVOT utilisaient la classe `.fl-nav-item` (conçue pour la barre de navigation principale, avec `height: 54px` et styles inadaptés). Remplacé par des styles inline compacts (`fontSize: 0.72rem`, pas de hauteur fixe).
- **🔧 Suppression du toggle `forceExact`** : devenu redondant puisque `adjustToTarget` est appliqué automatiquement en mode masse cible. Remplacé par un texte informatif statique.

### 🎨 Refonte UX

- **🧭 Navigation pill Apple-style** (`src/components/AppNav.tsx`, `src/app/globals.css`) : refonte complète du header. Logo + version inline avec une barre de navigation arrondie (pilules). Icônes (📖, ★, 📚, 🛒, ⚙) avec labels masqués sur mobile. Styles `.fl-nav-pill` ajoutés au CSS global. Suppression du composant `LogoLink.tsx` (logique intégrée dans `AppNav`).
- **🗑️ Suppression de la fonctionnalité « Nouveautés »** : page `/whats-new` supprimée, lien retiré de la navigation et des paramètres, redirection post-déploiement changée vers `/` (accueil). Le fichier `src/lib/changelog.ts` est conservé (utilisé par `AppNav` pour le badge de version).

### 🏗️ Optimisations

- **⚡ Batch `upsertIngredientBases`** (`src/app/actions/recipes.ts`) : les upserts d'ingrédients dans la base sont regroupés en une seule transaction au lieu d'un upsert par ingrédient.
- **📊 Index GIN trigram** (`pg_trgm`) : index GIN sur `recipes.name` pour accélérer les recherches `ILIKE`. Migration `20260601000000_add_perf_indexes`.
- **🔧 Fix `quantityGMax`** : correction du bug où `quantityGMax` n'était pas correctement pris en compte dans certains calculs de fourchette.

### 📌 Notes pour le prochain développeur

- **`adjustToTarget` appliqué en affichage** : en mode `mass_target` sans décimales, `RecipeBody` calcule `adjustedQties` via `useMemo` et le passe à `IngredientsTable`. Si `adjustedQties` est non-null, chaque ligne utilise les valeurs pré-calculées au lieu de recalculer individuellement.
- **Page `/whats-new` supprimée** : ne pas recréer cette route. Si une fonctionnalité similaire est souhaitée, utiliser le `CHANGELOG` dans `src/lib/changelog.ts` qui contient l'historique des versions.
- **`AppNav` est un composant client** : il importe `CHANGELOG[0].version` pour le badge. Si le changelog est vidé, le badge affichera `"v1"` par défaut.

---

## Sommaire

1. [Contexte & objectifs](#1-contexte--objectifs)
2. [Périmètre fonctionnel](#2-périmètre-fonctionnel)
3. [Personas & user stories](#3-personas--user-stories)
4. [Spécifications fonctionnelles](#4-spécifications-fonctionnelles)
5. [Design system](#5-design-system)
6. [Architecture technique](#6-architecture-technique)
7. [Modèle de données](#7-modèle-de-données)
8. [Arborescence & navigation](#8-arborescence--navigation)
9. [Livrables & critères d'acceptation](#9-livrables--critères-dacceptation)
10. [Planning indicatif](#10-planning-indicatif)

---

## 1. Contexte & objectifs

### 1.1 Contexte utilisateur

Le commanditaire est un **pâtissier en deuxième année de BTM** (Brevet Technique des Métiers) pour qui la gestion rigoureuse des recettes est un enjeu quotidien. Ses recettes sont aujourd'hui éparpillées entre une application grand public (**Recipe Keeper**), des fichiers PDF, et des notes manuscrites.

Recipe Keeper, bien qu'utile, n'est pas adapté aux spécificités de la pâtisserie professionnelle :

- Absence de logique de **masse totale**
- Pas de système d'**ingrédient pivot**
- Pas de **sous-recettes**
- Aucune possibilité de personnalisation avancée

Par ailleurs, le commanditaire maintient un écosystème d'outils personnels auto-hébergés (**super-nono.cc**) regroupant FuelLog, Salaire, Proxmox, n8n, DiscoPanel et BotPanel. Tous partagent une identité visuelle cohérente (thème sombre, typographie DM Serif Display + DM Mono, palette sémantique). Le nouvel outil **RecipeLog** doit s'intégrer parfaitement à cet écosystème.

### 1.2 Objectifs du projet

- Centraliser l'ensemble des recettes de pâtisserie dans un outil unique, fiable et auto-hébergé
- Disposer d'une **logique de calcul adaptée à la pâtisserie** (masse totale, coefficient, ingrédient pivot)
- Permettre la composition de recettes complexes via un système de **sous-recettes**
- Générer des **cahiers de recettes PDF** personnalisables pour usage personnel ou partage
- Garantir la pérennité des données via un stockage robuste et des backups automatisés
- S'intégrer visuellement et techniquement à l'écosystème **super-nono.cc**

### 1.3 Principes directeurs

> **Principe 01 — Simplicité**
> RecipeLog privilégie des champs minimaux et un bloc de texte libre pour les étapes, plutôt qu'une structure rigide. L'utilisateur écrit ce qu'il veut, comme il veut.

> **Principe 02 — Précision pâtissière**
> Tout est en grammes, masse totale calculée automatiquement, recalcul instantané dès qu'un coefficient change.

> **Principe 03 — Flexibilité des sous-recettes**
> Une recette complexe se compose de sous-recettes indépendantes, chacune ayant son propre coefficient et sa propre masse totale cible.

> **Principe 04 — Cohérence visuelle**
> Le design suit à la lettre le design system FuelLog : dark exclusif, monospace first, palette sémantique, aucun gradient.

---

## 2. Périmètre fonctionnel

Le projet se découpe en une **V1 (MVP complet)** à développer immédiatement, et une **V2 (évolutions)** dont l'architecture doit être prévue mais qui ne sera pas développée dans ce premier lot.

### 2.1 V1 — Périmètre livrable

#### 2.1.1 Gestion des recettes

- Création, édition, suppression, duplication d'une recette
- Champs : nom, photo (optionnelle), tags, catégories, ingrédients, étapes (bloc texte libre), notes/astuces, source, favoris, notation 1-5
- **Masse totale calculée automatiquement** (somme des ingrédients)
- Ingrédients : **2 modes au choix via toggle**
  - **Mode A** : saisie libre (texte à chaque recette)
  - **Mode B** : sélection depuis une base d'ingrédients réutilisable
- Variantes / versions d'une même recette
- Commentaires datés (journal des essais successifs)

#### 2.1.2 Système de multiplication (pâtisserie)

- **Mode coefficient** : appliquer un coefficient direct (×0.5, ×2, ×3.33...)
- **Mode masse totale cible** : saisir la masse finale voulue → coefficient calculé auto
- **Mode ingrédient pivot** : choisir un ingrédient de référence, saisir sa quantité cible → coefficient calculé auto
- Recalcul en temps réel de toutes les quantités et de la masse totale
- Unité : **grammes uniquement**

#### 2.1.3 Sous-recettes

- Ajout d'une sous-recette via menu **3 points** de la fiche recette
- Nommer la sous-partie (ex : « Mousse », « Biscuit », « Glaçage »)
- Sélectionner une recette existante comme sous-recette
- Définir la masse totale cible ou un coefficient → recalcul automatique
- Plusieurs sous-recettes possibles dans une recette principale
- **Affichage en accordéon** : flèche droite `›` fermé / flèche bas `⌄` ouvert
- Lien cliquable vers la fiche complète de la sous-recette
- **Propagation du coefficient global** : appliquer un coefficient à la recette principale multiplie automatiquement toutes ses sous-recettes non verrouillées
- **Modification indépendante** : chaque sous-recette peut être ajustée individuellement (coef / masse cible / ingrédient pivot) via son accordéon
- **Verrouillage 🔒 optionnel** : une sous-recette verrouillée reste figée à sa masse et n'est pas affectée par le coefficient global

#### 2.1.4 Recherche & navigation

- Recherche par **nom** de recette
- Recherche par **tag**
- Recherche par **catégorie**
- **Navigation par dossier** (vue explorateur sur `/recettes`)
  - Page d'accueil affiche les **cards de dossiers** + section « Sans dossier »
  - Clic sur un dossier → vue filtrée du dossier + fil d'Ariane
  - Bouton **« 📋 Tout afficher »** → liste plate de toutes les recettes groupées par dossier
- Onglet dédié **Favoris**
- Filtres par tag et catégorie dans la liste principale (chips horizontaux)

#### 2.1.5 Impression PDF

- **Impression d'une recette unique** depuis la fiche (bouton direct).
  Le style est configurable globalement dans `/settings → PDF d'une recette` (format A4/A5, couleurs, polices, sections affichées).
- **Système de cahiers** : création d'un cahier vide, puis ajout de recettes depuis chaque fiche via « Ajouter au cahier »
- **Mode de liaison au choix à chaque ajout** :
  - **🔗 Liée dynamique** : le cahier reflète toujours la version actuelle de la recette
  - **📌 Figée (snapshot)** : copie figée au moment de l'ajout
  - Actions post-ajout dans le cahier : `Figer maintenant` / `Mettre à jour le snapshot` / `Reconvertir en liée` / `⚖️ Modifier la masse` (sur les figées : 3 modes coef/masse/pivot recalculant le snapshot)
- **Rendu des sous-recettes** : **toujours 1 page par recette** (parente + chaque sous-recette). Chaque page de sous-recette porte la mention `SOUS-RECETTE DE · [parent]` sous le titre.
  Les sous-recettes apparaissent indentées dans le sommaire (préfixe `↳`).
  *Le choix « Fiche unique / Séparées » de la V1.1 a été retiré au profit de ce comportement unique.*
- **Numérotation des pages** : la couverture et le sommaire ne sont pas comptés. La 1ʳᵉ recette = page « 1 ». Implémentation : 2 passes Puppeteer (cover+TOC sans footer / recettes avec footer) fusionnées via `pdf-lib`.
- **Pied de page** : 3 zones (gauche / **numéro centré** / droite). L'utilisateur choisit l'alignement du texte (gauche ou droite ; le centre est réservé au numéro de page).
- **Couverture pleine page** (`@page :first { margin: 0 }`) avec **couleur d'accent indépendante** de la couleur d'accent des recettes.
- **Étapes auto-numérotées** (1. 2. 3.) via CSS counters sur chaque `<p>` de premier niveau. La numérotation manuelle existante dans les vieilles recettes est strippée automatiquement avant rendu.
- **Aperçu PDF manuel** dans la config du cahier : bouton « Mettre à jour l'aperçu » qui régénère le vrai PDF côté serveur (sans devoir enregistrer la config). Plus de fetch automatique pour ne pas saturer Puppeteer.
- Formats supportés : **A4 et A5**
- Paramètres du cahier : réorganisation (drag & drop), sommaire on/off, page de garde on/off et personnalisable (layouts cercle/cadre/full-bleed/minimal/typo-large/typo-divider, dégradés ou image de fond, couleur d'accent du coin), logo on/off, pied de page
- Partage d'un cahier via lien public (téléchargement PDF anonyme)
- Téléchargement PDF uniquement (pas d'impression directe CUPS en V1)

#### 2.1.6 Liste de courses

- Génération automatique depuis une ou plusieurs recettes sélectionnées
- Quantités adaptées au coefficient appliqué à chaque recette
- Ajout manuel d'articles libres (ex : œufs, pain)
- Plusieurs listes en parallèle (ex : Carrefour, Marché, Épicerie bio)
- Fusion automatique des ingrédients identiques (somme des quantités)
- Cases à cocher en mode courses (interface mobile optimisée)
- Export PDF de la liste pour impression

#### 2.1.7 Import / Export

- **Export JSON** : sauvegarde manuelle de toutes les données
- **Import JSON** : restauration depuis un export
- **Import initial unique** : depuis le PDF Recipe Keeper du commanditaire, exécuté par le développeur à la mise en production

#### 2.1.8 Paramètres

Section unique `/settings` regroupant :

- **🚀 Mise à jour du site** : bouton qui lance `deploy.sh` sur le LXC (git pull / install / migrate / build / restart) avec overlay de maintenance.
- **📁 Dossiers** : CRUD complet — créer / renommer / changer couleur / supprimer. Compte de recettes par dossier. Supprimer un dossier ne supprime jamais les recettes (passage en « Sans dossier » via `ON DELETE SET NULL`). **Bouton « + Ajouter »** sur chaque ligne qui ouvre la modal d'ajout en masse.
- **🏷️ Catégories** : CRUD identique aux dossiers (tags secondaires).
- **📄 PDF d'une recette** : format A4/A5, couleur d'accent (titres/traits), couleur du texte, polices titres + corps, taille du texte, sections affichées (Tags, Source, Note, Notes & astuces, Masse totale, Taille de portion). Stocké dans `settings` sous la clé `recipePdfSettings`.
- **📥 Import Recipe Keeper** : 2 onglets — *ZIP / HTML* (parser microdata + photos) et *CSV* (legacy).
- Gestion du logo personnel (upload + toggle) *— prévu, non implémenté à ce jour*
- Export/import JSON manuel *— prévu, non implémenté à ce jour*

### 2.2 V2 — Évolutions prévues

> L'architecture V1 doit permettre d'ajouter ces fonctionnalités sans refonte. Elles ne sont pas à développer en V1 mais à prévoir dans le modèle de données et l'API.

| Fonctionnalité | Description |
|---|---|
| **Coût de revient** | Base d'ingrédients avec prix unitaire, calcul auto du coût total et par portion |
| **Import depuis URL** | Coller un lien de site de recettes → import auto (titre, ingrédients, étapes, photo) |
| **Scan OCR** | Photo d'une recette papier → conversion en texte éditable |
| **Étapes numérotées auto** | Détection auto des étapes dans le bloc de texte libre |
| **PWA** | Installation sur mobile/tablette + hors-ligne partiel |
| **Backups externes** | Envoi automatique vers S3/Backblaze/NAS distant |
| **API REST publique** | Pour intégration future avec app mobile native |
| **Regroupement par rayon** | Liste de courses triée par rayon magasin |
| **Historique articles fréquents** | Suggestions rapides des ingrédients récurrents |
| **Partage de liste de courses** | Partage d'une liste à un tiers via lien |

### 2.3 Hors périmètre

Les fonctionnalités suivantes ne seront **pas développées**, ni en V1 ni en V2, sauf demande explicite ultérieure :

- Conversion d'unités automatique (g ↔ ml ↔ cuillères)
- Timers intégrés aux étapes
- Mode cuisine plein écran
- Historique « dernière fois cuisinée »
- Calendrier de cuisine / planificateur de repas
- Suggestions automatiques « à refaire »
- Mode « vider le frigo » (recherche par ingrédients disponibles)
- Recherche par IA / langage naturel
- Recherche de recettes par ingrédient
- Multi-utilisateurs, gestion de comptes internes
- Système de notation externe, communauté, réseau social

---

## 3. Personas & user stories

### 3.1 Persona principal — utilisateur unique

| | |
|---|---|
| **Profil** | Pâtissier en BTM 2ᵉ année |
| **Contexte** | Jeune professionnel, environnement d'apprentissage et de production |
| **Niveau tech** | Avancé — auto-héberge sur Proxmox, maîtrise Cloudflare ZT, utilise un écosystème d'outils personnels |
| **Appareils** | Ordinateur (gestion, édition), iPad (cuisine), smartphone (courses, consultation rapide) |
| **Besoins clés** | Précision au gramme · Sous-recettes · Impression PDF propre · Fiabilité du stockage · Intégration avec super-nono.cc |
| **Frustrations** | Recipe Keeper inadapté pâtisserie pro · Recettes éparpillées · Pas de logique masse totale · Impression peu personnalisable |

### 3.2 User stories

| ID | Titre | Description |
|---|---|---|
| **US-01** | Création d'une recette simple | En tant que pâtissier, je veux créer une nouvelle recette en saisissant son nom, ses ingrédients en grammes, et ses étapes dans un bloc de texte libre, afin de constituer rapidement ma bibliothèque. |
| **US-02** | Multiplication par ingrédient pivot | En tant que pâtissier, je veux pouvoir partir de ma pâte sucrée (300 g de farine) et saisir « 500 g de farine » pour obtenir toutes les autres quantités recalculées, afin d'adapter instantanément mes recettes. |
| **US-03** | Composition d'un entremets avec sous-recettes | En tant que pâtissier, je veux créer une recette « Entremets framboise » qui intègre ma « Mousse framboise » en spécifiant « Je veux 450 g de mousse », afin de composer des recettes complexes sans ressaisir les recettes de base. |
| **US-04** | Affichage accordéon des sous-recettes | En tant que pâtissier, je veux que chaque sous-recette s'affiche fermée par défaut et se déploie au clic, afin de garder la fiche principale lisible. |
| **US-05** | Multiplication en cascade d'un entremets | En tant que pâtissier, je veux pouvoir appliquer un coefficient × 2 sur mon entremets et voir toutes les sous-recettes (biscuit, mousse, glaçage) se multiplier automatiquement, afin de produire 2 entremets sans refaire les calculs. |
| **US-06** | Verrouillage d'une sous-recette | En tant que pâtissier, je veux pouvoir verrouiller 🔒 une sous-recette individuellement, afin qu'elle reste à sa masse fixe même si je multiplie la recette principale (ex : un glaçage toujours à 150g). |
| **US-07** | Génération d'un cahier PDF | En tant que pâtissier, je veux créer un cahier « Bases », y ajouter mes recettes depuis chaque fiche, puis configurer le cahier (format, template, sommaire, page de garde), afin de générer un PDF imprimable de qualité. |
| **US-08** | Ajout recette liée vs figée | En tant que pâtissier, je veux choisir au moment de l'ajout au cahier si la recette est liée dynamique 🔗 (mise à jour auto) ou figée 📌 (snapshot), afin de contrôler la traçabilité de mes éditions. |
| **US-09** | Ajout entremets en recettes séparées | En tant que pâtissier, je veux pouvoir ajouter un entremets dans un cahier en choisissant « Recettes séparées », afin que la recette principale et toutes ses sous-recettes apparaissent comme fiches distinctes dans le PDF. |
| **US-10** | Liste de courses générée | En tant que pâtissier, je veux sélectionner plusieurs recettes avec des coefficients différents et générer automatiquement une liste de courses fusionnée, afin de préparer mes achats en un geste. |
| **US-11** | Partage d'une recette | En tant que pâtissier, je veux générer un lien public vers une recette permettant à un tiers de la télécharger en PDF. |
| **US-12** | Variantes d'une recette | En tant que pâtissier, je veux créer plusieurs variantes d'une même recette (v1, v2, v3), afin de comparer mes essais sans perdre l'historique. |

---

## 4. Spécifications fonctionnelles

### 4.1 Écran d'accueil

Page d'entrée de l'application. Présente la bibliothèque de recettes et les points d'accès aux fonctionnalités principales.

#### Structure

- **Header sticky** : logo « recipelog » à gauche, compteur recettes à droite en accent jaune
- **Navigation (onglets)** scrollable horizontalement : `Recettes` · `Favoris` · `Cahiers` · `Listes de courses` · `Ingrédients` (si mode B) · `Paramètres`
- **Barre de recherche** plein largeur avec icône loupe
- **Filtres rapides** : chips horizontaux scrollables (tags + catégories)
- **Liste de recettes** : grille responsive (1 col mobile, 2 tablette, 3 desktop). Chaque carte : photo, nom, tags colorés, masse totale, note étoiles, favori
- **Bouton FAB violet (+)** en bas à droite pour créer une nouvelle recette

#### Comportement

- Au chargement : toutes les recettes, triées par date de modification décroissante
- Clic sur une carte → ouverture de la fiche recette
- Clic sur le FAB + → modal de création de recette
- Recherche : filtrage en temps réel (debounce 300ms) sur nom uniquement
- Filtres combinables (ET logique). Clic sur un chip actif le désactive
- État vide : message centré en muted + CTA jaune « Créer ma première recette »

### 4.2 Fiche recette

Écran central de l'application. Affiche toutes les informations d'une recette et permet les actions principales : édition, multiplication, impression, partage, ajout au cahier, création de sous-recette.

#### En-tête de la fiche

- Photo principale en grand (ou placeholder sombre si absente)
- **Titre** en DM Serif Display (grande taille, couleur `--text`)
- Ligne de tags colorés sous le titre (couleurs sémantiques)
- **Masse totale** affichée en gros (stat-card) en jaune
- **Note personnelle** (étoiles cliquables) + icône favori
- **Menu 3 points** en haut à droite

#### Actions du menu 3 points

- Éditer la recette
- Dupliquer
- Créer une variante
- **Ajouter une sous-recette**
- **Ajouter au cahier...** (ouvre modal de sélection)
- **Imprimer / Télécharger PDF**
- **Partager** (génère lien public)
- Ajouter à une liste de courses
- Supprimer (confirmation requise)

#### Zone multiplication

Bloc dédié sous l'en-tête, en carte. Switch entre 3 modes via sélecteur pill/segmented :

- **Coefficient** : input numérique (décimal), applique directement
- **Masse totale** : input en grammes, calcule le coefficient correspondant
- **Ingrédient pivot** : sélecteur d'ingrédient + input en grammes

Le recalcul est **instantané** : toutes les quantités et la masse totale sont mises à jour visuellement sans recharger la page. Un bouton **Réinitialiser** permet de revenir à la recette d'origine.

#### Zone ingrédients

Liste des ingrédients avec, pour chaque ligne : quantité (alignée à droite), unité (`g`), nom. Présentation tableau avec lignes alternées subtiles. Masse totale affichée en bas en jaune.

> **Mode de saisie — Toggle**
> Un toggle dans les paramètres permet de choisir le mode de saisie :
> - **Mode A (libre)** : ingrédient saisi en texte libre
> - **Mode B (base)** : sélection depuis une base réutilisable
>
> Le toggle est global à l'application, pas par recette.

#### Zone étapes

**Un seul bloc de texte libre** affiché tel quel, avec préservation des sauts de ligne. Pas de formatage riche en V1. L'utilisateur peut y écrire tout ce qu'il souhaite : étapes, temps de cuisson, températures, matériel, conservation.

#### Zone sous-recettes

Affichée si la recette contient au moins une sous-recette. Chaque sous-recette est un **accordéon fermé par défaut** :

- Fermé : nom de la sous-partie + nom de la recette liée + masse cible + flèche `›`
- Ouvert : flèche `⌄` + affichage complet (ingrédients recalculés + étapes)
- Lien cliquable (icône lien) en haut de chaque accordéon → fiche complète

#### Zone métadonnées

- Source (livre, site, chef...)
- Notes / astuces personnelles (bloc texte libre séparé)
- Commentaires datés (journal des essais) — ajout, édition, suppression
- Catégorie(s) assignée(s)
- Date de création, date de dernière modification (en muted)

### 4.3 Création / édition d'une recette

Formulaire affiché dans une **modal iOS-sheet** (ouverture depuis le bas sur mobile, centrée sur desktop). Champs dans cet ordre :

| Champ | Description |
|---|---|
| **Photo principale** | Upload optionnel, drag & drop ou bouton |
| **Nom** | Texte, obligatoire |
| **Catégories** | Multi-sélection depuis la base (créable à la volée) |
| **Tags** | Saisie libre avec autocomplétion, séparés par virgule ou Entrée |
| **Ingrédients** | Liste dynamique, ajout/suppression, réordonnancement. Texte libre (mode A) ou sélection base (mode B) |
| **Étapes** | Textarea plein écran, hauteur extensible |
| **Source** | Texte libre optionnel |
| **Notes / astuces** | Textarea optionnelle |

#### Validation

- Nom obligatoire, 1 caractère minimum, 200 max
- Au moins 1 ingrédient obligatoire
- Étapes non obligatoires mais recommandées
- Sauvegarde : bouton primaire jaune « Enregistrer » en bas
- Annulation : lien secondaire muted, avec confirmation si modifications

### 4.4 Sous-recettes — comportement détaillé

Les sous-recettes permettent de composer une recette complexe (ex : entremets) à partir de recettes existantes qui restent autonomes.

#### 4.4.1 Ajout d'une sous-recette

Modal dédiée, accessible depuis le menu 3 points d'une recette.

| Champ | Description |
|---|---|
| **Nom de la sous-partie** | Texte libre (ex : « Mousse », « Biscuit », « Glaçage ») |
| **Recette source** | Dropdown avec recherche, listant toutes les recettes existantes |
| **Mode de calcul initial** | Segmented : Coefficient · Masse totale cible · Ingrédient pivot |
| **Valeur** | Input numérique selon le mode choisi |

> **Référence vs copie**
> Une sous-recette n'est pas une copie figée : elle référence la recette source. Si la recette source est modifiée, les sous-recettes qui y font référence sont automatiquement mises à jour (avec recalcul selon le mode de calcul stocké).

#### 4.4.2 Propagation du coefficient global

Lorsqu'un coefficient est appliqué sur la **recette principale**, il se propage **automatiquement** à toutes les sous-recettes non verrouillées.

> **Exemple — Entremets × 2**
>
> Entremets framboise × 1 : Biscuit 200g · Mousse 600g · Glaçage 150g · **Total 950g**
>
> Application d'un coefficient × 2 sur la recette principale :
> → Biscuit 400g · Mousse 1200g · Glaçage 300g · **Total 1900g**
>
> Le recalcul est instantané et cascade à tous les niveaux (sous-recette d'une sous-recette si applicable).

#### 4.4.3 Modification indépendante d'une sous-recette

Chaque accordéon de sous-recette contient une **icône éditer** permettant d'ajuster la sous-recette individuellement :

- Clic sur l'icône → modal dédiée à la sous-recette
- Choix du mode : Coefficient · Masse totale cible · Ingrédient pivot
- La nouvelle valeur s'applique uniquement à cette sous-recette
- Bouton « Réinitialiser » pour revenir à la valeur par défaut (liée au coef global)

#### 4.4.4 Verrouillage 🔒 d'une sous-recette

Chaque accordéon de sous-recette affiche une **icône cadenas** dans son en-tête. Deux états possibles :

| État | Comportement | Visuel |
|---|---|---|
| **🔓 Déverrouillé (défaut)** | La sous-recette suit le coefficient global de la recette principale (multiplication automatique) | Cadenas ouvert en `--muted` |
| **🔒 Verrouillé** | La sous-recette reste figée à sa masse absolue, indépendamment du coefficient global | Cadenas fermé en `--pending` (violet) |

> **Exemple — Mousse verrouillée**
>
> Entremets × 1 : Biscuit 200g · Mousse 600g 🔒 · Glaçage 150g · **Total 950g**
>
> Application d'un coefficient × 2 sur la recette principale :
> → Biscuit 400g · Mousse 600g 🔒 (figée) · Glaçage 300g · **Total 1300g**

### 4.5 Cahiers de recettes

#### 4.5.1 Création d'un cahier

- Onglet **Cahiers** → FAB violet « + » pour créer un cahier vide
- Formulaire : nom, description optionnelle, format par défaut (A4/A5)
- Le cahier est créé vide, prêt à recevoir des recettes

#### 4.5.2 Ajout d'une recette à un cahier

Depuis la fiche recette : menu 3 points → « Ajouter au cahier... » → modal listant tous les cahiers existants avec recherche. La modal propose également **2 choix à faire au moment de l'ajout**.

##### Choix 1 — Mode de liaison

| Mode | Comportement | Indicateur |
|---|---|---|
| **🔗 Liée dynamique** | La recette dans le cahier est liée à la source. Toute modification de la recette se répercute automatiquement lors de la régénération du PDF. | Icône 🔗 en `--accent` (jaune) |
| **📌 Figée (snapshot)** | Au moment de l'ajout, une copie figée de la recette est enregistrée dans le cahier. Les modifications ultérieures de la recette source n'affectent pas le cahier. | Icône 📌 en `--pending` (violet) + date |

**Actions post-ajout** depuis la page du cahier :

- Sur une recette liée 🔗 : bouton « Figer à cette date » (bascule en snapshot)
- Sur une recette figée 📌 : bouton « Mettre à jour » (recrée un snapshot depuis la version actuelle) ou « Reconvertir en liée »
- Bouton « Retirer du cahier » (disponible sur les deux modes)

##### Choix 2 — Intégration des sous-recettes

Si la recette ajoutée contient des sous-recettes, la modal demande également comment elles doivent être intégrées au cahier :

| Mode | Comportement |
|---|---|
| **📄 Fiche unique** | Seule la recette principale est ajoutée comme fiche au cahier. Les sous-recettes sont affichées **intégrées dépliées** dans la fiche du PDF, avec leurs ingrédients recalculés visibles. Idéal pour un cahier type « Mes entremets ». |
| **📚 Recettes séparées** | La recette principale et chaque sous-recette deviennent des fiches distinctes dans le cahier (1 entremets avec 3 sous-recettes = 4 fiches). Un encadré visuel en haut de chaque sous-recette indique « Fait partie de : [Nom recette principale] ». Idéal pour un cahier type « Bases pro ». |

> **Gestion des doublons**
> Si le mode « 📚 Recettes séparées » est choisi et qu'une des sous-recettes est déjà présente dans le cahier, une confirmation est demandée : « Ignorer (pas de doublon) » ou « Ajouter quand même ».

> **Combinaison des 2 choix**
> Les deux choix se combinent librement. Exemple : ajouter un entremets en mode « 🔗 Liée dynamique » + « 📚 Recettes séparées » signifie que chaque recette (principale + sous-recettes) est ajoutée comme fiche distincte, et chacune reflétera automatiquement ses modifications futures.

#### 4.5.3 Paramètres d'un cahier

- Réordonnancement des recettes par drag & drop
- Choix du **format papier** (A4 ou A5)
- Choix du **template** parmi 3-4 mises en page
- **Sommaire** on/off
- **Page de garde** on/off, personnalisable : texte, police, taille, couleur, style
- **Logo** on/off (si logo configuré dans paramètres globaux)
- **Numérotation** on/off, position configurable
- **Pied de page** personnalisable
- Indicateurs visuels 🔗/📌 sur chaque recette du cahier (visibles dans l'app, pas dans le PDF final)
- Génération et téléchargement du PDF final
- Partage du cahier via lien public (téléchargement anonyme)

> **Templates PDF**
> Les templates V1 doivent couvrir : un style classique éditorial, un style moderne minimaliste, un style fiche technique dense, et un style magazine (photo pleine page). L'ajout d'un 4ᵉ ou 5ᵉ template en V2 doit être prévu dans l'architecture.

### 4.6 Listes de courses

- Onglet **Listes de courses** avec les listes existantes
- Création d'une liste : nom, type (« Recettes » ou « Libre »)
- **Type Recettes** : sélection multiple de recettes avec coefficient par recette, génération auto des ingrédients fusionnés
- **Type Libre** : ajout manuel d'articles
- Les 2 types peuvent coexister dans une même liste
- Fusion auto : si 2 recettes utilisent « beurre », une seule ligne avec la somme
- Cases à cocher : item coché = barré en muted, repositionné en bas de liste
- Bouton « Vider les cochés » pour nettoyer la liste
- Export PDF (mise en page simple : titre + lignes avec cases imprimables)

### 4.7 Partage public

Toute recette ou cahier peut être partagé via un lien public non indexé. Le visiteur accède à une vue minimaliste en lecture seule, avec possibilité de télécharger le PDF. Aucune auth côté visiteur.

- Génération d'un token unique (UUID court) à la demande
- URL publique : `recipe.super-nono.cc/p/{token}`
- Le token peut être révoqué à tout moment
- Vue publique : design identique, lecture seule, menu 3 points limité à « Télécharger PDF »
- Pas d'indexation moteurs (balise `noindex`, blocage via `robots.txt`)

---

## 5. Design system

> **Principe absolu**
> RecipeLog reprend **intégralement** le design system FuelLog. Aucune déviation. Les règles, couleurs, typographie, espacements, composants et animations définis pour FuelLog doivent être appliqués à l'identique. Ce chapitre rappelle l'essentiel ; **le document de référence FuelLog fait foi**.

### 5.1 Fondamentaux

| Principe | Description |
|---|---|
| **Dark only** | Fond toujours sombre `#0e0f11`. Aucun mode clair. |
| **Monospace first** | DM Mono sur toute l'UI. DM Serif Display pour titres et valeurs. |
| **Couleur = sens** | Jaune = action · Vert = succès · Orange = attention · Violet = V2 · Rouge = danger |
| **Pas de dégradé** | Aplats de couleur uniquement. Pas de gradient. |
| **Arrondi modéré** | 8px éléments, 12px cartes, 20px FAB et modals |
| **Bordures fines** | 1px solid `#2a2d35`. Jamais plus épais sauf focus (accent) |

### 5.2 Palette de couleurs

```css
:root {
  /* Fonds */
  --bg:       #0e0f11;  /* Fond général de la page */
  --surface:  #16181c;  /* Header, barre de navigation */
  --card:     #1c1f25;  /* Cartes, modals, panneaux */
  --border:   #2a2d35;  /* Toutes les bordures, séparateurs */

  /* Accents sémantiques */
  --accent:   #e8c547;  /* Jaune — action principale */
  --accent2:  #4fc3a1;  /* Vert — succès, positif */
  --accent3:  #e87c47;  /* Orange — attention */
  --pending:  #a78bfa;  /* Violet — en attente, V2, FAB */
  --danger:   #e85c47;  /* Rouge — erreur, suppression */

  /* Texte */
  --text:     #f0ede6;  /* Texte principal */
  --muted:    #6b6f7a;  /* Texte secondaire, labels */
}
```

### 5.3 Typographie

**Import Google Fonts** (obligatoire dans chaque page HTML) :

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap">
```

| Élément | Police | Taille | Graisse | Couleur |
|---|---|---|---|---|
| Logo « recipelog » | DM Serif Display | 1.5rem | 400 | accent + text |
| Titre H1 | DM Serif Display | 1.1–1.3rem | 400 | accent |
| Valeur numérique | DM Serif Display | 1.55–2rem | 400 | variable |
| Navigation | DM Mono UPPERCASE | 0.68–0.75rem | 400 | muted → accent |
| Label formulaire | DM Mono UPPERCASE | 0.63–0.68rem | 400 | muted |
| Corps de texte | DM Mono | 0.8–0.88rem | 400 | text |
| Texte secondaire | DM Mono | 0.68–0.72rem | 400 | muted |
| Bouton primaire | DM Mono | 0.73–0.78rem | 700 | `#0e0f11` / bg accent |
| Tag / badge | DM Mono UPPERCASE | 0.58–0.65rem | 400 | selon sémantique |

#### Règles importantes

- Labels de formulaire : toujours UPPERCASE, letter-spacing `0.07em`
- Navigation : toujours UPPERCASE, letter-spacing `0.06–0.08em`
- Valeurs numériques importantes : DM Serif Display pour contraster
- Jamais de font-size inférieur à `0.55rem` (9px)

### 5.4 Composants UI

#### Header

Fond `--surface`, sticky, hauteur 60–70px, séparé par 1px `--border`. Logo « recipe*log* » à gauche (DM Serif, jaune + italique text). Safe-area iPhone :

```css
padding-top: calc(1rem + env(safe-area-inset-top));
```

#### Navigation (onglets)

Fond `--surface`, sticky sous le header. Scrollable horizontalement sur mobile (scrollbar masquée). Onglet inactif : muted. Onglet actif : accent + border-bottom 2px accent. Texte UPPERCASE 0.68rem, letter-spacing 0.06em.

#### Bouton FAB (+)

```css
position: fixed;
bottom: calc(1.5rem + env(safe-area-inset-bottom));
right: 1.2rem;
width: 64px;
height: 64px;
background: var(--pending);  /* violet */
border-radius: 20px;
font-size: 2rem;
z-index: 400;
box-shadow: 0 4px 16px rgba(167, 139, 250, 0.35);
```

#### Cartes

```css
background: var(--card);
border: 1px solid var(--border);
border-radius: 12px;
padding: 1.3rem;
margin-bottom: 1.2rem;
```

Titre : DM Serif 1.1rem accent.

#### Boutons

| Type | Background | Texte | Bordure |
|---|---|---|---|
| **Primaire (CTA)** | `--accent` (jaune) | `#0e0f11` (noir) | aucune |
| **Secondaire** | aucun | `--muted` | 1px `--border` |
| **V2 (violet)** | `rgba(167, 139, 250, 0.15)` | `--pending` | 1px `rgba(pending, 0.3)` |
| **Danger** | `rgba(232, 92, 71, 0.08)` | `--danger` | 1px `rgba(danger, 0.2)` |
| **Édition** | `rgba(232, 197, 71, 0.10)` | `--accent` | 1px `rgba(accent, 0.2)` |

#### Modals (style iOS sheet)

- Overlay : `rgba(0, 0, 0, 0.8)` + `backdrop-filter: blur(6px)`, z-index 500
- Contenu : ouvre depuis le bas (`align-items: flex-end`), background `--card`, border-radius `20px 20px 0 0`, max-height `90vh`, overflow-y auto
- Poignée : 32×4px `--border`, border-radius 2px, centrée en haut
- Desktop > 600px : centré, border-radius 16px sur tous coins

#### Champs de formulaire

- Background : `--bg` (pas `--card`)
- Border : 1px `--border`
- Border-radius : 8px
- Font : DM Mono 0.85rem
- Padding : 0.6rem 0.85rem
- Focus : border-color → `--accent`
- Label : DM Mono 0.63rem UPPERCASE muted, letter-spacing 0.07em

### 5.5 Checklist développeur (à valider avant livraison)

- [ ] Fond de page toujours `#0e0f11` — jamais blanc ou gris clair
- [ ] Polices Google Fonts chargées (DM Serif Display + DM Mono)
- [ ] Aucun gradient, aucun box-shadow décoratif, aucune texture
- [ ] Navigation en UPPERCASE + letter-spacing sur DM Mono
- [ ] Labels de formulaire en UPPERCASE + letter-spacing
- [ ] Bouton primaire : fond jaune `#e8c547`, texte noir, font-weight 700
- [ ] FAB violet `#a78bfa`, border-radius 20px, 64×64px, fixed en bas à droite
- [ ] Safe areas iPhone configurées (`env(safe-area-inset-*)`)
- [ ] Modals s'ouvrent depuis le bas avec poignée
- [ ] Tags catégorie colorés selon palette sémantique
- [ ] `overflow-x: hidden` sur html et body
- [ ] Toast centré en bas, fond jaune (erreur = rouge), disparaît après 2.5s

---

## 6. Architecture technique

### 6.1 Choix libre du développeur

La stack technique est laissée au libre choix du développeur, sous réserve de respecter les contraintes listées ci-dessous. Les recommandations sont indicatives, pas prescriptives.

#### Contraintes non négociables

- Base de données : **PostgreSQL 15+**
- Hébergement : conteneur **LXC Proxmox** (*pas de Docker*)
- Authentification : via **Cloudflare Zero Trust uniquement**. Aucun login interne en V1
- Langue : interface en **français** uniquement
- Génération PDF côté serveur (nécessaire pour les cahiers)
- Codebase maintenable en solo, avec documentation d'installation

#### Recommandations techniques

À titre indicatif, un stack pertinent pour ce projet pourrait être :

| Couche | Techno suggérée | Commentaire |
|---|---|---|
| **Backend** | Node.js (Fastify/Express) ou Python (FastAPI) | API REST classique, stable |
| **Frontend** | SvelteKit, Nuxt ou Next.js | SSR + hydration pour performance |
| **Base** | PostgreSQL 15+ | Robuste, typage fort, jsonb pour flexibilité |
| **ORM** | Prisma, Drizzle, SQLAlchemy | Au choix selon backend |
| **PDF** | Puppeteer + Handlebars/Pug OU wkhtmltopdf | HTML → PDF pour templates riches |
| **OS conteneur** | Debian 12 ou Ubuntu 22.04 | Stable, LTS |
| **Reverse proxy** | Caddy ou Nginx | En amont du conteneur |

### 6.2 Déploiement LXC Proxmox

Le commanditaire utilise Proxmox. Le déploiement doit se faire dans un **conteneur LXC** (pas Docker), via des scripts inspirés des *Proxmox Helper Scripts* (style tteck / community-scripts).

#### Livrables scripts

- **Script de création du conteneur LXC** (création, réseau, ressources, OS)
- **Script d'installation de l'application** (dépendances, clone repo, config, init BDD, systemd service, reverse proxy)
- **Script de mise à jour** (git pull, migration BDD, restart service)
- **Script de backup manuel** (dump BDD + fichiers uploadés)
- Documentation en **Markdown** : pré-requis, étapes, troubleshooting

#### Structure attendue du dépôt

```
recipelog/
├── README.md
├── LICENSE
├── .env.example
├── scripts/
│   ├── proxmox-lxc-create.sh      # Crée le LXC
│   ├── install.sh                  # Installe l'app dans le LXC
│   ├── update.sh                   # Met à jour l'app
│   └── backup.sh                   # Dump BDD + uploads
├── backend/
│   ├── src/
│   ├── migrations/
│   └── package.json (ou requirements.txt)
├── frontend/
│   ├── src/
│   └── package.json
├── templates/                      # Templates PDF (3 à 4 en V1)
│   ├── classique/
│   ├── moderne/
│   ├── fiche-technique/
│   └── magazine/
└── docs/
    ├── INSTALL.md
    ├── UPDATE.md
    ├── BACKUP.md
    └── API.md
```

### 6.3 Sécurité & accès

- L'application est accessible uniquement via **Cloudflare Zero Trust**
- Le conteneur LXC n'est pas exposé publiquement — un tunnel Cloudflare est utilisé
- Aucun login/mot de passe interne en V1 : la sécurité est déléguée à Cloudflare
- Le **partage public de recettes/cahiers** fonctionne via des tokens UUID non devinables, sur un sous-chemin distinct (`/p/{token}`) exempt de l'auth ZT
- HTTPS obligatoire (géré par Cloudflare)
- Headers de sécurité : CSP, X-Frame-Options, noindex sur pages publiques
- Aucune donnée personnelle sensible stockée (pas de coordonnées, pas d'auth)
- Protection CSRF sur toutes les mutations côté backend

### 6.4 Backups

> **À définir ultérieurement**
> La stratégie de backups sera précisée après la V1. Le livrable V1 doit inclure un **script de backup manuel** (dump BDD + fichiers uploadés) et documenter son exécution. L'automatisation (cron, rotation, externalisation) sera définie dans un second temps.

### 6.5 Performance & robustesse

- Temps de réponse cible : **< 200 ms** pour les requêtes simples (liste, fiche)
- Temps de génération PDF : **< 3 s** pour une fiche, **< 15 s** pour un cahier de 30 recettes
- Gestion d'erreurs propre côté frontend (toasts d'erreur, pas de page blanche)
- Logs applicatifs en JSON, persistés dans `/var/log/recipelog/`
- Healthcheck endpoint : `GET /api/health` retourne 200 si OK
- Migrations BDD versionnées et rejouables
- Uploads fichiers : limite 10 Mo par image, validation côté serveur

---

## 7. Modèle de données

Schéma de principe pour PostgreSQL. Le développeur est libre d'adapter (nommage, types exacts), mais les **entités et relations** doivent être respectées.

### 7.1 Entités principales

> **Source de vérité** : `prisma/schema.prisma` — ce tableau est descriptif, le schéma Prisma fait foi.

| Table | Description |
|---|---|
| **`recipes`** | Recette principale — name, photo_path, source, notes_tips, favorite, rating, **folder_id** (FK nullable, ON DELETE SET NULL), created_at, updated_at |
| **`folders`** 🆕 | Dossier de rangement — name (unique), color, icon. Une recette = 0 ou 1 dossier max. |
| **`ingredients`** | Ingrédient d'une recette — name (si mode A), ingredient_base_id (si mode B), quantity_g, position, recipe_id |
| **`ingredients_base`** | Base réutilisable — name, default_unit, created_at |
| **`steps_block`** | Bloc HTML riche des étapes (sortie Tiptap) — content (text), recipe_id. Stocke `<p>…</p>` avec balises `<strong>`, `<em>`, `<u>` (les autres balises sont sanitizées). |
| **`sub_recipes`** | Référence d'une recette en sous-recette d'une autre — parent_id, child_id, label, calc_mode, calc_value, pivot_ingredient_id, position, **is_locked** (bool, pour verrouillage 🔒) |
| **`variants`** | Variante d'une recette — source_recipe_id, variant_recipe_id, note |
| **`categories`** | Catégorie — name (unique), color, icon |
| **`recipes_categories`** | Table de jointure recettes ↔ catégories (N-N) |
| **`tags`** | Tags libres par recette — name, recipe_id |
| **`comments`** | Commentaires datés — content, created_at, recipe_id |
| **`cookbooks`** | Cahier de recettes — name, description, format (A4/A5), template_id, has_toc, has_cover, cover_config (jsonb : layouts, dégradés, couleurs, polices, alignement footer, etc.), has_logo, page_numbering_config (jsonb), footer (text) |
| **`cookbooks_recipes`** | Jointure cahier ↔ recettes — cookbook_id, recipe_id, position, **link_mode** (linked/snapshot), **snapshot_data** (jsonb), **snapshot_date**, **subrecipe_mode** (conservé pour compat, mais **ignoré au rendu**), **section_title** (titre de section optionnel au-dessus de l'entrée) |
| **`cookbooks_chapters`** 🆕 | Pages chapitre intercalées entre les recettes — cookbook_id, position, title, intro, image_url. Position partagée avec cookbooks_recipes pour un ordre unifié drag-and-drop. |
| **`shopping_lists`** | Liste de courses — name, type (recipes/free/mixed) |
| **`shopping_list_items`** | Item d'une liste — name, quantity_g (nullable), recipe_id (nullable), checked, position |
| **`shopping_list_recipes`** | Recettes liées à une liste avec coefficient |
| **`share_tokens`** | Tokens publics — token, entity_type (recipe/cookbook), entity_id, created_at, revoked_at |
| **`settings`** | Paramètres globaux (clé-valeur jsonb) — `ingredient_mode`, `logo_enabled`, `recipePdfSettings` (réglages du PDF d'une recette) |
| **`pdf_templates`** | Templates PDF disponibles — name, description, slug, preview_path, is_custom |

#### Champs `cookbooks_recipes` retirés ou ignorés

| Champ | État | Raison |
|---|---|---|
| `subrecipe_mode` | **Conservé en BDD, ignoré au rendu** | Le PDF rend systématiquement chaque recette sur sa propre page (le choix « unique / séparées » a été simplifié) |
| `group_with_previous` | **Droppé** (migration `20260506100000_drop_group_with_previous`) | Fonctionnalité « coller à la précédente » abandonnée après itération utilisateur |

### 7.2 Relations principales

- `recipes` **1..N** `ingredients` — une recette a plusieurs ingrédients ordonnés
- `recipes` **1..1** `steps_block` — un bloc de texte des étapes
- `recipes` **1..N** `sub_recipes` — une recette peut avoir plusieurs sous-recettes (relation auto-référentielle via parent_id/child_id)
- `recipes` **N..N** `categories` via `recipes_categories`
- `recipes` **1..N** `comments`
- `cookbooks` **N..N** `recipes` via `cookbooks_recipes` (avec position)
- `shopping_lists` **N..N** `recipes` via `shopping_list_recipes` (avec coefficient)
- `shopping_lists` **1..N** `shopping_list_items`
- `share_tokens` référence via `entity_type` + `entity_id` (polymorphe)

### 7.3 Index recommandés

- `recipes.name` — trigram GIN (pour recherche rapide)
- `recipes.updated_at DESC` — B-tree (tri par modification)
- `recipes.favorite` — partial index (`WHERE favorite = TRUE`)
- `ingredients.recipe_id` — FK index
- `sub_recipes.parent_id` — FK index
- `cookbooks_recipes.cookbook_id` + position — composite
- `share_tokens.token` — unique, hash index
- `tags.name` — btree pour recherche par tag

### 7.4 Note sur le calcul des sous-recettes

> **Calcul dynamique en cascade**
>
> Les sous-recettes ne sont JAMAIS stockées sous forme de quantités pré-calculées. Seul le mode de calcul (coefficient / masse cible / pivot), sa valeur, et l'état de verrouillage (`is_locked`) sont stockés. Le recalcul est effectué à chaque affichage en remontant à la recette source.
>
> **Formule de propagation :**
>
> - Si `is_locked = FALSE` : `quantité_affichée = quantité_base × coef_global × coef_local`
> - Si `is_locked = TRUE` : `quantité_affichée = quantité_base × coef_local` *(ignore coef_global)*
>
> Une modification de la recette source se propage automatiquement à toutes les recettes qui l'utilisent en sous-recette (sauf mode snapshot dans un cahier).

### 7.5 Note sur les snapshots de cahier

> **Mode snapshot**
>
> Lorsqu'une recette est ajoutée à un cahier en mode « 📌 Figée », un snapshot complet de la recette est stocké dans `cookbook_snapshots` (ou `snapshot_data` jsonb dans `cookbooks_recipes`). Ce snapshot inclut : ingrédients, étapes, sous-recettes déjà résolues avec leurs quantités calculées au moment du snapshot.
>
> Ce mécanisme garantit que la version figée est reproductible à l'identique même après plusieurs modifications de la recette source.

---

## 8. Arborescence & navigation

### 8.1 Arborescence des écrans (réelle, telle que livrée)

```
/                                    Vue explorateur (cards dossiers + sans dossier)
├── /?folder=:id                     Vue filtrée d'un dossier
├── /?folder=none                    Vue « Sans dossier »
├── /?view=all                       Liste plate groupée par dossier (« Tout afficher »)
├── /?q=… &tag=… &category=:id       Recherche / filtres
├── /recipes/new[?folder=:id]        Création nouvelle recette
├── /recipes/:id                     Fiche recette détaillée
├── /recipes/:id/edit                Édition
├── /recipes/:id/pdf                 PDF de la recette seule (style défini dans /settings)
├── /favorites                       Vue filtrée des favoris
├── /cookbooks                       Liste des cahiers
├── /cookbooks/new                   Création cahier
├── /cookbooks/:id                   Détail cahier (onglets Recettes / Apparence)
├── /cookbooks/:id/pdf               PDF complet du cahier (2 passes + merge pdf-lib)
├── /api/cookbooks/:id/preview-pdf   Aperçu PDF (POST, theme non-enregistré)
├── /api/cookbooks/:id/entries/:eid/snapshot
│                                    Lecture d'un snapshot (pour modal Modifier la masse)
├── /api/recipes?q=…&onlyNoFolder=1  Autocomplétion pour AddRecipesToFolderModal
├── /shopping                        Listes de courses
│   ├── /shopping/new                Nouvelle liste
│   └── /shopping/:id                Détail / mode courses
├── /settings                        Paramètres globaux (page unique)
├── /share/:token                    Vue publique (hors auth ZT)
├── /api/health                      Healthcheck
└── /api/deploy/log                  Stream des logs de déploiement
```

### 8.2 Parcours utilisateur clés

#### Parcours 1 — Créer une recette

1. Accueil → FAB `+` → Modal « Nouvelle recette »
2. Saisie des champs (nom, catégories, tags, ingrédients, étapes...)
3. Clic « Enregistrer » → toast vert « Recette créée » + redirection vers la fiche

#### Parcours 2 — Composer un entremets

1. Accueil → créer « Entremets framboise » (vide ou avec ingrédients de montage)
2. Fiche de l'entremets → menu 3 points → « Ajouter une sous-recette »
3. Modal : nom « Mousse » + sélection « Mousse framboise » + masse cible 450 g
4. Fiche principale affiche maintenant l'accordéon « Mousse (450 g) »
5. Répéter pour « Biscuit », « Glaçage », etc.

#### Parcours 3 — Générer un cahier PDF

1. Onglet Cahiers → FAB `+` → « Nouveau cahier » (nom, format A4/A5)
2. Retour à la liste des recettes → ouvrir une recette → 3 points → « Ajouter au cahier... »
3. Sélectionner le cahier créé → choisir mode (🔗 Liée / 📌 Figée) + (📄 Unique / 📚 Séparées) → toast « Ajouté »
4. Répéter pour chaque recette à inclure
5. Retour onglet Cahiers → ouvrir le cahier
6. Configurer : template, sommaire, page de garde, logo, numérotation, ordre
7. Clic « Générer PDF » → téléchargement

---

## 9. Livrables & critères d'acceptation

### 9.1 Livrables attendus

| Livrable | Contenu |
|---|---|
| **Code source** | Dépôt Git privé (GitHub/Gitea/GitLab), structure documentée, code commenté aux endroits critiques |
| **Base de données** | Migrations versionnées (numérotées), script de seed pour catégories par défaut et templates PDF |
| **Scripts Proxmox** | Script de création LXC, script d'installation, script de mise à jour, script de backup manuel |
| **Templates PDF** | 3 à 4 templates fonctionnels avec aperçu, documentation pour en ajouter d'autres |
| **Documentation** | `INSTALL.md` · `UPDATE.md` · `BACKUP.md` · `API.md` (si API exposée) |
| **Import initial** | Script d'import du PDF Recipe Keeper du commanditaire (exécuté à la mise en prod) |
| **Jeu de tests** | Tests fonctionnels sur les flux critiques (création, multiplication, sous-recette, génération PDF) |

### 9.2 Critères d'acceptation

Le projet sera considéré comme livré lorsque **tous** les critères suivants sont remplis :

- [ ] Respect strict du design system FuelLog (checklist section 5.5 validée)
- [ ] Toutes les user stories de la section 3 sont fonctionnelles
- [ ] Les 3 modes de multiplication fonctionnent correctement avec recalcul instantané
- [ ] Les sous-recettes fonctionnent avec recalcul dynamique (pas de stockage figé)
- [ ] La propagation en cascade du coefficient global fonctionne
- [ ] Le verrouillage 🔒 individuel des sous-recettes est opérationnel
- [ ] L'ajout au cahier propose bien les 2 choix (liaison + intégration sous-recettes)
- [ ] Les cahiers PDF sont générés dans les 4 templates proposés, en A4 et A5
- [ ] Le partage public fonctionne et est exempt de l'auth Zero Trust
- [ ] Le script de déploiement Proxmox LXC fonctionne de bout en bout sur un LXC vide
- [ ] L'import initial du PDF Recipe Keeper du commanditaire est effectué avec succès
- [ ] Toute la documentation est rédigée en français et fonctionnelle
- [ ] L'application est accessible sur `recipe.super-nono.cc` via Cloudflare Zero Trust
- [ ] Aucune régression visible sur mobile, tablette ou desktop (responsive)
- [ ] Temps de génération PDF conformes à la section 6.5

---

## 10. Planning et avancement

### 10.1 Phases du projet (V1.1 → V1.2)

| Phase | Contenu | État |
|---|---|---|
| **1. Cadrage & setup** | Validation CDC, setup du dépôt, choix stack (Next.js 15 + Prisma 6), bootstrap projet, configuration LXC de dev | ✅ Livré |
| **2. Socle & recettes** | Modèle de données complet, CRUD recettes, design system FuelLog intégré | ✅ Livré |
| **3. Multiplication & sous-recettes** | 3 modes de calcul, recalcul dynamique, sous-recettes en accordéon, propagation cascade, verrouillage 🔒 | ✅ Livré |
| **4. Cahiers & PDF** | Création cahiers, templates PDF, génération via Puppeteer, drag & drop, page de garde, modes liée/figée | ✅ Livré |
| **5. Liste de courses** | CRUD listes, génération auto depuis recettes, fusion, cases à cocher | ✅ Livré |
| **6. Partage public & paramètres** | Tokens publics, vue lecture seule, paramètres globaux | ✅ Livré |
| **7. Scripts Proxmox** | Scripts LXC (create-lxc, setup, deploy, backup, collect-logs) + bouton « Mettre à jour le site » | ✅ Livré |
| **8. Tests & import** | 50 tests Vitest, import Recipe Keeper CSV + HTML/ZIP avec photos | ✅ Livré |
| **9. Mise en production** | Déploiement sur `recipe.super-nono.cc` via Cloudflare Zero Trust | ✅ Livré |
| **10. Itérations V1.2** | Dossiers, vue explorateur, combobox catégories, refonte PDF (1 page par recette, numérotation logique, sommaire avec sous-recettes), réglages PDF d'une recette, « Mettre à jour la recette », fix éditeur Tiptap, etc. | ✅ Livré |
| **11. Correctifs + fonctionnalités V1.3** | Fix recherche globale · FolderManager/CategoryManager responsive mobile · FolderCard réduite · Paramètres allégés (sous-pages dossiers/catégories/ingrédients) · Autocomplétion ingrédients (IngredientBase activée) · Logo lien externe paramétrable | ✅ Livré |
| **12. Fonctionnalités V1.4** | Quantités en fourchette (mode « entre » min/max sur toutes les unités) · Gestion avancée ingrédients (renommage cascade, fusion, page détail, sync automatique, badge compteur) · Import JSON amélioré (normalisation unités mL/cl/dl/kg, dedup insensible à la casse) · Fix autocomplétion mobile (touchstart) · Timeout overlay déploiement 12 min | ✅ Livré |
| **13. V1.5 → V1.6** | Toggle décimales/arrondi · Navigation pill Apple-style · Masse cible exacte en affichage · Batch upsert ingrédients · Index GIN trigram · Refonte page ingrédients · Fix ModeSwitcher mobile · Suppression page Nouveautés | ✅ Livré |

### 10.2 Évolutions à venir (priorité indicative)

| Priorité | Évolution | Notes |
|---|---|---|
| 🔼 | Logo personnel sur les cahiers | UI prévue, branchement à finaliser |
| 🔼 | Import / Export JSON | Sauvegarde complète des données |
| 🔽 | Coût de revient | Base d'ingrédients avec prix unitaire |
| 🔽 | Liste de courses : groupement par rayon | UX magasin |
| 🔽 | PWA + mode hors-ligne | Cuisine sans réseau |
| 🔽 | Backups externes automatiques (S3/Backblaze) | À cron-ifier sur le LXC |

> **Note** : ce CDC reste un document vivant. Les évolutions V2 listées en §2.2 demeurent valides, à prioriser selon les besoins de l'utilisateur.

---

**Fin du document**

*RecipeLog — Cahier des charges V1.6 — super-nono.cc*

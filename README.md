# RecipeLog

> **Gestion de recettes de pâtisserie : application web auto-hébergée**

Outil personnel conçu pour la pâtisserie professionnelle (BTM). Il comble les manques de Recipe Keeper : précision au gramme, multiplication (3 modes), sous-recettes et cahiers PDF.

**Version actuelle : voir Réglages → Version et nouveautés** · Production : [`recipe.super-nono.cc`](https://recipe.super-nono.cc) (Proxmox LXC + Cloudflare Zero Trust)

> Ce fichier est **la seule documentation du projet**. Il remplace l'ancien cahier des charges (`CDC.md`), le document de transmission (`HANDOFF.md`) et les guides `INSTALL.md` / `DEPLOYMENT.md`.

---

## Sommaire

1. [Mises à jour effectuées](#1-mises-à-jour-effectuées)
2. [Mises à jour proposées](#2-mises-à-jour-proposées)
3. [Problèmes connus restants](#3-problèmes-connus-restants)
4. [Fonctionnalités](#4-fonctionnalités)
5. [Règles de calcul](#5-règles-de-calcul)
6. [Architecture technique](#6-architecture-technique)
7. [Modèle de données](#7-modèle-de-données)
8. [Design system](#8-design-system)
9. [Installation (développement)](#9-installation-développement)
10. [Production (Proxmox LXC)](#10-production-proxmox-lxc)
11. [Historique des versions](#11-historique-des-versions)
12. [Conventions](#12-conventions)

---

## 1. Mises à jour effectuées

### V2.0 (21 octobre 2026) : nouveau design et thèmes PDF personnalisables

**Nouveau design sur tout le site** (sombre, « Encre et ambre »)
- Plus aucun emoji : des icônes partout.
- **Ordinateur** : menu à gauche (recettes, favoris, cahiers, courses, ingrédients, dossiers avec leur nombre de recettes, thèmes PDF, réglages).
- **Téléphone** : barre d'onglets en bas, bouton « + » flottant, fenêtres qui remontent du bas.
- **Installable comme une application** (PWA) : sur téléphone, « Ajouter à l'écran d'accueil » ; sur ordinateur, l'icône d'installation dans la barre d'adresse de Chrome / Edge.
- **Moins de boutons** : les actions d'une recette, d'un dossier, d'un cahier, d'une liste ou d'un thème sont dans un **menu** qui s'ouvre au **clic droit**, avec le **bouton ⋯**, ou par un **appui long** sur téléphone (avec de gros boutons d'actions rapides).
- **Bulles d'aide « ? »** à côté de chaque information : ce que c'est, comment c'est calculé (avec les vrais chiffres de la recette) et un exemple.
- **Recherche globale Ctrl K** (bouton loupe sur téléphone) : recettes, dossiers, ingrédients, cahiers, listes et actions rapides.

**Fiche recette**
- Onglets **Recette / Préparation / Notes et essais**.
- Trois cartes : **masse totale** (sous-recettes comprises, avec le détail), **multiplicateur** (coefficient, masse ou ingrédient pivot, + / −, entiers), **base ×1**.
- Tableau des ingrédients avec **% de la masse** et les **sous-recettes dépliables**. Chaque sous-recette a son menu : ouvrir la recette d'origine, suivre le multiplicateur ou **garder sa quantité** (verrouillée), régler la quantité, **monter / descendre**, retirer.
- « Utilisée comme sous-recette dans… » : les recettes qui contiennent celle-ci.
- Étapes affichées en étapes numérotées.

**Thèmes PDF** (nouvelle page Thèmes PDF)
- Les **7 thèmes fournis** sont prêts à l'emploi et **modifiables** ; « Revenir à l'original » les remet comme au départ.
- **Créer, dupliquer, renommer, supprimer, réordonner** ses propres thèmes ; choisir le thème **par défaut**.
- **Éditeur complet avec aperçu en direct** (le vrai PDF, régénéré pendant la modification, sur la recette de son choix) : modèle, couleurs, polices, taille, papier, décor, informations imprimées, couverture des cahiers.
- **Nouvelles dispositions** : ingrédients **à gauche, à droite ou au-dessus**, largeur de la colonne, **alignement du titre**, titre en majuscules, style des intertitres, **espacement** (serré / normal / aéré), **photo en tête** pour tous les modèles.
- **Télécharger le PDF d'une recette** : la liste des thèmes à gauche, l'**aperçu** de la recette à droite, puis Télécharger. Sur téléphone : la liste, puis l'aperçu en plein écran.
- **Cahiers** : un clic applique un thème enregistré au cahier ; aperçu lisible aussi sur téléphone.
- L'ancien réglage « PDF d'une recette » devient automatiquement le thème **« Mon style »** (thème par défaut).

**Pages refaites** : accueil (tuiles des dossiers, filtres, tableau des recettes, sélection multiple), formulaire de recette (sections, masse en direct, menu par ingrédient, création de catégorie à la volée), cahiers, listes de courses (grosses cases à cocher, articles cochés regroupés en bas, ajout rapide), réglages et ingrédients.

**Recettes importées réparées automatiquement**
- Les quantités importées sur une ligne à part (« Abricots frais » 0 g puis « 800g ») sont recollées au bon ingrédient.
- La ligne de total recopiée comme dernier ingrédient (« 500g ») est retirée : elle doublait la masse.
- Les lignes à 0 g (titres de section comme « Levain ») ne vont plus dans les listes de courses.
- La réparation se fait **toute seule au premier démarrage** après la mise à jour, et les prochains imports Recipe Keeper sont corrigés directement.

**Bugs corrigés**
| # | Avant | Maintenant |
|---|---|---|
| 1 | Ajouter une sous-recette en mode « ingrédient pivot » échouait toujours. | Le choix de l'ingrédient pivot est demandé. |
| 2 | Dupliquer une recette perdait ses sous-recettes. | Elles sont copiées avec leurs réglages. |
| 3 | Modifier une recette faisait disparaître ses fourchettes (« 72–84 g »). | Conservées. |
| 4 | La saisie en lot mettait tout en grammes (« 3 oeufs » = 3 g, « 250 ml lait » = 0,25 g). | Unités et fourchettes reconnues conservées. |
| 5 | « Ranger des recettes ici » ignorait le texte recherché. | Recherche prise en compte. |
| 6 | Cahier : numéro de ligne identique partout, masse des recettes liées absente. | Corrigé. |
| 7 | L'option « numéros de page » du PDF n'avait aucun effet. | Respectée (cahiers et recettes de plusieurs pages). |

**Après la mise à jour** : rien à faire. La table des thèmes est créée par la migration, les 7 thèmes et « Mon style » apparaissent à la première ouverture, et la réparation des ingrédients se fait au démarrage.

### V1.9 (20 octobre 2026) : PDF plus rapides et plus beaux, mise à jour du site fiabilisée

**PDF beaucoup plus rapides**

| | Avant | Maintenant |
|---|---|---|
| Cahier de 20 recettes | ~7 s | **~1 s** (0,7 s si un PDF vient d'être fait) |
| Avec une police Google (Playfair, Lora…) | 9 à 11 s | **~1 s** |

Pourquoi c'était lent, et ce qui a changé :
- **Chromium** était lancé à chaque PDF (deux fois pour un cahier). Il est maintenant gardé ouvert, puis fermé automatiquement après 3 minutes sans PDF pour libérer la mémoire.
- **Une attente fixe de 500 ms** (« réseau inactif ») avait lieu à chaque passe, même sans rien à charger. On attend maintenant seulement ce qui compte : les polices et les images.
- **Les polices Google** étaient retéléchargées à chaque PDF. Elles sont maintenant gardées en mémoire et intégrées directement.
- Les recettes liées d'un cahier sont calculées en parallèle.

**Nouveaux styles de PDF** (onglet Apparence du cahier, et Paramètres → PDF d'une recette)
- **7 styles prêts à l'emploi**, en un clic (mise en page, habillage, couleurs, polices et couverture assortie) :
  - **Pâtissier classique** ;
  - **Élégant** : papier crème, double filet, Garamond, touches dorées ;
  - **Carnet de cuisine** : cahier ligné, titres manuscrits, liseré ;
  - **Pastel gourmand** : papier rosé, coins décoratifs, ingrédients encadrés ;
  - **Fiche BTM** ;
  - **Bistrot** : bandeau bordeaux, photo, pointillés ;
  - **Nordique épuré**.
- **Habillage des pages**, réglable un par un :
  - papier : blanc, crème, ivoire, rosé, quadrillé, cahier ligné ;
  - décor : filet, double filet, coins, liseré, bandeau ;
  - titre : simple, souligné, ornement, bandeau coloré ;
  - étapes : numéros ou pastilles ;
  - ingrédients : liste, pointillés (comme un menu), encadré.
- **Couvertures** : 3 nouveaux motifs (pois, rayures, quadrillage).
- **Polices** : 3 nouvelles (Cormorant Garamond, Montserrat, Caveat manuscrite).
- Le papier et le décor couvrent **toute la page**, marges comprises, sur chaque page (y compris quand une recette fait plusieurs pages). La couverture n'est pas touchée.
- Les anciens cahiers gardent exactement leur apparence (tout est « blanc / aucun » par défaut).

**Mise à jour du site fiabilisée** : testée de bout en bout sur une copie du serveur, dans 5 scénarios.
- **Build raté** → le site n'est **pas** touché et continue de tourner (avant, il perdait ses styles et ne redémarrait plus).
- **Nouvelle version qui ne démarre pas** → **retour automatique** à la version précédente.
- **Rien de nouveau** → « Déjà à jour », sans rebuild ni coupure.
- Le site reste utilisable pendant la préparation : la coupure se limite au redémarrage (~10 s).
- L'écran de maintenance affiche maintenant clairement « terminé », « déjà à jour » ou « échec » (avant : attente de 12 minutes sans explication).
- Le script ne peut plus être perturbé par sa propre mise à jour (le « cliquer deux fois » n'est plus nécessaire).

**Divers** : icône d'onglet du site (l'ancienne était introuvable), style actif mis en évidence, 70 tests.

### V1.8 (20 octobre 2026) : sommaire exact et mises en page PDF

| # | Avant | Maintenant |
|---|---|---|
| 1 | **Sommaire des cahiers faux** dès qu'une recette faisait plus d'une page : tous les numéros suivants étaient décalés. | Le sommaire lit la vraie page de chaque recette dans le PDF généré : numéros toujours exacts. |
| 2 | **Les styles « moderne », « fiche technique » et « magazine » n'existaient pas** (tout sortait en « classique », sans moyen de choisir). | Nouveau réglage **« Mise en page des recettes »** (onglet Apparence du cahier, et Paramètres → PDF d'une recette) avec 4 styles, détaillés sous le tableau. |
| 3 | Dans les PDF, une **fourchette ou une cuillère** (« 90 g / 100 g », « 1 cc (≈5 g) ») décalait le nom de l'ingrédient. | Colonne quantité bien alignée. |
| 4 | « 3 pièce ». | « 3 pièces ». |
| 5 | Couleurs des dossiers / catégories acceptées sans contrôle. | Seules les couleurs valides (#abc ou #aabbcc) sont enregistrées. |
| 6 | Détection des boucles de sous-recettes : une requête par niveau. | Une seule requête. |

Les 4 styles :
- **Classique** : ingrédients à gauche, préparation à droite (inchangé).
- **Fiche technique** (style BTM) : cartouche masse totale / nombre d'ingrédients / date, tableau des ingrédients avec le **% de chaque ingrédient dans la masse totale**.
- **Moderne** : une seule colonne, grand titre, ingrédients sur 2 colonnes.
- **Magazine** : photo de la recette en tête de page, encadré ingrédients, lettrine.

Nettoyage : `ModalOverlay` dans son propre fichier, type `ActionResult` commun, conversion des URL de photos regroupée. 65 tests verts.

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
| 10 | **Recette figée** : « Modifier la masse » modifiait aussi les sous-recettes **verrouillées**, avec un arrondi différent. | Les sous-recettes verrouillées ne bougent plus et l'arrondi est identique partout. |
| 11 | **Recherche sans accents** : « creme » ne trouvait pas les recettes importées (CSV/HTML) ou dupliquées. | Toutes les recettes sont trouvées (la migration corrige aussi les recettes existantes). |
| 12 | **Masse totale différente selon l'écran** : la liste ignorait les litres, le formulaire ignorait L et les fourchettes, l'ajout au cahier ne comptait que les grammes. | Un seul calcul (`recipeMass`) utilisé partout. |
| 13 | **Cahier PDF vide** (sans recette ni couverture) : erreur serveur. | Message clair. |
| 14 | **Renommer une catégorie ou un dossier** avec un nom déjà pris : page d'erreur. | Message « existe déjà ». |

**Sécurité et serveur**
- **Partage public désactivé** : le site est entièrement derrière Cloudflare, donc les liens de partage ne fonctionnaient pas pour un tiers. Le bouton « Partager » est masqué et `/share/...` répond « introuvable ». Le code est conservé pour plus tard (voir [Mises à jour proposées](#2-mises-à-jour-proposées)).
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

## 2. Mises à jour proposées

Classées par intérêt. Chaque idée indique les options possibles.

### Partage qui fonctionne vraiment
Aujourd'hui tout le site est protégé par Cloudflare, donc un lien partagé est bloqué. Options :
- **A. Bypass Cloudflare sur `/share/*`** (recommandé, le plus simple) : une règle Cloudflare Access « Bypass » limitée à ce chemin. Ensuite on passe `SHARE_ENABLED = true` dans `src/lib/features.ts`. La protection côté appli est déjà en place.
- **B. Sous-domaine public dédié** (`partage.super-nono.cc`) qui ne sert que `/share/*` : plus cloisonné, un peu plus de configuration.
- **C. Export autonome** : générer le PDF ou une page HTML à envoyer par message, sans lien public.

À ajouter en même temps : bouton « Télécharger le PDF » sur la page partagée, date d'expiration du lien, partage d'une liste de courses.

### Logo personnel sur les cahiers
Option prévue en base mais sans interface. Options : envoi d'un logo dans Paramètres, puis affichage sur la couverture et/ou en pied de page.

### Variantes de recette
Créer « v2, v3 » d'une recette en gardant le lien avec l'original, pour comparer les essais (la table existe déjà en base).

### Export / import JSON complet
Sauvegarde téléchargeable de toutes les données (recettes, dossiers, cahiers, listes), avec restauration. Options : bouton manuel dans Paramètres, et/ou envoi automatique vers un NAS ou S3 (cron).

### Photos
Ajouter / changer la photo depuis le formulaire de recette (aujourd'hui seulement via l'import Recipe Keeper).

### Coût de revient
Prix au kilo dans la base d'ingrédients, puis coût total et par portion sur la fiche et dans le PDF.

### Liste de courses
Groupement par rayon (frais, sec, fruits…) en réutilisant les catégories d'ingrédients (base / fruit / préparation).

### Hors-ligne
Le site s'installe déjà comme une application (V2.0). Prochaine étape : consultation des recettes sans connexion en cuisine (service worker qui garde les dernières recettes ouvertes).

### Application PC
Une vraie application de bureau (fenêtre dédiée, raccourci) est possible en enveloppant le site (Tauri ou Electron), connectée au même serveur via Cloudflare. En attendant, l'installation PWA depuis Chrome / Edge donne déjà une fenêtre séparée.

---

## 3. Problèmes connus restants

- **Variantes de recette** et **logo des cahiers** : prévus en base, pas encore développés (voir propositions).
- **Gros composants** (`IngredientBaseManager`, `CookbookConfigForm`, `CookbookEntriesTable`, `RecipeForm` : 700 à 1 200 lignes) : fonctionnels, à découper si on les fait évoluer.
- **Format des étapes** : les anciennes recettes sont en HTML (ancien éditeur), les nouvelles en texte (1 étape par ligne). Les deux s'affichent correctement ; ouvrir puis enregistrer une ancienne recette la convertit en texte (le gras est perdu).
- **Base d'ingrédients importée** : des noms contiennent encore une quantité (« 1/4 pincée fleur de sel », « 1.5 Échalote(s) ») ; à renommer ou fusionner depuis Réglages, Ingrédients.
- **Titres de section importés** (« Levain », « Pâte » à 0 g) : restent dans la recette comme ingrédients sans quantité (ignorés dans les courses). Il n'existe pas encore de vrais intertitres d'ingrédients.

---

## 4. Fonctionnalités

### Interface
- Thème sombre « Encre et ambre », icônes (aucun emoji), polices Geist / Fraunces.
- **Ordinateur** : menu latéral (sections, dossiers avec compteurs, thèmes PDF, réglages). **Téléphone** : barre d'onglets, bouton « + », feuilles d'actions.
- **Menus d'actions** partout (recette, dossier, sous-recette, cahier, entrée de cahier, liste, article, thème, dossier, catégorie, ingrédient) : clic droit, bouton ⋯ ou appui long.
- **Bulles d'aide « ? »** : explication, calcul et exemple.
- **Recherche Ctrl K** : recettes, dossiers, ingrédients, cahiers, listes, actions.
- **PWA** : installable (manifeste, icônes).

### Recettes
- Création / édition / suppression / duplication (sous-recettes comprises), suppression en lot (sélection multiple).
- Ingrédients : saisie **liste** (autocomplétion, menu par ligne : fourchette, monter, descendre, supprimer) ou **saisie en lot** (`200g farine`, `Farine\n800g`, `1kg sucre`, `2 cc vanille`, `3 oeufs`, `100-150g sucre`, ajout à la suite ou remplacement). Masse totale en direct.
- Unités : `g`, `L`, `cc` (≈ 5 g), `cs` (≈ 15 g), `pièce`, `QS`, et **fourchettes** min/max.
- Étapes : 1 étape par ligne, affichées numérotées.
- Tags libres, catégories colorées (créables depuis le formulaire), note 1–5, favori, source, notes et astuces, journal d'essais daté, photo (via import).
- Rangement dans **un dossier** (0 ou 1), « Déplacer vers » depuis le menu.

### Organisation
- Accueil : tuiles des dossiers, filtres catégorie / tag, recherche par nom, tableau des recettes (vignette, dossier, masse, date, note, favori), page Favoris.

### Multiplication et sous-recettes
- 3 modes : **coefficient** (+ / −), **masse cible**, **ingrédient pivot** ; décimales ou entiers (arrondi au supérieur, masse cible exacte).
- « Enregistrer comme base » : écrit les quantités affichées comme nouvelle base.
- **Masse totale sous-recettes comprises**, % de chaque ligne.
- **Sous-recettes** dépliables dans le tableau : mode / valeur, masse exacte, **suit le multiplicateur ou garde sa quantité** (verrouillée), ordre, retrait, lien vers la recette d'origine ; « Utilisée comme sous-recette dans ». Détection des boucles.

### Thèmes PDF
- 7 thèmes fournis (modifiables, réinitialisables) + thèmes personnels : créer, dupliquer, renommer, supprimer, réordonner, thème par défaut.
- Réglages : modèle (Classique, Fiche technique, Moderne, Magazine), place et largeur des ingrédients, alignement et majuscules du titre, intertitres, espacement, photo, styles de titre / étapes / ingrédients, couleurs, polices, taille, papier, décor, informations imprimées, numéros de page, couverture des cahiers, format A4 / A5.
- Éditeur avec **aperçu PDF en direct** (pdf.js, aussi sur téléphone).

### PDF d'une recette
Bouton PDF : choix du thème avec aperçu, puis téléchargement. Sous-recettes sur des pages séparées.

### Cahiers PDF
- Recettes **liées** (toujours à jour) ou **figées** (copie datée, masse modifiable en 3 modes).
- Glisser-déposer, chapitres, titres de section, ajout multiple avec masse cible.
- **Application d'un thème enregistré** en un clic, puis personnalisation complète.
- Couverture, sommaire avec sous-recettes et **numéros de page exacts**, pied de page, A4 / A5, aperçu sans enregistrer.
- Ajout de toutes les recettes du cahier à une liste de courses.

### Listes de courses
- Plusieurs listes, recettes avec coefficient (modifiable), articles libres, ajout rapide.
- Fusion des ingrédients identiques **de même unité**, sous-recettes incluses, max des fourchettes ; lignes à 0 g ignorées.
- Grosses cases à cocher, articles cochés regroupés en bas, « tout décocher », « retirer les cochés », export PDF.

### Réglages
- Dossiers, catégories (nom, couleur, rangement), base d'ingrédients (classement, renommage en cascade, fusion, majuscule, suppression, sélection multiple, entretien : réparation des imports, synchronisation, nettoyage).
- Thèmes PDF, lien du logo, version et nouveautés.
- Import **Recipe Keeper** (ZIP/HTML avec photos, ou CSV ; quantités séparées recollées automatiquement) et **import JSON** (avec le prompt de conversion pour une IA).
- **Mettre à jour le site** : lance `deploy.sh` avec un écran de maintenance.

### Partage public
**Désactivé depuis la V1.7** (voir [Mises à jour proposées](#2-mises-à-jour-proposées)). Interrupteur : `SHARE_ENABLED` dans `src/lib/features.ts`.

---

## 5. Règles de calcul

Toute la logique pure est dans **`src/lib/massAdjust.ts`**, **`src/lib/subRecipeCalc.ts`** et **`src/lib/ingredientRepair.ts`**, importables côté client ET serveur : **ne jamais y importer Prisma**.

| Règle | Détail |
|---|---|
| Masse d'un ingrédient (`ingMass`) | g = valeur · cc × 5 · cs × 15 · L × 1000 · pièce / QS = 0 |
| Masse totale (`recipeMass`) | Somme des masses. Fourchette : `min` = bas, `max` = haut, **masse affichée = moyenne**. Seule fonction autorisée pour ce calcul. |
| Mise à l'échelle (`scaleQty`) | `qty × coef`, arrondi **au supérieur** ; les L deviennent des g entiers. |
| Masse cible exacte (`adjustToTarget`) | Après arrondi, retire/ajoute 1 g sur les plus gros ingrédients en grammes jusqu'à la cible exacte. |
| Sous-recette (`computeLocalCoef`, `computeSubRecipe` dans `subRecipeCalc.ts`) | coefficient = valeur · masse cible = cible ÷ masse de base de l'enfant · pivot = cible ÷ quantité du pivot. |
| Propagation | Non verrouillée : `coef_local × coef_global`. Verrouillée : `coef_local` seul. |
| Masse affichée sur la fiche | Ingrédients de la recette × multiplicateur + chaque sous-recette (arrondie au gramme supérieur, verrouillée = sans multiplicateur). Le mode « masse » du multiplicateur porte sur les ingrédients de la recette seuls. |
| Réparation des imports (`ingredientRepair.ts`) | Ligne « quantité seule » après un ingrédient à 0 g → recollée ; dernière ligne « quantité seule » égale (± 2 %) à la somme des autres → ligne de total supprimée. |
| Snapshot figé (`buildRecipeSnapshot`) | Copie complète (ingrédients + sous-recettes calculées) avec son `multiplier`. |

Saisie / import : `mL → g ×1`, `cl → g ×10`, `dl → g ×100`, `kg → g ×1000` (import JSON) ; le texte libre convertit ml/cl en L. Les cuillères gardent leur **nombre**.

---

## 6. Architecture technique

| Couche | Choix |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions), mode `standalone` |
| Langage | TypeScript strict |
| BDD | PostgreSQL 16 + extensions `pg_trgm`, `unaccent` · ORM Prisma 6 |
| Style | Tailwind CSS v4 + design system « Encre et ambre » (voir §8), icônes lucide-react |
| Validation | Zod |
| PDF | Puppeteer 24 (Chromium système) + pdf-lib (fusion des passes) ; aperçus affichés avec pdf.js |
| Tests | Vitest 4 (86 tests) |
| Hébergement | LXC Debian 12 (Proxmox) · nginx · Cloudflare Tunnel + Zero Trust |

**Monolithe Next.js** : pas de séparation front/back ; les « API » sont des Server Actions (`src/app/actions/`) et des Route Handlers (`src/app/**/route.ts`).

```
src/
├── app/
│   ├── actions/        # Server Actions : recipes, subRecipes, cookbooks, shopping, settings, pdfThemes, import, share, admin, modals
│   ├── recipes/        # fiche, édition, création, PDF (?theme=ID, ?inline=1)
│   ├── cookbooks/      # cahiers + PDF
│   ├── shopping/       # listes de courses + PDF
│   ├── settings/       # réglages, dossiers, catégories, ingrédients, imports, themes/ (liste + éditeur)
│   ├── share/[token]/  # page publique (désactivée)
│   ├── uploads/        # sert les photos depuis UPLOAD_DIR
│   ├── manifest.ts     # manifeste PWA
│   └── api/            # search (Ctrl K), recipes, ingrédients, pdf-preview (thème non enregistré), aperçu cahier, health, deploy/log
├── components/
│   ├── ui/             # Menu (clic droit, ⋯, appui long, feuilles), Help (« ? »), CommandPalette (Ctrl K), useMedia
│   ├── recipe/         # RecipeTable, RecipeView, RecipeMenu, FolderTiles
│   ├── themes/         # ThemeList, ThemeEditor, ThemePreviewPanel
│   ├── settings/       # fenêtres et listes partagées des réglages
│   └── …               # AppNav (menu latéral + barres téléphone), ModalOverlay, PdfPreview, RecipePdfDialog, ThemeThumb…
├── styles/             # CSS par zone (recipe-form, cookbooks, shopping, settings), importés par globals.css
├── instrumentation.ts  # au démarrage : réparation unique des ingrédients importés
├── middleware.ts       # protection de /share
└── lib/
    ├── massAdjust.ts, subRecipeCalc.ts, ingredientRepair.ts   # calculs purs (voir §5)
    ├── pdfThemes.ts        # thèmes enregistrés (création des thèmes fournis, thème par défaut)
    ├── ingredientRepairDb.ts
    ├── recipes.ts / cookbooks.ts / shopping.ts / subRecipes.ts / share.ts
    ├── ingredientBases.ts  # ajout dédoublonné à la base d'ingrédients
    ├── parseIngredientsText.ts, importRecipeKeeper*.ts
    ├── uploads.ts          # dossier des photos
    ├── features.ts         # interrupteurs (SHARE_ENABLED)
    └── pdf/
        ├── theme.ts        # schéma du thème, thèmes fournis, polices, motifs
        ├── template.ts     # HTML + CSS (4 mises en page, styles, disposition : placementCss)
        ├── recipePdf.ts    # PDF d'une recette avec un thème, recette d'aperçu
        ├── renderer.ts     # Chromium partagé + file d'attente + lecture des ancres du sommaire
        ├── fonts.ts        # polices Google mises en cache et intégrées
        ├── decorate.ts     # papier et décor dessinés avec pdf-lib après le rendu
        └── cookbookPdf.ts  # assemblage d'un cahier (recettes → sommaire → fusion)
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

---

## 7. Modèle de données

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
| `pdf_themes` | Thèmes PDF enregistrés : nom, description, `preset_key` (thème fourni), format, `config` (JSON du thème), `is_default`, position |
| `settings` | Clé/valeur JSON : `siteUrl`, `pdfThemesSeeded`, `ingredientRepairV1`, `recipePdfSettings` (ancien) |
| `pdf_templates` / `variants` | Prévu, peu ou pas utilisé |

---

## 8. Design system

« Encre et ambre », **sombre uniquement**. Tokens dans `src/app/globals.css` (`:root`).
- **Couleurs** : fond `#0b0f17`, surface `#0f1520`, cartes `#141b28`, fenêtres `#182131`, bordures `#1e2737` / `#2b3549`, texte `#e7ebf3` / `#aab3c5` / `#6f7a90`.
- **Sens** : ambre `#f0a64a` action et sélection · vert `#4fc0ad` succès · violet `#8f9cf0` verrouillé / figé · rouge `#ef7d6b` danger.
- **Typo** : Geist (texte), Geist Mono (raccourcis, calculs), Fraunces (titres de page).
- **Icônes** : `lucide-react`, 14 à 20 px. **Aucun emoji.**
- **Mise en page** : menu latéral à partir de 900 px ; en dessous, barre du haut + barre d'onglets. Fenêtres centrées (≥ 700 px) ou feuilles du bas (téléphone).
- **Composants** : `fl-card`, `fl-btn` (+ `-primary`, `-secondary`, `-ghost`, `-danger`, `-edit`, `-icon`), `fl-input`, `fl-label`, `fl-tag`, `fl-chip`, `fl-seg`, `fl-tabs`, `fl-switch`, `fl-list` / `fl-row`, `page-head`, `crumb`, `sect-title`, `searchbox`, `kpi`, `itable`, `rtable`, `menu`, `sheet`, `modal`, `help-pop`, `cmdk`.
- **Règles** : peu de boutons visibles (actions secondaires dans un menu ⋯ / clic droit), une bulle « ? » sur chaque information calculée ou non évidente, cibles tactiles ≥ 36 px, aucun défilement horizontal à 390 px.

---

## 9. Installation (développement)

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

## 10. Production (Proxmox LXC)

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

## 11. Historique des versions

| Version | Contenu principal |
|---|---|
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

---

## 12. Conventions

- Tout en **français** (interface, code commenté, commits).
- Préfixes de commit : `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Travail sur une branche, puis **Pull Request vers `main`** ; `main` = ce qui part en production.
- Avant chaque push : `pnpm typecheck && pnpm test`.
- À chaque version : ajouter une entrée dans `src/lib/changelog.ts` et dans les sections 1 et 11 de ce fichier.

---

*Projet personnel. Tous droits réservés.*

# RecipeLog — Cahier des charges V1.1

> **Gestion de recettes de pâtisserie — Application web auto-hébergée**

---

| | |
|---|---|
| **Projet** | RecipeLog |
| **Version** | 1.1 — Ajustements sous-recettes & cahiers |
| **Domaine** | `recipe.super-nono.cc` |
| **Écosystème** | `super-nono.cc` |
| **Hébergement** | Proxmox LXC · Cloudflare Zero Trust |
| **Cible** | Usage personnel — Pâtissier BTM 2ᵉ année |
| **Langue** | Français |
| **Design system** | FuelLog (dark · DM Serif Display · DM Mono) |

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
- Onglet dédié **Favoris**
- Filtres par tag et catégorie dans la liste principale

#### 2.1.5 Impression PDF

- **Impression d'une recette unique** depuis la fiche (bouton direct + menu 3 points)
- **Système de cahiers** : création d'un cahier vide, puis ajout de recettes depuis chaque fiche via « Ajouter au cahier »
- **Mode de liaison au choix à chaque ajout** :
  - **🔗 Liée dynamique** : le cahier reflète toujours la version actuelle de la recette (modifications automatiquement propagées)
  - **📌 Figée (snapshot)** : copie figée au moment de l'ajout, non affectée par les modifications ultérieures de la recette source
- **Intégration des sous-recettes dans un cahier** au moment de l'ajout d'une recette contenant des sous-recettes :
  - **📄 Fiche unique** : les sous-recettes sont intégrées (dépliées) dans la fiche principale du PDF
  - **📚 Recettes séparées** : la recette principale et chaque sous-recette deviennent des fiches distinctes dans le cahier
- Formats supportés : **A4 et A5**
- **3 à 4 templates** de mise en page au choix, avec possibilité d'en ajouter ultérieurement
- Paramètres du cahier : réorganisation (drag & drop), sommaire on/off, page de garde on/off et personnalisable (style, police, taille), logo on/off, numérotation, pied de page
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

- Gestion du logo personnel (upload + toggle activer/désactiver)
- Gestion de la base d'ingrédients (si mode B utilisé)
- Gestion des catégories
- Export/import JSON manuel
- Toggle mode de saisie des ingrédients (A : libre / B : base réutilisable)

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

| Table | Description |
|---|---|
| **`recipes`** | Recette principale — nom, photo, tags[], source, notes, favorite, rating, created_at, updated_at |
| **`ingredients`** | Ingrédient d'une recette — name (si mode A), ingredient_id (si mode B), quantity_g, position, recipe_id |
| **`ingredients_base`** | Base réutilisable — name, default_unit, created_at |
| **`steps_block`** | Bloc de texte libre des étapes — content (text), recipe_id |
| **`sub_recipes`** | Référence d'une recette en sous-recette d'une autre — parent_id, child_id, label, calc_mode, calc_value, position, **is_locked** (bool, pour verrouillage 🔒) |
| **`variants`** | Variante d'une recette — source_recipe_id, variant_recipe_id, note |
| **`categories`** | Catégorie — name, color, icon |
| **`recipes_categories`** | Table de jointure recettes ↔ catégories (N-N) |
| **`tags`** | Tags libres — name, recipe_id (ou table pivot si réutilisables) |
| **`comments`** | Commentaires datés — content, created_at, recipe_id |
| **`cookbooks`** | Cahier de recettes — name, description, format (A4/A5), template_id, has_toc, has_cover, cover_config (jsonb), has_logo, page_numbering_config (jsonb), footer (text) |
| **`cookbooks_recipes`** | Jointure cahier ↔ recettes — cookbook_id, recipe_id, position, **link_mode** (linked/snapshot), **snapshot_data** (jsonb, si snapshot), **snapshot_date** (timestamp), **subrecipe_mode** (single/separate) |
| **`cookbook_snapshots`** | Optionnel — stockage des snapshots figés avec snapshot_data complet au moment de l'ajout |
| **`shopping_lists`** | Liste de courses — name, type (recipes/free/mixed) |
| **`shopping_list_items`** | Item d'une liste — name, quantity_g (nullable), recipe_id (nullable), checked, position |
| **`shopping_list_recipes`** | Recettes liées à une liste avec coefficient |
| **`share_tokens`** | Tokens publics — token, entity_type (recipe/cookbook), entity_id, created_at, revoked_at |
| **`settings`** | Paramètres globaux (clé-valeur) — ingredient_mode (A/B), logo_enabled, logo_path... |
| **`pdf_templates`** | Templates PDF disponibles — name, description, slug, preview_path, is_custom |

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

### 8.1 Arborescence des écrans

```
/ (accueil)
├── /recipes                        Liste + recherche + filtres
│   ├── /recipes/new                Création nouvelle recette
│   └── /recipes/:id                Fiche recette détaillée
│       ├── /recipes/:id/edit       Édition
│       └── /recipes/:id/share      Gestion du lien public
├── /favorites                      Vue filtrée des favoris
├── /cookbooks                      Liste des cahiers
│   ├── /cookbooks/new              Création cahier
│   └── /cookbooks/:id              Configuration + génération PDF
├── /shopping                       Listes de courses
│   ├── /shopping/new               Nouvelle liste
│   └── /shopping/:id               Détail / mode courses
├── /ingredients                    (si mode B) Base d'ingrédients
├── /settings                       Paramètres globaux
│   ├── /settings/general           Mode ingrédient, logo, langue
│   ├── /settings/categories        Gestion catégories
│   ├── /settings/import-export     JSON import/export
│   └── /settings/about             À propos, version
└── /p/:token                       Vue publique (hors auth ZT)
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

## 10. Planning indicatif

Planning donné à titre indicatif, à adapter selon la disponibilité du développeur. Les phases peuvent se chevaucher partiellement.

| Phase | Contenu | Durée |
|---|---|---|
| **1. Cadrage & setup** | Validation finale du CDC, setup du dépôt, choix stack, bootstrap projet, configuration LXC de dev | 1 semaine |
| **2. Socle & recettes V1** | Modèle de données complet, CRUD recettes, authentification Zero Trust, design system intégré | 2 semaines |
| **3. Multiplication & sous-recettes** | 3 modes de calcul, recalcul dynamique, système de sous-recettes en accordéon, propagation en cascade, verrouillage | 1-2 semaines |
| **4. Cahiers & PDF** | Création cahiers, 4 templates PDF, génération, drag & drop, personnalisation page de garde, modes liée/figée et fiche unique/séparées | 2 semaines |
| **5. Liste de courses** | CRUD listes, génération auto depuis recettes, fusion, cases à cocher, export PDF | 1 semaine |
| **6. Partage public & paramètres** | Tokens, vue publique, paramètres globaux, import/export JSON | 1 semaine |
| **7. Scripts Proxmox** | Scripts LXC, installation, mise à jour, backup, documentation | 3-4 jours |
| **8. Tests & import initial** | Tests fonctionnels, import du PDF Recipe Keeper, validation, corrections | 1 semaine |
| **9. Mise en production** | Déploiement sur `recipe.super-nono.cc`, configuration Cloudflare, recette finale | 2-3 jours |

> **Total indicatif**
> Environ **9 à 11 semaines** de développement solo, selon la disponibilité et l'expérience du développeur. Les fonctionnalités V2 ne sont pas incluses dans ce planning et feront l'objet d'un second lot ultérieur.

---

**Fin du document**

*RecipeLog — Cahier des charges V1.1 — super-nono.cc*

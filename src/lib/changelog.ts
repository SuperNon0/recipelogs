export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  features?: string[];
  fixes?: string[];
  migrations?: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "V2.1",
    date: "2026-10-22",
    title: "Plus de photos, corrections d'affichage et de mise à jour",
    features: [
      "Les photos de recettes sont retirées du site (liste, cahiers, fiche, import Recipe Keeper)",
      "Éditeur de thème : l'aperçu suit la page quand on descend, s'ouvre en grand et se met à jour plus vite",
    ],
    fixes: [
      "Après une mise à jour, le site n'affiche plus l'ancien style (CSS)",
      "Cartes de thème PDF : les badges passent sous le texte au lieu de couvrir la miniature",
      "Aperçu PDF qui ne s'affichait pas",
      "Plus d'icône cassée quand une photo manque",
    ],
    migrations: ["Les photos déjà importées sont détachées des recettes (automatique à la mise à jour)"],
  },
  {
    version: "V2.0",
    date: "2026-10-21",
    title: "Nouveau design, thèmes PDF personnalisables",
    features: [
      "Nouveau design sombre « Encre et ambre » sur tout le site, sans emoji, avec des icônes",
      "Menu latéral sur ordinateur, barre d'onglets et feuilles d'actions sur téléphone",
      "Menu d'actions par clic droit, bouton à trois points ou appui long",
      "Recherche globale Ctrl K (recettes, ingrédients, cahiers, listes)",
      "Bulles d'aide « ? » qui expliquent chaque information et son calcul",
      "Thèmes PDF : 7 thèmes fournis, modifiables, duplicables, et création de ses propres thèmes",
      "Téléchargement du PDF avec choix du thème et aperçu",
      "Nouvelles dispositions PDF : place des ingrédients, alignement du titre, espacement, intertitres, photo",
      "Sous-recettes : masse totale qui les inclut, verrouillage, réglage et ordre depuis leur menu",
      "Installable comme une application (PWA)",
    ],
    fixes: [
      "Ajout d'une sous-recette en mode « ingrédient pivot » (échouait toujours)",
      "Dupliquer une recette copie aussi ses sous-recettes",
      "Recherche du sélecteur de recettes d'un dossier qui ignorait le texte saisi",
    ],
    migrations: ["Nouvelle table pdf_themes (créée automatiquement à la mise à jour)"],
  },
  {
    version: "V1.9",
    date: "2026-10-20",
    title: "PDF plus rapides et plus beaux, mise à jour fiabilisée",
    features: [
      "7 styles prêts à l'emploi pour les PDF",
      "Habillage des pages : papier, décor, styles de titre, d'étapes et d'ingrédients",
      "3 motifs de couverture et 3 nouvelles polices",
    ],
    fixes: [
      "Génération des PDF ~7× plus rapide",
      "Mise à jour du site : build séparé, retour arrière automatique, détection d'échec",
    ],
  },
  {
    version: "V1.8",
    date: "2026-10-20",
    title: "Sommaire exact et 4 mises en page PDF",
    features: [
      "4 mises en page des recettes : Classique, Fiche technique, Moderne, Magazine",
      "Choix de la mise en page par cahier et pour le PDF d'une recette",
    ],
    fixes: [
      "Numéros de page du sommaire exacts même si une recette fait plusieurs pages",
      "Alignement des fourchettes et cuillères dans les PDF",
      "« 3 pièces » au pluriel",
    ],
  },
  {
    version: "V1.7",
    date: "2026-10-20",
    title: "Corrections & fiabilisation",
    fixes: [
      "Dupliquer une recette conserve les unités",
      "« Mettre à jour la recette » : litres et fourchettes corrects",
      "Le pivot des sous-recettes survit à la modification de la recette",
      "Cuillères (cc/cs) en saisie texte : plus de double conversion",
      "Liste de courses : unités séparées, sous-recettes incluses, cases cochées conservées",
      "Photos stockées hors du build + affichées sur la fiche",
    ],
    migrations: ["20261020000000_shopping_item_unit", "20261020000001_backfill_name_normalized"],
  },
  {
    version: "V1.6",
    date: "2026-06-19",
    title: "Toggle décimales, navigation pill, masse cible exacte",
    features: [
      "Toggle décimales / arrondi dans le panneau de multiplication",
      "Masse cible exacte en affichage (adjustToTarget appliqué au rendu)",
      "Navigation pill Apple-style avec icônes et badge version",
      "Refonte responsive de la page ingrédients (grille auto-fill)",
    ],
    fixes: [
      "Correction de la précision masse cible (393 g demandés affichaient 396 g)",
      "Correction du ModeSwitcher sur mobile (hauteur et styles inadaptés)",
      "Suppression de la page Nouveautés (non fonctionnelle)",
    ],
  },
  {
    version: "V1.5",
    date: "2026-06-01",
    title: "Masse exacte, optimisations performances, cadenas optimiste",
    features: [
      "Toggle « Masse exacte » dans les 3 panneaux de modification (recette, sous-recettes, cahiers)",
      "Filtre des recettes déjà présentes dans un cahier lors de l'ajout",
      "Index GIN trigram (pg_trgm) pour la recherche fuzzy sur les noms de recettes",
    ],
    fixes: [
      "Cadenas sous-recettes : état optimiste sans revalidatePath (plus de perte du panel multiplicateur)",
      "Correction du bug limit=0 retournant 50 résultats au lieu de tout charger",
      "Arrondi supérieur systématique dans les PDFs/snapshots",
    ],
  },
  {
    version: "V1.4",
    date: "2026-05-31",
    title: "Unités cc/cs, recherche sans accents, navigation dossier",
    features: [
      "Unités cuillère à café (cc ≈ 5g) et cuillère à soupe (cs ≈ 15g) avec équivalent grammes affiché",
      "Recherche sans accents : taper \"creme\" trouve \"crème\", \"cafe\" trouve \"café\"",
      "Le bouton retour ramène au dossier d'origine lors de la navigation depuis un dossier",
      "Page d'import JSON avec prompt IA intégré pour convertir les livres scannés",
    ],
    fixes: [
      "Correction de la recherche sur mobile (le clavier virtuel ne réinitialisait plus le champ)",
      "Correction des boutons Tiptap (gras / italique / souligné activés/désactivés incorrectement)",
    ],
    migrations: [
      "Suppression de l'unité mL — tous les ingrédients en mL sont convertis en g (1 mL ≈ 1 g)",
      "Ajout de la colonne name_normalized pour la recherche sans accents",
      "Activation de l'extension PostgreSQL unaccent",
    ],
  },
  {
    version: "V1.3",
    date: "2026-05-22",
    title: "Sélecteur d'unités par ingrédient",
    features: [
      "Sélecteur d'unité par ingrédient : g / L / mL / pièce / QS",
      "QS (quantité suffisante) : le champ quantité disparaît automatiquement",
      "Masse totale calculée uniquement sur les ingrédients en g",
      "Affichage de l'unité dans la fiche recette, les sous-recettes et les PDF",
    ],
    fixes: [
      "Amélioration du layout FolderManager sur mobile",
      "Correction de la recherche de recettes (résultats vides)",
    ],
    migrations: [
      "Ajout de la colonne unit sur les ingrédients (TEXT, défaut \"g\")",
    ],
  },
  {
    version: "V1.2",
    date: "2026-05-12",
    title: "Dossiers, cahiers PDF, listes de courses",
    features: [
      "Système de dossiers pour organiser les recettes",
      "Cahiers PDF multi-recettes avec templates",
      "Listes de courses liées aux recettes",
      "Partage public de recettes via lien",
      "Sous-recettes et multiplicateur de quantités",
    ],
    migrations: [
      "Ajout des tables folders, cookbooks, shopping_lists, share_tokens",
    ],
  },
];

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
    version: "V1.4",
    date: "2026-05-31",
    title: "Unités cc/cs, recherche sans accents, navigation dossier",
    features: [
      "Unités cuillère à café (cc ≈ 5g) et cuillère à soupe (cs ≈ 15g) avec équivalent grammes affiché",
      "Recherche sans accents : taper \"creme\" trouve \"crème\", \"cafe\" trouve \"café\"",
      "Bouton ← retourne au dossier d'origine lors de la navigation depuis un dossier",
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

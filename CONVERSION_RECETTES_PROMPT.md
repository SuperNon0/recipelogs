# Instructions — Conversion de recettes vers JSON importable RecipeLog

Utilise ces instructions pour convertir n'importe quel livre de recettes scanné (ou texte extrait d'un scan) en fichier JSON importable dans RecipeLog.

---

## Schéma JSON attendu

```json
[
  {
    "name": "Nom de la recette",
    "yield": "Pour 4 personnes",
    "ingredients": [
      { "name": "farine", "quantity": 200, "unit": "g" },
      { "name": "lait", "quantity": 500, "unit": "g" },
      { "name": "œufs", "quantity": 3, "unit": "pièce" },
      { "name": "extrait de vanille", "quantity": 1, "unit": "cc" },
      { "name": "beurre fondu", "quantity": 2, "unit": "cs" },
      { "name": "vanille", "quantity": 0, "unit": "QS" }
    ],
    "steps": "Étape 1 texte complet...\n\nÉtape 2 texte complet...",
    "notes": "Conseils, astuces, variantes.",
    "source": "Nom du livre ou de la source"
  }
]
```

**Le fichier entier est un tableau JSON** (`[...]`) contenant une entrée par recette.

---

## Champs

| Champ | Requis | Type | Description |
|-------|--------|------|-------------|
| `name` | ✅ | string | Nom exact de la recette |
| `yield` | non | string | Quantité produite ou nombre de portions |
| `ingredients` | non | array | Liste des ingrédients |
| `steps` | non | string | Étapes de préparation séparées par `\n\n` |
| `notes` | non | string | Conseils, astuces, variantes, dégustation |
| `source` | non | string | Nom du livre, auteur ou URL source |

---

## Règles pour les ingrédients

### Unités natives acceptées

| Unité JSON | Utiliser pour |
|------------|--------------|
| `"g"` | grammes (défaut pour solides et liquides) |
| `"L"` | litres (grands volumes) |
| `"cc"` | cuillère à café (~5 g) |
| `"cs"` | cuillère à soupe (~15 g) |
| `"pièce"` | items comptables (œufs, citrons, feuilles de gélatine…) |
| `"QS"` | quantité suffisante — pas de quantité numérique |

### Conversions d'unités

| Unité dans le livre | Unité JSON | Conversion de la quantité |
|--------------------|------------|--------------------------|
| g, gr, grammes | `"g"` | valeur inchangée |
| kg, kilogrammes | `"g"` | × 1000 |
| L, litre, litres | `"L"` | valeur inchangée |
| ml, mL, millilitre | `"g"` | × 1 (1 mL ≈ 1 g) |
| cl, cL, centilitre | `"g"` | × 10 |
| dl, dL, décilitre | `"g"` | × 100 |
| cuillère à soupe (cs) | `"cs"` | valeur inchangée |
| cuillère à café (cc) | `"cc"` | valeur inchangée |
| pièce, pcs, unité, u | `"pièce"` | — |
| œuf(s), citron(s)… | `"pièce"` | — |
| feuille(s) (gélatine…) | `"pièce"` | — |

> **Note** : il n'y a plus d'unité `mL` dans RecipeLog. Tous les millilitres sont stockés en grammes (approximation 1:1 valable pour l'eau et la plupart des liquides de pâtisserie).

### Ingrédients QS (quantité suffisante)

Utiliser `"unit": "QS"` et `"quantity": 0` pour :
- Tout ce qui est "pour le décor", "pour la déco", "décoration"
- "QS", "q.s.", "à volonté", "au goût", "selon goût"
- "quelques feuilles de…", "un peu de…"
- Colorants, décorations, éléments purement optionnels

### Fractions

Convertir en décimal :
- `1/2` → `0.5`
- `1/4` → `0.25`
- `3/4` → `0.75`
- `1 1/2` → `1.5`

---

## Règles pour les étapes (steps)

- Regrouper tout le texte des étapes dans **une seule chaîne de caractères**
- Séparer chaque étape ou paragraphe par `\n\n` (deux sauts de ligne)
- Ne pas numéroter les étapes (le numéro est affiché automatiquement)
- Supprimer les puces, tirets en début de ligne
- Conserver les températures, temps, textures tels quels

Exemple :
```
"steps": "Torréfiez le café 10 min à 140 °C.\n\nFaites bouillir le lait avec le café torréfié.\n\nMélangez les jaunes avec le sucre jusqu'à blanchiment."
```

---

## Règles pour les notes

Regrouper dans `notes` :
- Conseils de conservation
- Variantes ou substitutions d'ingrédients
- Conseils de dégustation
- Notes de l'auteur
- Toute information qui n'est pas une étape de préparation

---

## Cas particuliers

### Sous-recettes intégrées (ex : crème + glaçage)

Si une recette contient plusieurs préparations distinctes listées séparément, **les fusionner en une seule recette** :
- Mettre tous les ingrédients ensemble dans le tableau `ingredients`
- Ajouter un commentaire entre étapes pour indiquer le changement de préparation (ex : "--- Glaçage ---")
- Ou créer deux recettes séparées si elles sont vraiment indépendantes

### Ingrédients sans quantité

Si la quantité n'est pas mentionnée du tout → utiliser `"unit": "QS"`, `"quantity": 0`

### Titres de section dans les ingrédients (ex : "Pour la ganache :")

Ignorer ces titres de section dans le tableau d'ingrédients — mettre tous les ingrédients à plat.

### Caractères spéciaux

- Garder les accents : é, è, ê, ç, à, ù, œ, etc.
- Apostrophes droites `'` ou typographiques `'` — les deux sont acceptées
- Degrés : `°C` (avec espace avant si possible)

---

## Exemple complet

**Entrée (texte du livre)** :
```
Glace au Café
Pour 3/4 de litre environ

40 g de café en grains
500 mL de lait frais entier
5 jaunes d'œufs
150 g de sucre
1 cuillère à café d'extrait de vanille
Quelques grains de café pour le décor

Torréfiez le café pendant 10 min à 140°C.
Portez le lait à ébullition avec le café.
Laissez infuser 5 min hors du feu.
Fouettez les jaunes avec le sucre. Versez le lait chaud filtré dessus.
Faites épaissir à feu doux en remuant sans arrêt.
Faites turbiner jusqu'à consistance crémeuse.
```

**Sortie JSON** :
```json
{
  "name": "Glace au Café",
  "yield": "Pour 3/4 de litre",
  "ingredients": [
    { "name": "café en grains", "quantity": 40, "unit": "g" },
    { "name": "lait frais entier", "quantity": 500, "unit": "g" },
    { "name": "jaunes d'œufs", "quantity": 5, "unit": "pièce" },
    { "name": "sucre", "quantity": 150, "unit": "g" },
    { "name": "extrait de vanille", "quantity": 1, "unit": "cc" },
    { "name": "grains de café pour le décor", "quantity": 0, "unit": "QS" }
  ],
  "steps": "Torréfiez le café pendant 10 min à 140 °C.\n\nPortez le lait à ébullition avec le café. Laissez infuser 5 min hors du feu.\n\nFouettez les jaunes avec le sucre. Versez le lait chaud filtré dessus.\n\nFaites épaissir à feu doux en remuant sans arrêt.\n\nFaites turbiner jusqu'à consistance crémeuse.",
  "notes": "",
  "source": "Nom du livre"
}
```

---

## Instructions à donner à l'IA

Copie-colle ce prompt en remplaçant `[TEXTE DES RECETTES]` par le contenu extrait du scan :

---

**PROMPT À COPIER :**

```
Tu vas convertir le texte suivant (extrait d'un livre de recettes scanné) en fichier JSON importable dans RecipeLog.

Règles strictes :
- Le résultat est un tableau JSON valide contenant une entrée par recette
- Champs requis : name (string), yield (string ou null), ingredients (array), steps (string), notes (string), source (string)
- Unités acceptées UNIQUEMENT : "g", "L", "cc", "cs", "pièce", "QS"
- Conversions : kg→g×1000, mL→g×1, cl→g×10, dl→g×100, cuillère à soupe→"cs" (valeur inchangée), cuillère à café→"cc" (valeur inchangée)
- Ingrédients décoratifs / "pour le décor" / "QS" → unit:"QS", quantity:0
- Étapes séparées par \n\n dans une seule chaîne, sans numérotation
- Fractions converties en décimal (1/2→0.5)
- Source : "[NOM DU LIVRE]"
- Retourner UNIQUEMENT le JSON brut, sans explication ni markdown

Texte à convertir :
[TEXTE DES RECETTES]
```

---

## Vérification avant import

Avant d'importer dans RecipeLog, vérifie :
- [ ] Le fichier est un tableau JSON valide (commence par `[`, se termine par `]`)
- [ ] Chaque recette a au minimum un champ `name`
- [ ] Toutes les unités sont dans : `g`, `L`, `cc`, `cs`, `pièce`, `QS`
- [ ] Les quantités QS ont bien `"quantity": 0`
- [ ] Pas de virgules manquantes entre objets dans le tableau

Pour valider : ouvre le fichier sur [jsonlint.com](https://jsonlint.com) ou utilise `python3 -m json.tool recettes.json`.

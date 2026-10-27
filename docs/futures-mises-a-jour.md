# RecipeLog — futures mises à jour (idées mises de côté)

*Mis de côté par Noë le 27/10/2026, lors du choix des nouveautés de priorité moyenne (gardées et développées : 6 moule, 7 variantes, 8 fiche de production, 9 mode labo, 13 recherche complète). Tout est prêt à être repris : il suffit de dire « ajoute le n° 10 » (ou 11, 12, un petit plus) dans une prochaine discussion.*

Règles qui restent valables : pas de planning ni de calendrier, pas de photos, aucun coût d'API, même style graphique, appli sobre. Une mise à jour par nouveauté, validée par Noë avant la mise en ligne.

---

## 10. Pourcentage boulanger et hydratation — effort petit

**À quoi ça sert.** Pour la viennoiserie, le pain et le levain, on raisonne en % du poids de farine, pas en % du total. Aujourd'hui la colonne % est calculée sur la masse totale. Avec ce réglage, la farine vaut 100 % et tout le reste s'exprime par rapport à elle, avec le taux d'hydratation (eau, lait, œufs) affiché en haut.
Exemple : farine 1 000 g, lait 520 g, œufs 100 g → hydratation environ 60 %, beurre de tourage 25 %.

**Dans l'appli.** Un petit sélecteur « % du total / % boulanger » au-dessus de la colonne %. Le choix est retenu par recette. Ligne « Hydratation : 60 % » au-dessus du tableau.

**Comment ce sera fait.**
1. L'appli repère les farines par leur nom (farine, T45, T55, seigle…). Si elle se trompe ou s'il y en a plusieurs, Noë choisit la ou les « farines de base ».
2. Les pourcentages sont recalculés par rapport à la farine ; les grammes ne changent pas.
3. L'hydratation additionne l'eau contenue dans les liquides (eau 100 %, lait ≈ 90 %, œufs ≈ 75 %), valeurs modifiables par ingrédient.
4. Option : le PDF peut afficher la colonne en % boulanger.

**Base de données.** Un réglage par recette (mode de la colonne %, farines de base) ; éventuellement « % d'eau » sur la fiche ingrédient.

---

## 11. Remplacer un ingrédient avec son équivalence — effort moyen

**À quoi ça sert.** Plus de gélatine en feuilles, seulement de la poudre ; que de la levure sèche ; passer d'un chocolat 70 % à un 64 %. Au lieu de recalculer à la main, « remplacer par… » met la bonne quantité, avec l'eau de réhydratation si besoin.
Exemples : levure fraîche 30 g → levure sèche instantanée 10 g (active 15 g). Gélatine 6 feuilles (12 g) → poudre 200 Bloom 12 g + 60 g d'eau.

**Dans l'appli.** Action « Remplacer par… » sur une ligne d'ingrédient (mode édition) : liste des équivalences possibles avec la quantité déjà calculée, boutons « Remplacer dans cette recette » ou « Créer une variante » (la n° 7 est développée, donc ce bouton pourra s'y brancher).

**Comment ce sera fait.**
1. Une table d'équivalences courantes (gélatines, levures, sucre inverti/glucose/miel, beurre doux/demi-sel, crème/lait en poudre…), corrigeable dans Réglages.
2. « Remplacer par… » ne propose que les équivalences connues pour cet ingrédient. Si un ingrédient d'appoint est nécessaire (eau de la gélatine), il est ajouté à la ligne suivante.
3. Chocolats : ajustement du beurre ou de la crème selon la différence de cacao et de beurre de cacao. Il faut le % cacao et le % de matière grasse sur la fiche de chaque chocolat (à remplir une fois, Claude peut le pré-remplir via MCP).
4. Choix : remplacer dans la recette, ou créer une variante pour garder l'original.

**Base de données.** Une table d'équivalences ; % cacao / % MG sur les fiches chocolat.

---

## 12. Équilibrage des ganaches, glaces et sorbets — effort gros (2 ou 3 mises à jour)

**À quoi ça sert.** Savoir avant de produire si une ganache va bien cristalliser et se conserver, ou si un sorbet sera trop dur ou trop mou en vitrine. L'appli calcule la composition de la recette (sucres, matière grasse, eau, extrait sec ; pour les glaces, pouvoir sucrant POD et anticongelant PAC) et la compare à des repères par type.

**Dans l'appli.** Un onglet « Équilibre » sur la fiche, seulement pour les recettes auxquelles on donne un type (ganache montée, ganache à cadrer, glace lait, sorbet…). Chaque valeur avec une barre et sa zone cible : vert dans la cible, orange en dehors (« un peu haut, sorbet mou »).

**Comment ce sera fait.**
1. Le vrai travail : chaque ingrédient doit connaître sa composition (eau, sucres, MG, extrait sec, cacao). Claude la remplit pour tous les ingrédients via MCP avec des valeurs moyennes du commerce (gratuit) ; Noë corrige ses produits précis (son chocolat, ses purées).
2. Un type par recette, avec ses repères modifiables.
3. Addition de la composition de tous les ingrédients, sous-recettes comprises (moteur récursif existant), comparaison aux repères.
4. Deux étapes : d'abord compositions + ganaches, ensuite glaces et sorbets (POD/PAC).

**Base de données.** Composition sur chaque ingrédient + type sur la recette + table des repères.

---

## Petits plus (déjà listés lors de l'audit)

- **Calculette sirops / Brix** : rattraper un sorbet au réfractomètre, faire un sirop à 30 °B. Petit.
- **Température de base** des pâtes levées (eau = base − farine − local − frasage). Petit.
- **Courbe de tempérage** enregistrée par chocolat (noir / lait / blanc). Petit.
- **Note d'état par ligne d'ingrédient** (« beurre pommade », « œufs à température »). Petit.
- **Liste de courses rangée par rayon**. Petit.
- **Étiquettes produit** (DLC, allergènes, ingrédients par ordre décroissant) + valeurs nutritionnelles via la table Ciqual de l'Anses (gratuite), utile si préemballage. Moyen.
- **Coût dans les PDF** (fiche technique avec coût matière) : laissé de côté lors de la V2.4.

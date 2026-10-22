# RecipeLog

## Journal des versions

La page « Version et nouveautés » (Réglages) lit `src/lib/changelog.ts`, qui est écrit à la main.
Chaque PR qui change quelque chose de visible pour l'utilisateur doit y ajouter une ligne :

- dans l'entrée du jour en tête de `CHANGELOG` si elle existe, sinon une nouvelle entrée
  (version suivante, ex. V2.1 → V2.2, date du jour) ;
- en français simple, du point de vue de l'utilisateur (`features`, `fixes`, `migrations`).

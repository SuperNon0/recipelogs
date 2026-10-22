# RecipeLog

## Journal des versions

La page « Version et nouveautés » (Réglages) lit `src/lib/changelog.ts`, qui est écrit à la main.
Chaque PR qui change quelque chose de visible pour l'utilisateur doit y ajouter une ligne :

- dans l'entrée du jour en tête de `CHANGELOG` si elle existe, sinon une nouvelle entrée
  (version suivante, ex. V2.1 → V2.2, date du jour) ;
- en français simple, du point de vue de l'utilisateur (`features`, `fixes`, `migrations`).

La même page affiche aussi automatiquement les dernières PR fusionnées : `next.config.ts` les lit
dans `git log` au build (`src/lib/pr-log.ts`). Un titre de PR clair en français y apparaît tel quel.

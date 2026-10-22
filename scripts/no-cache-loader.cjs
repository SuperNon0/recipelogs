// Loader webpack « pass-through » qui interdit la mise en cache du module.
// Appliqué à globals.css (voir next.config.ts) : Tailwind régénère tout le CSS
// à chaque build, au lieu de faire confiance au cache webpack qui a déjà
// resservi un ancien CSS sur le serveur.
module.exports = function noCacheLoader(source, map) {
  this.cacheable(false);
  this.callback(null, source, map);
};

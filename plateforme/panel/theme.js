// Posé avant l'affichage (chargé sans defer dans <head>) : thème et couleur d'accent choisis
// dans « Apparence », gardés sur cet appareil (même clé que l'appli RecipeLog).
try {
  var p = JSON.parse(localStorage.getItem("encre-apparence") || "{}"), h = document.documentElement;
  if (p.accent) h.dataset.accent = p.accent;
  if (p.theme === "sombre") h.dataset.theme = "dark";
  else if (p.theme === "clair") h.dataset.theme = "light";
} catch (e) {}

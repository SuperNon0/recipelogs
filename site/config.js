// Réglages du site vitrine. Sur le serveur, ce fichier est remplacé par
// /etc/recipelog-vitrine/config.js (commande vitrine-reglage, gardé aux mises à jour).
window.VITRINE = {
  // Adresse publique de la démo, par exemple "https://demo.mon-domaine.fr"
  demoUrl: "",
  // Adresse e-mail de contact pour les demandes de démonstration et de devis
  contactEmail: "",
  // Bouton « Se connecter » (en haut et en bas de page). Vide = caché. Sur la plateforme :
  // "/connexion" (chaque client arrive sur son propre RecipeLog après sa connexion).
  connexionUrl: "",
  // Liens Tarifs, Mentions légales, CGV et Confidentialité en bas de page. Sur la plateforme :
  // true (le panel sert ces pages). Ailleurs : false (les pages n'existent pas).
  pagesLegales: false,
};

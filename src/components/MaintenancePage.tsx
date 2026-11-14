import { ChefHat, Wrench } from "lucide-react";

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Page affichée pendant une maintenance de la plateforme (sauf pour l'équipe RecipeLog). */
export function MaintenancePage({ message, fin, logout }: { message: string; fin: string | null; logout?: boolean }) {
  return (
    <div className="access-page">
      <div className="access-card">
        <div className="access-logo">
          <span className="mk">
            <ChefHat size={18} />
          </span>
          RecipeLog
        </div>
        <div className="access-icon pf-maint-icon">
          <Wrench size={28} strokeWidth={1.6} />
        </div>
        <h1>Petite pause technique</h1>
        <p className="access-text">{message}</p>
        {fin && <p className="access-note">Retour prévu le {quand(fin)}.</p>}
        <p className="access-note">Tes recettes et tes données ne bougent pas. Recharge la page un peu plus tard.</p>
        {logout && (
          <a href="/auth/deconnexion" className="access-note pf-underline">
            Se déconnecter
          </a>
        )}
      </div>
    </div>
  );
}

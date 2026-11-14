import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { realAccountOf } from "@/lib/auth/viewer";
import { authMode } from "@/lib/auth/config";
import { listerDemandes, type Demande } from "@/lib/auth/passerelle";
import { SupportCenter } from "@/components/settings/SupportCenter";

export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ depuis?: string }> }) {
  const viewer = await requirePage("read");
  const { depuis } = await searchParams;
  const email = realAccountOf(viewer)?.email ?? null;
  const oidc = authMode() === "oidc";

  let demandes: Demande[] = [];
  let erreur: string | null = null;
  if (oidc && email) {
    const r = await listerDemandes(email);
    if (r.ok) demandes = r.demandes;
    else erreur = r.code === "reglage" ? "Le support n'est pas réglé sur ce serveur." : r.message;
  }
  // Seule une adresse du site (commençant par /) est gardée comme « page d'où vient la demande ».
  const page = typeof depuis === "string" && depuis.startsWith("/") && !depuis.startsWith("//") ? depuis.slice(0, 300) : "";

  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Signaler un problème</h1>
        <p className="sub">Un souci, une question ou une idée : l'équipe RecipeLog te répond ici et par e-mail</p>
      </div>
      {oidc && email ? (
        <SupportCenter demandes={demandes} erreur={erreur} email={email} page={page} />
      ) : (
        <p className="sub">Le support intégré n'existe que sur les RecipeLog hébergés par RecipeLog, une fois connecté.</p>
      )}
    </div>
  );
}

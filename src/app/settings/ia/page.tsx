import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { getReglagesIA, versPublic, FOURNISSEURS_IA } from "@/lib/ia/reglages";
import { getQuotaIA } from "@/lib/auth/passerelle";
import { AiSettings } from "@/components/settings/AiSettings";
import { AnalyseSettings } from "@/components/settings/AnalyseSettings";
import { modesAnalyse } from "@/lib/ia/analyse";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await requirePage("site.update");
  const [reglages, modes] = await Promise.all([getReglagesIA().then(versPublic), modesAnalyse()]);
  let quota: { disponible: boolean; limite: number; utilise: number } | null = null;
  if (reglages.plateforme) {
    const q = await getQuotaIA();
    if (q.ok) quota = { disponible: q.quota.disponible, limite: q.quota.limite, utilise: q.quota.utilise };
  }
  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Lecture des factures</h1>
        <p className="sub">Une photo ou un PDF de facture ou de mercuriale devient des lignes de prix, lues par l&apos;IA ou par Claude</p>
      </div>
      <AnalyseSettings initial={modes} />
      <h2 className="sect-title" style={{ marginTop: 18 }}>Lecture par IA</h2>
      <AiSettings initial={reglages} quota={quota} fournisseurs={FOURNISSEURS_IA} iaPlateforme={modes.panel !== "mcp"} />
    </div>
  );
}

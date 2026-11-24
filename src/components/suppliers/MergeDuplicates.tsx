"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Combine } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { doublonsProduits, type ProduitDoublon } from "@/lib/ia/rapprochement";
import { fusionnerDoublons } from "@/app/actions/supplierOrders";

export type ProduitAFusionner = ProduitDoublon & { dernierPrix: number | null; date: string | null };

const prixTxt = (p: ProduitAFusionner) =>
  p.dernierPrix == null ? "sans prix" : `${p.dernierPrix.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} €/${p.priceUnit}${p.date ? ` au ${p.date.split("-").reverse().join("/")}` : ""}`;

/**
 * Fusionner les doublons d'un fournisseur : un même produit enregistré deux fois
 * (« CREME LIQ.35%MG 1L » lu par l'IA, « Crème liquide 35% MG 1 L » déjà là).
 * Les prix du doublon passent dans l'historique du produit gardé, à leur date.
 */
export function MergeDuplicatesModal({ supplierId, products, onClose }: { supplierId: number; products: ProduitAFusionner[]; onClose: () => void }) {
  const router = useRouter();
  const groupes = useMemo(() => doublonsProduits(products), [products]);
  const [garder, setGarder] = useState<Record<number, number>>({});
  const [off, setOff] = useState<Set<number>>(new Set());
  const [faits, setFaits] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function fusionner(cle: number, keepId: number, ids: number[]) {
    setBusy(true);
    setError(null);
    const r = await fusionnerDoublons(supplierId, keepId, ids);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMsg(`${r.merged} doublon${r.merged > 1 ? "s" : ""} fusionné${r.merged > 1 ? "s" : ""} dans « ${r.name} » (${r.prices} prix repris dans son historique).`);
    setFaits((f) => new Set(f).add(cle));
    router.refresh();
  }

  const restants = groupes.filter((g) => !faits.has(g.garder.id));

  return (
    <ModalOverlay title="Fusionner les doublons" onClose={onClose} wide>
      <div style={{ display: "grid", gap: 12 }}>
        <p className="sub" style={{ margin: 0 }}>
          Le même produit enregistré deux fois, souvent par une lecture IA qui l&apos;a écrit en majuscules. Fusionner garde un seul produit :
          les prix du doublon rejoignent son historique, chacun à la date de sa facture.
          <Help title="Fusionner les doublons" example="« CREME LIQ.35%MG 1L BAIGNES UHT FR » fusionné dans « Crème liquide 35% MG 1 L Baignes UHT France ».">
            Rien n&apos;est perdu : les factures restent les mêmes, leurs lignes pointent simplement sur le produit gardé, et l&apos;ingrédient
            des recettes qui suivait le doublon suit le produit gardé. Choisis le nom à garder avec le rond, décoche ce qui n&apos;est pas un
            doublon. Le site ne propose jamais deux produits de % différents (chocolat 64 % / 70 %), de farines différentes, de poids
            différents ou de références différentes. Pour des variantes (Fraise France / Fraise Espagne), utilise plutôt « Regrouper ».
          </Help>
        </p>
        {msg && (
          <p className="ord-ok">
            <Check size={16} /> {msg}
          </p>
        )}
        {error && <span className="ing-fact-msg" data-err="true">{error}</span>}
        {restants.length === 0 && <span className="sub">Aucun doublon trouvé chez ce fournisseur.</span>}
        {restants.map((g) => {
          const membres = [g.garder, ...g.doublons];
          const keepId = garder[g.garder.id] ?? g.garder.id;
          const ids = membres.filter((p) => p.id !== keepId && !off.has(p.id)).map((p) => p.id);
          return (
            <div key={g.garder.id} className="grp-sugg">
              {membres.map((p) => (
                <div key={p.id} className="fus-ligne">
                  <label title="Garder ce nom">
                    <input type="radio" name={`garder-${g.garder.id}`} checked={keepId === p.id} onChange={() => setGarder({ ...garder, [g.garder.id]: p.id })} />
                    {keepId === p.id ? <b>Garder</b> : "Garder"}
                  </label>
                  {keepId === p.id ? (
                    <span />
                  ) : (
                    <label title="Fusionner ce doublon">
                      <input
                        type="checkbox"
                        checked={!off.has(p.id)}
                        onChange={(e) =>
                          setOff((o) => {
                            const n = new Set(o);
                            if (e.target.checked) n.delete(p.id);
                            else n.add(p.id);
                            return n;
                          })
                        }
                      />
                      Fusionner
                    </label>
                  )}
                  <span className="fus-nom">
                    {p.name}
                    <small style={{ color: "var(--muted)" }}>
                      {" "}· {p.lignes} prix · {prixTxt(p)}
                      {p.reference ? ` · réf. ${p.reference}` : ""}
                    </small>
                  </span>
                </div>
              ))}
              <div className="ord-actions">
                <button type="button" className="fl-btn fl-btn-primary" disabled={busy || ids.length === 0} onClick={() => fusionner(g.garder.id, keepId, ids)}>
                  <Combine size={15} /> Fusionner {ids.length > 1 ? `${ids.length} doublons` : ""}
                </button>
                <button type="button" className="fl-btn fl-btn-ghost" onClick={() => setFaits((f) => new Set(f).add(g.garder.id))}>
                  Ignorer
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ModalOverlay>
  );
}

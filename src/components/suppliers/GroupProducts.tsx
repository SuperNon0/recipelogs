"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Layers, Search } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { articleKey } from "@/lib/suppliers";
import { suggestGroups } from "@/lib/supplierOrders";
import { regrouperProduits } from "@/app/actions/supplierOrders";

type P = { id: number; name: string; article: string | null };

/**
 * Regrouper les doublons d'une mercuriale sous un seul article (« Croissant »
 * pour pur beurre, beurre, margarine) : propositions toutes prêtes à cocher,
 * ou choix à la main avec la recherche.
 */
export function GroupProductsModal({ supplierId, products, onClose }: { supplierId: number; products: P[]; onClose: () => void }) {
  const router = useRouter();
  const suggestions = useMemo(() => suggestGroups(products), [products]);
  const [tab, setTab] = useState<"sugg" | "hand">(suggestions.length ? "sugg" : "hand");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [off, setOff] = useState<Set<number>>(new Set());
  const [all, setAll] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // À la main
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [article, setArticle] = useState("");
  const words = articleKey(query).split(" ").filter(Boolean);
  const found = words.length ? products.filter((p) => words.every((w) => articleKey(`${p.name} ${p.article ?? ""}`).includes(w))).slice(0, 200) : [];

  async function run(ids: number[], name: string, key?: string) {
    setBusy(true);
    setError(null);
    const r = await regrouperProduits(supplierId, ids, name);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMsg(`${r.count} produit${r.count > 1 ? "s" : ""} rangé${r.count > 1 ? "s" : ""} sous « ${name} ».`);
    if (key) setDone((d) => new Set(d).add(key));
    else {
      setPicked(new Set());
      setArticle("");
    }
    router.refresh();
  }

  const left = suggestions.filter((g) => !done.has(g.article));

  return (
    <ModalOverlay title="Regrouper les produits" onClose={onClose} wide>
      <div style={{ display: "grid", gap: 12 }}>
        <p className="sub" style={{ margin: 0 }}>
          Les produits regroupés tiennent sur une seule ligne (« Croissant » → pur beurre, beurre, margarine), dans la fiche, dans le
          tableau des prix et dans « Passer une commande ».
          <Help title="Regrouper" example="Croissant pur beurre 70 g, Croissant beurre 60 g, Croissant margarine → « Croissant ».">
            Chaque produit garde son nom et ses prix : on lui donne seulement un nom commun (l&apos;article). Ne regroupe que ce qui se
            remplace : garde séparés les chocolats de % différents, les farines de types différents, les crèmes de matière grasse
            différente. Pour sortir un produit d&apos;un groupe, modifie-le et vide « Comparer sous le nom ».
          </Help>
        </p>
        <div className="sup-chips" role="group" aria-label="Façon de regrouper">
          <button type="button" className="fl-chip" aria-pressed={tab === "sugg"} onClick={() => setTab("sugg")}>
            Propositions ({left.length})
          </button>
          <button type="button" className="fl-chip" aria-pressed={tab === "hand"} onClick={() => setTab("hand")}>
            Choisir à la main
          </button>
        </div>
        {msg && (
          <p className="ord-ok">
            <Check size={16} /> {msg}
          </p>
        )}
        {error && <span className="ing-fact-msg" data-err="true">{error}</span>}

        {tab === "sugg" && (
          <div style={{ display: "grid", gap: 10 }}>
            {left.length === 0 && <span className="sub">Plus de proposition : les produits qui commencent par le même mot sont déjà rangés.</span>}
            {left.map((g) => {
              const name = names[g.article] ?? g.article;
              const ids = g.products.map((p) => p.id).filter((id) => !off.has(id));
              return (
                <div key={g.article} className="grp-sugg">
                  <label>
                    <span className="fl-label" style={{ flex: "none" }}>Regrouper sous</span>
                    <input className="fl-input" value={name} maxLength={200} onChange={(e) => setNames({ ...names, [g.article]: e.target.value })} />
                  </label>
                  {(all.has(g.article) ? g.products : g.products.slice(0, 6)).map((p) => (
                    <label key={p.id}>
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
                      {p.name}
                    </label>
                  ))}
                  {g.products.length > 6 && !all.has(g.article) && (
                    <button type="button" className="fl-btn fl-btn-ghost" style={{ justifySelf: "start" }} onClick={() => setAll((a) => new Set(a).add(g.article))}>
                      Voir les {g.products.length - 6} autres
                    </button>
                  )}
                  <div className="ord-actions">
                    <button type="button" className="fl-btn fl-btn-primary" disabled={busy || ids.length < 2 || !name.trim()} onClick={() => run(ids, name.trim(), g.article)}>
                      <Layers size={15} /> Regrouper {ids.length}
                    </button>
                    <button type="button" className="fl-btn fl-btn-ghost" onClick={() => setDone((d) => new Set(d).add(g.article))}>
                      Ignorer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "hand" && (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="sup-search">
              <Search size={15} style={{ color: "var(--muted)", flex: "none" }} />
              <input className="fl-input" value={query} placeholder="Chercher (ex. croissant)" aria-label="Chercher un produit" onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="grp-sugg" style={{ maxHeight: "40vh", overflow: "auto" }}>
              {!words.length && picked.size === 0 && <span className="sub">Tape un mot pour trouver les produits à regrouper.</span>}
              {[...products.filter((p) => picked.has(p.id) && !found.includes(p)), ...found].map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={(e) => {
                      setPicked((cur) => {
                        const n = new Set(cur);
                        if (e.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      });
                      if (!article && e.target.checked && p.article) setArticle(p.article);
                    }}
                  />
                  {p.name}
                  {p.article && articleKey(p.article) !== articleKey(p.name) && <small style={{ color: "var(--muted)" }}> · {p.article}</small>}
                </label>
              ))}
            </div>
            <label className="ord-field">
              <span className="fl-label">Nom commun</span>
              <input className="fl-input" value={article} maxLength={200} placeholder="Croissant" onChange={(e) => setArticle(e.target.value)} />
            </label>
            <div className="ord-actions">
              <button type="button" className="fl-btn fl-btn-primary" disabled={busy || picked.size < 1 || !article.trim()} onClick={() => run([...picked], article.trim())}>
                <Layers size={15} /> Regrouper {picked.size || ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}

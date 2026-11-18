"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeEuro, Plus, Search } from "lucide-react";
import { useCan } from "@/components/auth/Permissions";
import { EmptyState } from "@/components/EmptyState";
import { Help } from "@/components/ui/Help";
import { formatEuro } from "@/lib/cost";
import { articleKey } from "@/lib/suppliers";
import type { SoldProduct } from "@/lib/soldProducts";
import { setRecipeSold } from "@/app/actions/recipes";

type Sort = "name" | "margin" | "rate";

const pct = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

/** Tableau des produits vendus : coût, prix, marge en € et en %, triable. */
export function SoldProducts({ products, pricedNotSold }: { products: SoldProduct[]; pricedNotSold: { id: number; name: string }[] }) {
  const can = useCan();
  const router = useRouter();
  const [sort, setSort] = useState<Sort>("name");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => {
    const words = articleKey(query).split(" ").filter(Boolean);
    const list = products.filter((p) => words.every((w) => articleKey(p.name).includes(w)));
    const val = (p: SoldProduct) => (sort === "margin" ? p.margin : p.rate) ?? -Infinity;
    return sort === "name" ? list : [...list].sort((a, b) => val(a) - val(b));
  }, [products, sort, query]);

  const withMargin = products.filter((p) => p.rate != null);
  const avg = withMargin.length ? withMargin.reduce((s, p) => s + p.rate!, 0) / withMargin.length : null;
  const low = withMargin.filter((p) => p.rate! < 60).length;

  const add = (id: number) =>
    startTransition(async () => {
      await setRecipeSold(id, true);
      router.refresh();
    });

  return (
    <>
      <div className="page-head">
        <h1>Produits vendus</h1>
        <p className="sub">
          La marge de chaque produit fini coché « Produit vendu ».
          <Help
            title="Produits vendus"
            calc={"marge = prix de vente HT − coût de revient\ntaux = marge ÷ prix HT × 100\ncoefficient = prix TTC ÷ coût"}
            example="Croissant : coût 0,42 €, vendu 1,30 € TTC (1,23 € HT) → marge 0,81 €, 66 %."
          >
            Pour qu&apos;un produit apparaisse ici, coche « Produit vendu » sur sa recette (dans « Modifier », ou dans la carte du coût sur la
            fiche) et tape son prix de vente. Le coût de revient vient des prix de tes ingrédients et sous-recettes : il suit tout seul tes
            dernières factures. Prix à la pièce quand la recette a un rendement, sinon pour la recette entière. Touche un produit pour ouvrir
            sa recette.
          </Help>
        </p>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={BadgeEuro}
          title="Aucun produit vendu pour l'instant"
          description="Ouvre une recette, tape son prix de vente dans la carte du coût et coche « Produit vendu » : elle apparaît ici avec sa marge."
          ctaHref="/"
          ctaLabel="Mes recettes"
        />
      ) : (
        <>
          <div className="sold-kpis">
            <div className="fl-card">
              <span className="kpi-l">Produits</span>
              <b className="num">{products.length}</b>
            </div>
            <div className="fl-card">
              <span className="kpi-l">
                Taux de marge moyen
                <Help title="Taux de marge moyen">La moyenne des taux de marge des produits qui ont un prix et un coût.</Help>
              </span>
              <b className="num">{avg != null ? pct(avg) : "—"}</b>
            </div>
            <div className="fl-card">
              <span className="kpi-l">
                Sous 60 %
                <Help title="Sous 60 %">Les produits dont la marge est faible : à surveiller, ou à revoir le prix.</Help>
              </span>
              <b className="num" style={{ color: low ? "var(--danger)" : undefined }}>{low}</b>
            </div>
          </div>

          <div className="sup-tools">
            <div className="sup-search">
              <Search size={15} style={{ color: "var(--muted)", flex: "none" }} />
              <input className="fl-input" value={query} placeholder="Chercher un produit" aria-label="Chercher un produit" onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="sup-chips" role="group" aria-label="Trier" style={{ margin: 0 }}>
              <button type="button" className="fl-chip" aria-pressed={sort === "name"} onClick={() => setSort("name")}>
                A → Z
              </button>
              <button type="button" className="fl-chip" aria-pressed={sort === "rate"} onClick={() => setSort("rate")}>
                Taux le plus bas
              </button>
              <button type="button" className="fl-chip" aria-pressed={sort === "margin"} onClick={() => setSort("margin")}>
                Marge € la plus basse
              </button>
            </div>
          </div>

          <div className="sold-list">
            <div className="sold-row sold-head" aria-hidden="true">
              <span>Produit</span>
              <span>Coût</span>
              <span>Prix</span>
              <span>Marge</span>
              <span>Taux</span>
            </div>
            {rows.map((p) => {
              const bad = p.margin != null && p.margin < 0;
              const lowRate = p.rate != null && p.rate < 60;
              return (
                <Link key={p.id} href={`/recipes/${p.id}`} className="sold-row">
                  <span className="sold-name">
                    <b>{p.name}</b>
                    <small>
                      par {p.per}
                      {p.missing.length > 0 && (
                        <span className="sold-warn">
                          {" "}
                          · <AlertTriangle size={12} /> {p.missing.length} ingrédient{p.missing.length > 1 ? "s" : ""} sans prix
                        </span>
                      )}
                    </small>
                  </span>
                  <span className="num" data-l="Coût">{p.cost != null ? formatEuro(p.cost) : "—"}</span>
                  <span className="num" data-l="Prix">
                    {p.price != null ? formatEuro(p.price) : <span className="sold-warn">à taper</span>}
                    {p.priceHT != null && p.vat > 0 && <small>{formatEuro(p.priceHT)} HT</small>}
                  </span>
                  <span className="num" data-l="Marge" style={{ color: bad ? "var(--danger)" : p.margin != null ? "var(--accent-2)" : undefined }}>
                    {p.margin != null ? formatEuro(p.margin) : "—"}
                  </span>
                  <span className="num" data-l="Taux" style={{ color: bad || lowRate ? "var(--danger)" : undefined }}>
                    {p.rate != null ? pct(p.rate) : "—"}
                    {p.coef != null && <small>×{p.coef.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</small>}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {can("costs.edit") && pricedNotSold.length > 0 && (
        <>
          <div className="sect-title" style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 6 }}>
            <h2>Ont un prix de vente, pas encore cochés</h2>
            <Help title="Pas encore cochés">Ces recettes ont un prix de vente mais pas la case « Produit vendu ». Touche « Ajouter » pour les mettre dans la liste.</Help>
          </div>
          <div className="fl-list">
            {pricedNotSold.map((r) => (
              <div key={r.id} className="fl-row">
                <span className="set-tx">
                  <b>
                    <Link href={`/recipes/${r.id}`}>{r.name}</Link>
                  </b>
                </span>
                <button type="button" className="fl-btn fl-btn-secondary" disabled={pending} onClick={() => add(r.id)}>
                  <Plus size={15} /> Ajouter
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

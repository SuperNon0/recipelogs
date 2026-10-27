"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatEuro } from "@/lib/cost";
import { Help } from "@/components/ui/Help";
import { PriceInput } from "@/components/PriceInput";

type Row = {
  id: number;
  name: string;
  price: number | null;
  priceUnit: string;
  since: string | null;
  previous: { price: number; unit: string } | null;
};

type Filter = "all" | "missing" | "set";
type Sort = "az" | "recent";

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Ce qui s'affiche sous le nom : depuis quand, et l'écart avec le prix précédent. */
function priceNote(r: Row): string {
  if (r.price == null) return "Pas de prix";
  const parts = r.since ? [`Depuis le ${date(r.since)}`] : [];
  if (r.previous) {
    let p = `avant ${formatEuro(r.previous.price)}/${r.previous.unit}`;
    if (r.previous.unit === r.priceUnit && r.previous.price > 0) {
      const pct = Math.round(((r.price - r.previous.price) / r.previous.price) * 100);
      if (pct !== 0) p += ` (${pct > 0 ? "+" : "−"}${Math.abs(pct)} %)`;
    }
    parts.push(p);
  }
  return parts.join(" · ") || "Prix renseigné";
}

/** Tous les prix d'achat sur une page, modifiables sur place. */
export function IngredientPriceList({ ingredients }: { ingredients: Row[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("az");

  const missing = ingredients.filter((r) => r.price == null).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = ingredients.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q)) &&
        (filter === "all" || (filter === "missing" ? r.price == null : r.price != null)),
    );
    if (sort === "recent") list.sort((a, b) => (b.since ?? "").localeCompare(a.since ?? ""));
    return list;
  }, [ingredients, search, filter, sort]);

  return (
    <>
      <div className="page-head">
        <h1>
          Prix des ingrédients
          <Help title="Prix des ingrédients" example="Beurre à 7,90 € le kg : 250 g de beurre coûtent 1,98 €.">
            Tous tes prix d&apos;achat au même endroit. Tape le prix puis quitte le champ : il est
            enregistré et sert tout de suite au coût de revient des recettes. L&apos;ancien prix est
            gardé dans l&apos;historique de l&apos;ingrédient.
          </Help>
        </h1>
        <p className="sub">
          {ingredients.length - missing} prix renseigné{ingredients.length - missing > 1 ? "s" : ""} sur {ingredients.length} ingrédients
        </p>
      </div>

      <div className="set-toolbar">
        <div className="searchbox">
          <Search size={16} />
          <input
            type="search"
            placeholder="Filtrer par nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filtrer les ingrédients par nom"
          />
        </div>
        <select className="fl-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier">
          <option value="az">De A à Z</option>
          <option value="recent">Prix changés récemment</option>
        </select>
      </div>

      <div className="chips set-catchips">
        <button type="button" className="fl-chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          Tous <b>{ingredients.length}</b>
        </button>
        <button type="button" className="fl-chip" aria-pressed={filter === "missing"} onClick={() => setFilter("missing")}>
          Sans prix <b>{missing}</b>
        </button>
        <button type="button" className="fl-chip" aria-pressed={filter === "set"} onClick={() => setFilter("set")}>
          Avec prix <b>{ingredients.length - missing}</b>
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="set-note">Aucun ingrédient ne correspond.</p>
      ) : (
        <div className="fl-list ing-facts ing-prices">
          {rows.map((r) => (
            <div key={r.id} className="ing-fact">
              <div className="ing-fact-l">
                <Link href={`/settings/ingredients/${r.id}`}>
                  <b>{r.name}</b>
                </Link>
                <small>{priceNote(r)}</small>
              </div>
              <PriceInput id={r.id} initial={r.price} initialUnit={r.priceUnit} label={r.name} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

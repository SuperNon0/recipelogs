"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Search } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { useCan } from "@/components/auth/Permissions";
import { chooseIngredientProduct, getProductChoices, getSearchableProducts } from "@/app/actions/suppliers";
import { formatEuro, lineCost, type PriceUnit } from "@/lib/cost";
import type { AdjIngredient } from "@/lib/massAdjust";
import type { ProductChoice, SearchableProduct } from "@/lib/purchaseOrders";
import { articleKey } from "@/lib/suppliers";

type Group = { key: string; name: string; lines: AdjIngredient[]; cost: number | null };

const SHOWN = 6;

/**
 * Coût ingrédient par ingrédient, avec le produit dont vient le prix
 * (« Guanaja 70 % · Choframa »). Toucher un ingrédient propose tous ses
 * produits, chez tous les fournisseurs, avec ce qu'ils coûtent dans la recette.
 */
export function CostDetail({ lines }: { lines: AdjIngredient[] }) {
  const can = useCan();
  const router = useRouter();
  const [choices, setChoices] = useState<Map<string, ProductChoice>>(new Map());
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const l of lines) {
      if (l.unit === "titre" || l.unit === "QS") continue;
      const key = l.name.trim().toLowerCase();
      const g = m.get(key) ?? { key, name: l.name.trim(), lines: [], cost: null };
      g.lines.push(l);
      const c = lineCost(l);
      if (c != null) g.cost = (g.cost ?? 0) + c;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1));
  }, [lines]);

  const names = useMemo(() => groups.map((g) => g.name), [groups]);
  const load = useCallback(async () => {
    try {
      const list = await getProductChoices(names);
      setChoices(new Map(list.map((c) => [c.name.trim().toLowerCase(), c])));
    } catch {}
  }, [names]);
  useEffect(() => {
    void load();
  }, [load]);

  if (groups.length === 0) return null;
  // Les ingrédients sans prix restent toujours visibles : on les touche pour leur trouver un produit.
  const shown = all ? groups : [...groups.filter((g) => g.cost != null).slice(0, SHOWN), ...groups.filter((g) => g.cost == null)];
  const current = open ? groups.find((g) => g.key === open) : null;

  return (
    <div className="cost-lines" style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: 4 }}>
      {shown.map((g) => {
        const ch = choices.get(g.key);
        const chosen = ch?.options.find((o) => o.productId === ch.chosenProductId);
        // Même sans produit relié, on peut en chercher un chez les fournisseurs.
        const canPick = !!ch && can("costs.edit");
        const label = chosen
          ? `${chosen.name} · ${chosen.supplier}`
          : ch?.manualPrice
            ? ch.options.length
              ? `Prix saisi à la main · ${ch.options.length} produit${ch.options.length > 1 ? "s" : ""} possible${ch.options.length > 1 ? "s" : ""}`
              : "Prix saisi à la main"
            : ch?.options.length
              ? "Choisir un produit"
              : canPick
                ? "Pas de prix · chercher un produit"
                : null;
        const body = (
          <>
            <span style={{ minWidth: 0 }}>
              <b>{g.name}</b>
              {label && <small className={chosen ? "" : "none"}>{label}{canPick ? " ›" : ""}</small>}
            </span>
            <span className="v" style={{ color: g.cost == null ? "var(--muted)" : undefined }}>
              {g.cost == null ? "—" : formatEuro(g.cost)}
            </span>
          </>
        );
        return canPick ? (
          <button key={g.key} type="button" className="cost-line" onClick={() => setOpen(g.key)}>
            {body}
          </button>
        ) : (
          <div key={g.key} className="cost-line">
            {body}
          </div>
        );
      })}
      {(all || shown.length < groups.length) && (
        <button type="button" className="fl-btn fl-btn-ghost" style={{ justifySelf: "start", marginTop: 4 }} onClick={() => setAll(!all)}>
          {all ? "Moins de détail" : `Voir les ${groups.length} ingrédients`}
          <ChevronRight size={14} style={{ transform: all ? "rotate(-90deg)" : "rotate(90deg)" }} />
        </button>
      )}
      {current && choices.get(current.key) && (
        <PickProduct
          group={current}
          choice={choices.get(current.key)!}
          onClose={() => setOpen(null)}
          onChosen={async () => {
            await load();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PickProduct({
  group,
  choice,
  onClose,
  onChosen,
}: {
  group: Group;
  choice: ProductChoice;
  onClose: () => void;
  onChosen: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const costIn = (price: number, unit: PriceUnit) =>
    group.lines.reduce<number | null>((s, l) => {
      const c = lineCost({ ...l, cost: { price, unit } });
      return c == null || s == null ? null : s + c;
    }, 0);
  const cheapest = Math.min(...choice.options.map((o) => o.price));
  const pick = (productId: number) =>
    start(async () => {
      const r = await chooseIngredientProduct(choice.baseId, productId);
      if (!r.ok) return setError(r.error);
      await onChosen();
      onClose();
    });
  const qty = group.lines.reduce((s, l) => s + (l.unit === "g" || l.unit === "ml" ? l.quantityG : 0), 0);

  return (
    <ModalOverlay onClose={onClose} title={`Quel produit pour « ${group.name} » ?`}>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -6 }}>
        {qty > 0 ? `${Math.round(qty).toLocaleString("fr-FR")} g dans cette recette · ` : ""}le prix choisi sert dans toutes tes recettes
        {choice.options.length === 0 && (
          <>
            <br />
            Aucun produit n&apos;est encore relié à cet ingrédient : cherche-le chez tes fournisseurs.
          </>
        )}
      </p>
      {choice.options.map((o) => {
        const c = costIn(o.price, o.unit);
        const on = o.productId === choice.chosenProductId;
        return (
          <button
            key={o.productId}
            type="button"
            className="pick-opt"
            aria-pressed={on}
            disabled={pending}
            onClick={() => pick(o.productId)}
          >
            <span className="pick-rad" />
            <span className="t">
              <b>{o.name}</b>
              <small>
                {o.supplier}
                {o.packLabel ? ` · ${o.packLabel}` : ""}
                {o.date ? ` · ${new Date(o.date).toLocaleDateString("fr-FR")}` : ""}
              </small>
            </span>
            <span className="p">
              {c != null ? formatEuro(c) : "—"}
              <small>
                {formatEuro(o.price)}/{o.unit}
                {choice.options.length > 1 && o.price === cheapest && <span className="pick-cheap">moins cher</span>}
              </small>
            </span>
          </button>
        );
      })}
      <SearchProducts
        ingredient={group.name}
        exclude={choice.options.map((o) => o.productId)}
        costIn={costIn}
        pending={pending}
        open={choice.options.length === 0}
        onPick={pick}
      />
      {error && <p className="ing-fact-msg" data-err="true" style={{ marginTop: 8 }}>{error}</p>}
    </ModalOverlay>
  );
}

const MAX_RESULTS = 30;

/**
 * Chercher un produit chez tous les fournisseurs (filtre par fournisseur +
 * recherche) et le relier à l'ingrédient, sans passer par la page Fournisseurs.
 */
function SearchProducts({
  ingredient,
  exclude,
  costIn,
  pending,
  open: startOpen,
  onPick,
}: {
  ingredient: string;
  exclude: number[];
  costIn: (price: number, unit: PriceUnit) => number | null;
  pending: boolean;
  open: boolean;
  onPick: (productId: number) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [products, setProducts] = useState<SearchableProduct[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState(ingredient);
  const [supplier, setSupplier] = useState<number | null>(null);

  useEffect(() => {
    if (!open || products) return;
    getSearchableProducts()
      .then(setProducts)
      .catch(() => setFailed(true));
  }, [open, products]);

  const suppliers = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of products ?? []) m.set(p.supplierId, p.supplier);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [products]);

  const results = useMemo(() => {
    const words = articleKey(query).split(" ").filter(Boolean);
    return (products ?? []).filter(
      (p) =>
        !exclude.includes(p.productId) &&
        (supplier == null || p.supplierId === supplier) &&
        words.every((w) => articleKey(`${p.name} ${p.article ?? ""} ${p.supplier}`).includes(w)),
    );
  }, [products, query, supplier, exclude]);

  if (!open) {
    return (
      <button type="button" className="fl-btn fl-btn-ghost" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
        <Search size={15} /> Chercher un autre produit chez les fournisseurs
      </button>
    );
  }

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
        Chercher chez les fournisseurs
        <Help title="Chercher un produit">
          Tous les produits de tes factures, chez tous les fournisseurs, avec leur dernier prix. Choisis un fournisseur ou
          tape un mot (« farine », « T45 »…), puis touche le bon produit : il est relié à « {ingredient} » et son prix
          sert pour cet ingrédient dans toutes tes recettes. Les prochaines factures le mettront à jour toutes seules.
        </Help>
      </div>
      {suppliers.length > 1 && (
        <div className="sup-chips" role="group" aria-label="Fournisseur">
          <button type="button" className="fl-chip" aria-pressed={supplier == null} onClick={() => setSupplier(null)}>
            {supplier == null && <Check size={13} />}
            Tous
          </button>
          {suppliers.map((s) => (
            <button key={s.id} type="button" className="fl-chip" aria-pressed={supplier === s.id} onClick={() => setSupplier(s.id)}>
              {supplier === s.id && <Check size={13} />}
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="sup-search">
        <Search size={15} style={{ color: "var(--muted)", flex: "none" }} />
        <input
          className="fl-input"
          value={query}
          placeholder="Chercher un produit"
          aria-label="Chercher un produit"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {failed && <p className="ing-fact-msg" data-err="true">Impossible de charger les produits.</p>}
      {!products && !failed && <p style={{ color: "var(--muted)", fontSize: 13 }}>Chargement…</p>}
      {products && results.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Aucun produit trouvé{query.trim() ? ` pour « ${query.trim()} »` : ""}. Essaie un autre mot ou un autre fournisseur.
        </p>
      )}
      {results.slice(0, MAX_RESULTS).map((p) => {
        const c = costIn(p.price, p.unit);
        return (
          <button key={p.productId} type="button" className="pick-opt" disabled={pending} onClick={() => onPick(p.productId)}>
            <span className="pick-rad" />
            <span className="t">
              <b>{p.name}</b>
              <small>
                {p.supplier}
                {p.packLabel ? ` · ${p.packLabel}` : ""}
                {p.date ? ` · ${new Date(p.date).toLocaleDateString("fr-FR")}` : ""}
                {p.base ? ` · relié à « ${p.base.name} »` : ""}
              </small>
            </span>
            <span className="p">
              {c != null ? formatEuro(c) : "—"}
              <small>
                {formatEuro(p.price)}/{p.unit}
              </small>
            </span>
          </button>
        );
      })}
      {results.length > MAX_RESULTS && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          {results.length - MAX_RESULTS} autres produits : précise ta recherche.
        </p>
      )}
    </div>
  );
}

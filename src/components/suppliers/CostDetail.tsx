"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { useCan } from "@/components/auth/Permissions";
import { chooseIngredientProduct, getProductChoices } from "@/app/actions/suppliers";
import { formatEuro, lineCost, type PriceUnit } from "@/lib/cost";
import type { AdjIngredient } from "@/lib/massAdjust";
import type { ProductChoice } from "@/lib/purchaseOrders";

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
  const shown = all ? groups : groups.slice(0, SHOWN);
  const current = open ? groups.find((g) => g.key === open) : null;

  return (
    <div className="cost-lines" style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: 4 }}>
      {shown.map((g) => {
        const ch = choices.get(g.key);
        const chosen = ch?.options.find((o) => o.productId === ch.chosenProductId);
        const canPick = !!ch && (ch.options.length > 0) && can("costs.edit");
        const label = chosen
          ? `${chosen.name} · ${chosen.supplier}`
          : ch?.manualPrice
            ? ch.options.length
              ? `Prix saisi à la main · ${ch.options.length} produit${ch.options.length > 1 ? "s" : ""} possible${ch.options.length > 1 ? "s" : ""}`
              : "Prix saisi à la main"
            : ch?.options.length
              ? "Choisir un produit"
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
      {groups.length > SHOWN && (
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
  const qty = group.lines.reduce((s, l) => s + (l.unit === "g" || l.unit === "ml" ? l.quantityG : 0), 0);

  return (
    <ModalOverlay onClose={onClose} title={`Quel ${group.name.toLowerCase()} ?`}>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -6 }}>
        {qty > 0 ? `${Math.round(qty).toLocaleString("fr-FR")} g dans cette recette · ` : ""}le prix choisi sert dans toutes tes recettes
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
            onClick={() =>
              start(async () => {
                const r = await chooseIngredientProduct(choice.baseId, o.productId);
                if (!r.ok) return setError(r.error);
                await onChosen();
                onClose();
              })
            }
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
      {error && <p className="ing-fact-msg" data-err="true" style={{ marginTop: 8 }}>{error}</p>}
    </ModalOverlay>
  );
}

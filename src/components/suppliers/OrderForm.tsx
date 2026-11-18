"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, ClipboardCopy, FileText, Plus, Search, Send, ShoppingCart, X } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { formatEuro } from "@/lib/cost";
import { OTHER_FAMILY, SUPPLIER_FAMILIES, articleKey } from "@/lib/suppliers";
import { orderText, qtyLabel, unitEstimate } from "@/lib/supplierOrders";
import type { CatalogProduct, OrderCatalog } from "@/lib/supplierOrdersDb";
import { enregistrerCommande } from "@/app/actions/supplierOrders";
import { copyText, useCanShare } from "./copyText";

/**
 * « Passer une commande » chez un fournisseur : tous ses produits, regroupés
 * par article (« Croissant » → pur beurre, beurre, margarine), avec des
 * boutons 1, 2, 3 et l'unité (carton, sac, kg) pour ne rien taper. La
 * commande en cours reste dans le téléphone tant qu'elle n'est pas envoyée.
 */

type Pick = { q: number; unit: string };
type Picks = Record<string, Pick>;

type Group = {
  key: string;
  article: string;
  family: string;
  products: CatalogProduct[];
  /** Texte de recherche (noms, références) en minuscules sans accents. */
  hay: string;
};

const PAGE = 120;
const plain = (s: string) => articleKey(s);
const pKey = (id: number) => `p:${id}`;
const aKey = (g: Group) => `a:${g.key}`;

function familyRank(f: string) {
  const i = (SUPPLIER_FAMILIES as readonly string[]).indexOf(f);
  return i >= 0 ? i : f === OTHER_FAMILY ? 1000 : 500;
}

function buildGroups(products: CatalogProduct[]): Group[] {
  const map = new Map<string, Group>();
  for (const p of products) {
    const key = plain(p.article);
    let g = map.get(key);
    if (!g) {
      g = { key, article: p.article, family: p.family?.trim() || OTHER_FAMILY, products: [], hay: plain(p.article) };
      map.set(key, g);
    } else if (g.family === OTHER_FAMILY && p.family?.trim()) g.family = p.family.trim();
    g.products.push(p);
    g.hay += ` ${plain(p.name)} ${p.reference ? plain(p.reference) : ""}`;
  }
  return [...map.values()].sort(
    (a, b) => familyRank(a.family) - familyRank(b.family) || a.family.localeCompare(b.family, "fr") || a.article.localeCompare(b.article, "fr", { sensitivity: "base" }),
  );
}

/** Unités proposées pour un article commandé sans choisir la variante : celles de ses variantes. */
function groupUnits(g: Group): string[] {
  const count = new Map<string, number>();
  for (const p of g.products) for (const u of p.units) count.set(u, (count.get(u) ?? 0) + (u === p.units[0] ? 2 : 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, 3);
}

function storageKey(id: number) {
  return `recipelog-commande-${id}`;
}

export function OrderForm({ catalog }: { catalog: OrderCatalog }) {
  const { supplier, products, lastArticles } = catalog;
  const groups = useMemo(() => buildGroups(products), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const byGroupKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);
  const families = useMemo(() => [...new Set(groups.map((g) => g.family))], [groups]);

  const [picks, setPicks] = useState<Picks>({});
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [review, setReview] = useState(false);

  // Brouillon gardé dans le téléphone : on peut quitter la page et revenir.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(supplier.id));
      if (raw) setPicks(JSON.parse(raw) as Picks);
    } catch {
      /* stockage indisponible : on repart d'une commande vide */
    }
    setLoaded(true);
  }, [supplier.id]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (Object.keys(picks).length) localStorage.setItem(storageKey(supplier.id), JSON.stringify(picks));
      else localStorage.removeItem(storageKey(supplier.id));
    } catch {
      /* rien */
    }
  }, [picks, loaded, supplier.id]);

  const setPick = useCallback((key: string, p: Pick | null) => {
    setPicks((cur) => {
      const next = { ...cur };
      if (p && p.q > 0) next[key] = { q: Math.round(p.q * 1000) / 1000, unit: p.unit };
      else delete next[key];
      return next;
    });
  }, []);
  const toggle = useCallback((key: string) => {
    setOpen((cur) => {
      const n = new Set(cur);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const q = plain(query);
  const visible = useMemo(() => {
    const words = q.split(" ").filter(Boolean);
    return groups.filter((g) => {
      if (family && g.family !== family) return false;
      if (onlyMine && !picks[aKey(g)] && !g.products.some((p) => picks[pKey(p.id)])) return false;
      return words.every((w) => g.hay.includes(w));
    });
  }, [groups, q, family, onlyMine, picks]);

  // Affichage par paquets : la page reste rapide même avec une mercuriale de 1 000 produits.
  useEffect(() => setShown(PAGE), [q, family, onlyMine]);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= visible.length) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setShown((s) => s + PAGE), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, visible.length]);

  const lines = useMemo(() => {
    const out: { key: string; label: string; reference: string | null; productId: number | null; quantity: number; unit: string; estimate: number | null }[] = [];
    for (const [key, p] of Object.entries(picks)) {
      if (key.startsWith("p:")) {
        const prod = byId.get(Number(key.slice(2)));
        if (!prod) continue;
        const e = unitEstimate(prod, p.unit);
        out.push({ key, label: prod.name, reference: prod.reference, productId: prod.id, quantity: p.q, unit: p.unit, estimate: e != null ? e * p.q : null });
      } else {
        const g = byGroupKey.get(key.slice(2));
        if (!g) continue;
        out.push({ key, label: g.article, reference: null, productId: null, quantity: p.q, unit: p.unit, estimate: null });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [picks, byId, byGroupKey]);
  const total = lines.reduce((s, l) => s + (l.estimate ?? 0), 0);

  let lastFamily = "";
  return (
    <>
      <div className="page-head">
        <h1>Commande {supplier.name}</h1>
        <p className="sub">
          Touche 1, 2 ou 3 à côté d&apos;un produit, puis « Voir ma commande ».
          <Help
            title="Passer une commande"
            example="Croissant : touche 2 et « carton ». Farine T45 : touche 1 et « sac ». Puis « Voir ma commande » → « Enregistrer et copier » et colle le texte dans un message au commercial."
          >
            Chaque produit a des boutons 1, 2, 3 (et + pour plus) et son conditionnement : carton, sac, kg… Touche le même chiffre pour
            l&apos;enlever. Les produits qui ont plusieurs variantes (« Croissant » : pur beurre, margarine…) sont regroupés : commande
            l&apos;article directement, ou touche la flèche pour choisir une variante. Ta commande en cours reste gardée sur ce téléphone
            même si tu quittes la page. Le prix affiché est une estimation d&apos;après le dernier prix connu.
          </Help>
        </p>
      </div>

      <div className="ord-tools">
        <div className="sup-search">
          <Search size={15} style={{ color: "var(--muted)", flex: "none" }} />
          <input className="fl-input" value={query} placeholder="Chercher un produit ou une référence" aria-label="Chercher un produit" onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label="Effacer la recherche" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          )}
        </div>
        <div className="ord-chips" role="group" aria-label="Familles">
          <button type="button" className="fl-chip" aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
            <ShoppingCart size={13} /> Ma commande ({lines.length})
          </button>
          {families.length > 1 && (
            <>
              <button type="button" className="fl-chip" aria-pressed={family == null} onClick={() => setFamily(null)}>
                Tout ({groups.length})
              </button>
              {families.map((f) => (
                <button key={f} type="button" className="fl-chip" aria-pressed={family === f} onClick={() => setFamily(family === f ? null : f)}>
                  {f}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="ord-list">
        {products.length === 0 && <div className="fl-row" style={{ color: "var(--muted)" }}>Ce fournisseur n&apos;a pas encore de produit.</div>}
        {products.length > 0 && visible.length === 0 && <div className="fl-row" style={{ color: "var(--muted)" }}>Aucun produit ne correspond.</div>}
        {visible.slice(0, shown).map((g) => {
          const head = !q && !family && g.family !== lastFamily ? g.family : null;
          lastFamily = g.family;
          const several = g.products.length > 1;
          return (
            <div key={g.key} className="ord-group">
              {head && <div className="ord-family">{head}</div>}
              {several ? (
                <>
                  <ArticleRow
                    group={g}
                    pick={picks[aKey(g)]}
                    variantsPicked={g.products.filter((p) => picks[pKey(p.id)]).length}
                    expanded={open.has(g.key) || (!!q && !plain(g.article).includes(q))}
                    last={lastArticles[g.article.toLowerCase()] ?? null}
                    onPick={setPick}
                    onToggle={toggle}
                  />
                  {(open.has(g.key) || (!!q && !plain(g.article).includes(q))) &&
                    g.products.map((p) => <ProductRow key={p.id} product={p} pick={picks[pKey(p.id)]} variant onPick={setPick} />)}
                </>
              ) : (
                <ProductRow product={g.products[0]} pick={picks[pKey(g.products[0].id)]} onPick={setPick} />
              )}
            </div>
          );
        })}
        {shown < visible.length && (
          <div ref={sentinel} className="ord-more">
            <button type="button" className="fl-btn fl-btn-ghost" onClick={() => setShown((s) => s + PAGE)}>
              Afficher la suite ({visible.length - shown})
            </button>
          </div>
        )}
      </div>

      <div className="ord-bar" data-empty={lines.length === 0 || undefined}>
        <span className="ord-bar-tx">
          <b>{lines.length === 0 ? "Commande vide" : `${lines.length} produit${lines.length > 1 ? "s" : ""}`}</b>
          {total > 0 && <small>≈ {formatEuro(total)} HT</small>}
        </span>
        {lines.length > 0 && (
          <button type="button" className="fl-btn fl-btn-ghost" onClick={() => setPicks({})}>
            Vider
          </button>
        )}
        <button type="button" className="fl-btn fl-btn-primary" disabled={lines.length === 0} onClick={() => setReview(true)}>
          <ShoppingCart size={15} /> Voir ma commande
        </button>
      </div>

      {review && (
        <ReviewModal
          supplier={supplier}
          lines={lines}
          total={total}
          defaultPlace={catalog.lastPlace}
          onRemove={(k) => setPick(k, null)}
          onClose={() => setReview(false)}
          onSaved={() => setPicks({})}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Lignes
// ─────────────────────────────────────────────

function QtyButtons({ pick, units, pickKey, onPick }: { pick?: Pick; units: string[]; pickKey: string; onPick: (k: string, p: Pick | null) => void }) {
  const unit = pick?.unit && units.includes(pick.unit) ? pick.unit : units[0];
  const q = pick?.q ?? 0;
  return (
    <span className="ord-qty">
      {[1, 2, 3].map((n) => (
        <button key={n} type="button" className="ord-n" aria-pressed={q === n} aria-label={`${n} ${unit}`} onClick={() => onPick(pickKey, q === n ? null : { q: n, unit })}>
          {n}
        </button>
      ))}
      <button type="button" className="ord-n" aria-pressed={q > 3} aria-label="Un de plus" onClick={() => onPick(pickKey, { q: q + 1, unit })}>
        {q > 3 ? q.toLocaleString("fr-FR") : <Plus size={14} />}
      </button>
      {units.length > 1 && (
        <span className="ord-units" role="group" aria-label="Unité">
          {units.map((u) => (
            <button key={u} type="button" className="ord-u" aria-pressed={u === unit} onClick={() => onPick(pickKey, { q: q || 1, unit: u })}>
              {u}
            </button>
          ))}
        </span>
      )}
      {units.length === 1 && <span className="ord-u-one">{unit}</span>}
    </span>
  );
}

const ProductRow = memo(function ProductRow({ product: p, pick, variant, onPick }: { product: CatalogProduct; pick?: Pick; variant?: boolean; onPick: (k: string, p: Pick | null) => void }) {
  const unit = pick?.unit ?? p.units[0];
  const est = unitEstimate(p, unit);
  const info = [
    p.packSize && p.packSize > 1 ? `${p.packName} de ${p.packSize.toLocaleString("fr-FR")} ${p.priceUnit === "pièce" ? "pièces" : p.priceUnit}` : null,
    est != null ? `${formatEuro(est)} le ${unit}` : "pas de prix",
    p.reference ? `réf. ${p.reference}` : null,
    p.last ? `dernière fois : ${qtyLabel(p.last.quantity, p.last.unit)}` : null,
  ].filter(Boolean);
  return (
    <div className="ord-row" data-on={!!pick || undefined} data-variant={variant || undefined}>
      <span className="ord-name">
        <b>{p.name}</b>
        <small>{info.join(" · ")}</small>
      </span>
      <QtyButtons pick={pick} units={p.units} pickKey={pKey(p.id)} onPick={onPick} />
    </div>
  );
});

const ArticleRow = memo(function ArticleRow({
  group: g,
  pick,
  variantsPicked,
  expanded,
  last,
  onPick,
  onToggle,
}: {
  group: Group;
  pick?: Pick;
  variantsPicked: number;
  expanded: boolean;
  last: { quantity: number; unit: string } | null;
  onPick: (k: string, p: Pick | null) => void;
  onToggle: (k: string) => void;
}) {
  const units = useMemo(() => groupUnits(g), [g]);
  return (
    <div className="ord-row ord-article" data-on={!!pick || variantsPicked > 0 || undefined}>
      <button type="button" className="ord-name ord-toggle" aria-expanded={expanded} onClick={() => onToggle(g.key)}>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>
          <b>{g.article}</b>
          <small>
            {g.products.length} variantes{variantsPicked ? ` · ${variantsPicked} choisie${variantsPicked > 1 ? "s" : ""}` : ""}
            {last ? ` · dernière fois : ${qtyLabel(last.quantity, last.unit)}` : ""}
          </small>
        </span>
      </button>
      <QtyButtons pick={pick} units={units} pickKey={aKey(g)} onPick={onPick} />
    </div>
  );
});

// ─────────────────────────────────────────────
// Ma commande
// ─────────────────────────────────────────────

type Line = { key: string; label: string; reference: string | null; productId: number | null; quantity: number; unit: string; estimate: number | null };

function ReviewModal({
  supplier,
  lines,
  total,
  defaultPlace,
  onRemove,
  onClose,
  onSaved,
}: {
  supplier: { id: number; name: string };
  lines: Line[];
  total: number;
  defaultPlace: string | null;
  onRemove: (key: string) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [place, setPlace] = useState(defaultPlace ?? "");
  const [delivery, setDelivery] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: number; text: string; copied: boolean } | null>(null);
  const [copiedOnly, setCopiedOnly] = useState(false);
  const canShare = useCanShare();

  useEffect(() => {
    if (defaultPlace) return;
    try {
      const p = localStorage.getItem("recipelog-commande-lieu");
      if (p) setPlace(p);
    } catch {
      /* rien */
    }
  }, [defaultPlace]);

  const text = orderText({ supplier: supplier.name, place, deliveryDate: delivery || null, note, lines });

  async function save() {
    setBusy(true);
    setError(null);
    const r = await enregistrerCommande({
      supplierId: supplier.id,
      place,
      deliveryDate: delivery || null,
      note,
      lines: lines.map((l) => ({ productId: l.productId, label: l.productId ? null : l.label, quantity: l.quantity, unit: l.unit })),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    try {
      if (place.trim()) localStorage.setItem("recipelog-commande-lieu", place.trim());
    } catch {
      /* rien */
    }
    const copied = await copyText(text);
    setSaved({ id: r.id, text, copied });
    onSaved();
  }

  if (saved) {
    return (
      <ModalOverlay title="Commande enregistrée" onClose={onClose}>
        <div style={{ display: "grid", gap: 12 }}>
          <p className="ord-ok">
            <Check size={16} /> {saved.copied ? "Texte copié : colle-le dans un message au commercial." : "Commande enregistrée. Touche « Copier le texte » pour l'envoyer."}
          </p>
          <pre className="ord-text">{saved.text}</pre>
          <div className="ord-actions">
            <button type="button" className="fl-btn fl-btn-secondary" onClick={async () => setSaved({ ...saved, copied: await copyText(saved.text) })}>
              <ClipboardCopy size={15} /> Copier le texte
            </button>
            {canShare && (
              <button type="button" className="fl-btn fl-btn-secondary" onClick={() => navigator.share({ text: saved.text }).catch(() => undefined)}>
                <Send size={15} /> Envoyer…
              </button>
            )}
            <a className="fl-btn fl-btn-secondary" href={`/api/commandes/${saved.id}/pdf`} target="_blank" rel="noreferrer">
              <FileText size={15} /> Voir le PDF
            </a>
            <Link className="fl-btn fl-btn-ghost" href={`/fournisseurs/commandes/${saved.id}`}>
              Ouvrir la commande
            </Link>
          </div>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay title={`Ma commande · ${supplier.name}`} onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div className="ord-review">
          {lines.map((l) => (
            <div key={l.key} className="ord-review-row">
              <b className="num">{qtyLabel(l.quantity, l.unit)}</b>
              <span>
                {l.label}
                {l.productId == null && <small> (variante au choix du commercial)</small>}
              </span>
              <span className="num ord-review-price">{l.estimate != null ? formatEuro(l.estimate) : ""}</span>
              <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label={`Retirer ${l.label}`} onClick={() => onRemove(l.key)}>
                <X size={15} />
              </button>
            </div>
          ))}
          {total > 0 && (
            <div className="ord-review-total">
              Total estimé : <b className="num">{formatEuro(total)} HT</b>
            </div>
          )}
        </div>
        <label className="ord-field">
          <span className="fl-label">
            Lieu de livraison
            <Help title="Lieu de livraison" example="Boutique rue Nationale, ou Labo.">
              Où le fournisseur doit livrer. Il est écrit dans le message et sur le PDF, et repris tout seul à la prochaine commande.
            </Help>
          </span>
          <input className="fl-input" value={place} maxLength={200} placeholder="Boutique, labo…" onChange={(e) => setPlace(e.target.value)} />
        </label>
        <label className="ord-field">
          <span className="fl-label">
            Livraison souhaitée
            <Help title="Livraison souhaitée">Facultatif. Le jour où tu veux être livré, écrit dans le message.</Help>
          </span>
          <input className="fl-input" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        </label>
        <label className="ord-field">
          <span className="fl-label">
            Remarque
            <Help title="Remarque">Facultatif. Ajoutée à la fin du message (« livrer avant 7 h », « porte de derrière »…).</Help>
          </span>
          <textarea className="fl-input" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <span className="ing-fact-msg" data-err="true">{error}</span>}
        <div className="ord-actions">
          <button type="button" className="fl-btn fl-btn-primary" disabled={busy || lines.length === 0} onClick={save}>
            <Check size={15} /> {busy ? "Enregistrement…" : "Enregistrer et copier"}
          </button>
          <button
            type="button"
            className="fl-btn fl-btn-ghost"
            onClick={async () => {
              setCopiedOnly(await copyText(text));
              setTimeout(() => setCopiedOnly(false), 2500);
            }}
          >
            <ClipboardCopy size={15} /> {copiedOnly ? "Copié" : "Copier sans enregistrer"}
          </button>
          <Help title="Enregistrer et copier">
            « Enregistrer et copier » garde la commande (avec son PDF) dans l&apos;historique des commandes, à la date d&apos;aujourd&apos;hui, et
            copie le texte pour le coller dans un message au commercial. « Copier sans enregistrer » copie seulement le texte.
          </Help>
        </div>
      </div>
    </ModalOverlay>
  );
}

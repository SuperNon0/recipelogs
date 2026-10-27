"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Circle,
  CircleDot,
  ExternalLink,
  Layers,
  ListTree,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { formatCoef, formatG, formatGDecimal, formatYield } from "@/lib/format";
import { resolveLink, type TreeNode } from "@/lib/recipeTree";
import { adjustToTarget, ingMass, recipeMass, roundScaled, scaledUnit, type AdjIngredient } from "@/lib/massAdjust";
import {
  moveSubRecipe,
  removeSubRecipe,
  toggleSubRecipeLock,
  updateSubRecipe,
} from "@/app/actions/subRecipes";
import { applyMultiplierToRecipe, setRecipeSaleCoef } from "@/app/actions/recipes";
import { DEFAULT_SALE_COEF, costOf, formatEuro, type IngredientPrice } from "@/lib/cost";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { ContextArea, MoreButton, type MenuSpec } from "./ui/Menu";
import { AddSubRecipeDialog, SUB_MODE_HELP } from "./AddSubRecipeModal";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type IngredientRow = {
  id: number;
  name: string;
  quantityG: number;
  quantityGMax?: number | null;
  unit?: string;
  /** Poids d'une pièce (fiche de l'ingrédient). */
  pieceG?: number | null;
  /** Prix d'achat (fiche de l'ingrédient). */
  cost?: IngredientPrice | null;
};

/** Rendement de la recette à ×1 : « 40 financiers ». */
export type YieldInfo = { count: number; label: string };

export type SubRecipeRow = {
  id: number;
  childId: number;
  childName: string;
  label: string;
  calcMode: "coefficient" | "mass_target" | "pivot_ingredient";
  calcValue: number;
  pivotIngredientId: number | null;
  isLocked: boolean;
  isExact: boolean;
  childIngredients: IngredientRow[];
  childSteps: string | null;
  childTree: TreeNode;
};

type Mode = "coefficient" | "mass_target" | "pivot_ingredient";
/** Modes du multiplicateur : ceux des sous-recettes + « Pièces » (viser un rendement). */
type MultMode = Mode | "pieces";

const fmtNum = (n: number, max = 2) => n.toLocaleString("fr-FR", { maximumFractionDigits: max });

// ─────────────────────────────────────────────
// Composant principal : indicateurs + tableau
// ─────────────────────────────────────────────

/**
 * Onglet « Recette » : masse totale, multiplicateur, base, puis le tableau des
 * ingrédients avec les sous-recettes dépliables (menu « ⋯ » / clic droit sur
 * chaque sous-recette).
 */
export function RecipeBody({
  recipeId,
  ingredients,
  subRecipes,
  yieldInfo,
  saleCoef,
}: {
  recipeId: number;
  ingredients: IngredientRow[];
  subRecipes: SubRecipeRow[];
  yieldInfo?: YieldInfo | null;
  /** Coefficient de vente enregistré sur la recette (null = défaut). */
  saleCoef?: number | null;
}) {
  const baseTotalG = useMemo(() => recipeMass(ingredients).avg, [ingredients]);

  const [mode, setMode] = useState<MultMode>("coefficient");
  const [coefInput, setCoefInput] = useState("1");
  const [piecesInput, setPiecesInput] = useState(String(yieldInfo?.count ?? ""));
  const [massInput, setMassInput] = useState(String(Math.round(baseTotalG)));
  const [pivotId, setPivotId] = useState<number | null>(ingredients[0]?.id ?? null);
  const [pivotInput, setPivotInput] = useState(
    ingredients[0] ? String(Math.round(ingMass(ingredients[0].quantityG, ingredients[0].unit ?? "g", ingredients[0].pieceG))) : "0",
  );
  const [decimals, setDecimals] = useState(true);
  const [locks, setLocks] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(subRecipes.map((s) => [s.id, s.isLocked])),
  );
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState(false);

  const num = (s: string) => Number(s.replace(",", "."));

  const globalCoef = useMemo(() => {
    if (mode === "coefficient") {
      const v = num(coefInput);
      return Number.isFinite(v) && v > 0 ? v : 1;
    }
    if (mode === "mass_target") {
      const target = num(massInput);
      if (!Number.isFinite(target) || target <= 0 || baseTotalG <= 0) return 1;
      return target / baseTotalG;
    }
    if (mode === "pieces") {
      const wanted = num(piecesInput);
      if (!yieldInfo || !Number.isFinite(wanted) || wanted <= 0) return 1;
      return wanted / yieldInfo.count;
    }
    const pivot = ingredients.find((i) => i.id === pivotId);
    const target = num(pivotInput);
    // La quantité voulue est saisie en grammes : on compare à la masse en
    // grammes du pivot (ingMass convertit L/cc/cs/pièces), pas à sa valeur brute.
    const pivotBaseG = pivot ? ingMass(pivot.quantityG, pivot.unit ?? "g", pivot.pieceG) : 0;
    if (!pivot || !Number.isFinite(target) || target <= 0 || pivotBaseG <= 0) return 1;
    return target / pivotBaseG;
  }, [mode, coefInput, massInput, piecesInput, yieldInfo, pivotId, pivotInput, ingredients, baseTotalG]);

  const reset = () => {
    setMode("coefficient");
    setCoefInput("1");
    setMassInput(String(Math.round(baseTotalG)));
    setPiecesInput(String(yieldInfo?.count ?? ""));
    if (ingredients[0]) {
      setPivotId(ingredients[0].id);
      setPivotInput(String(Math.round(ingMass(ingredients[0].quantityG, ingredients[0].unit ?? "g", ingredients[0].pieceG))));
    }
  };

  // Quantités des ingrédients de la recette elle-même
  const own = useMemo(() => {
    const scaled: AdjIngredient[] = ingredients.map((ing) => {
      const r = decimals ? (x: number) => x : (x: number) => roundScaled(x, ing.unit);
      const k = ing.unit === "L" ? globalCoef * 1000 : globalCoef;
      return {
        name: ing.name,
        quantityG: r(ing.quantityG * k),
        quantityGMax: ing.quantityGMax != null ? r(ing.quantityGMax * k) : null,
        unit: scaledUnit(ing.unit),
        pieceG: ing.pieceG ?? null,
        cost: ing.cost ?? null,
      };
    });
    if (mode === "mass_target" && !decimals) {
      const target = num(massInput);
      if (Number.isFinite(target) && target > 0) {
        const a = adjustToTarget(scaled, target);
        return { rows: a.ingredients, min: a.totalMassGMin, max: a.totalMassGMax };
      }
    }
    const { min, max } = recipeMass(scaled);
    return { rows: scaled, min, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients, globalCoef, decimals, mode, massInput]);

  // Sous-recettes au multiplicateur courant, et à ×1 (pour la « base »)
  const subs = useMemo(
    () =>
      subRecipes.map((sr) => ({
        sr,
        calc: resolveLink(
          {
            calcMode: sr.calcMode,
            calcValue: sr.calcValue,
            pivotIngredientId: sr.pivotIngredientId,
            isLocked: locks[sr.id] ?? sr.isLocked,
            isExact: sr.isExact,
            child: sr.childTree,
          },
          globalCoef,
        ),
      })),
    [subRecipes, globalCoef, locks],
  );
  const subBase = useMemo(
    () =>
      subRecipes.reduce((s, sr) => {
        const c = resolveLink(
          {
            calcMode: sr.calcMode,
            calcValue: sr.calcValue,
            pivotIngredientId: sr.pivotIngredientId,
            isLocked: locks[sr.id] ?? sr.isLocked,
            isExact: sr.isExact,
            child: sr.childTree,
          },
          1,
        );
        return s + (c.min + c.max) / 2;
      }, 0),
    [subRecipes, locks],
  );

  const ownAvg = (own.min + own.max) / 2;
  const subsAvg = subs.reduce((s, x) => s + (x.calc.min + x.calc.max) / 2, 0);
  const grandTotal = ownAvg + subsAvg;
  const grandBase = baseTotalG + subBase;
  const fmt = decimals ? formatGDecimal : formatG;
  const pct = (g: number) => (grandTotal > 0 ? `${Math.round((g / grandTotal) * 100)} %` : "");

  const massCalc = [
    `Ingrédients ${formatCoef(globalCoef)}`.padEnd(26) + fmt(ownAvg),
    ...subs.map((x) =>
      `${x.sr.label}${locks[x.sr.id] ? " (fixe)" : ` ${formatCoef(x.calc.effectiveCoef)}`}`.slice(0, 25).padEnd(26) +
      formatG((x.calc.min + x.calc.max) / 2),
    ),
    "─".repeat(32),
    "Total".padEnd(26) + fmt(grandTotal),
  ].join("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-l">
            Masse totale
            <Help
              title="Masse totale"
              calc={massCalc}
              example={<>Au multiplicateur ×2, une recette de 570 g passe à 1 140 g (sauf les sous-recettes verrouillées, qui gardent leur poids).</>}
            >
              Le poids de tout ce qui se pèse dans la recette, sous-recettes comprises, avec le
              multiplicateur appliqué. 1 cc ≈ 5 g, 1 cs ≈ 15 g, 1 L = 1 000 g. Une pièce (œuf…)
              compte si son poids est réglé sur la fiche de l&apos;ingrédient ; « QS » ne compte pas.
            </Help>
          </div>
          <div className="kpi-v num">
            {own.min !== own.max && subs.length === 0 ? (
              <>
                {fmt(own.min)}
                <small>à {fmt(own.max)}</small>
              </>
            ) : (
              fmt(grandTotal)
            )}
          </div>
          {subs.length > 0 && (
            <div className="kpi-s">
              dont {fmt(ownAvg)} d&apos;ingrédients · {formatG(subsAvg)} de sous-recettes
            </div>
          )}
          {yieldInfo && (
            <div className="kpi-s" style={{ color: "var(--soft)" }}>
              Rendement : {formatYield(Math.round(yieldInfo.count * globalCoef * 10) / 10, yieldInfo.label, grandTotal)}
            </div>
          )}
        </div>

        <MultiplierCard
          recipeId={recipeId}
          hasSubRecipes={subRecipes.length > 0}
          mode={mode}
          setMode={setMode}
          coefInput={coefInput}
          setCoefInput={setCoefInput}
          massInput={massInput}
          setMassInput={setMassInput}
          pivotId={pivotId}
          setPivotId={setPivotId}
          pivotInput={pivotInput}
          setPivotInput={setPivotInput}
          ingredients={ingredients}
          yieldInfo={yieldInfo ?? null}
          piecesInput={piecesInput}
          setPiecesInput={setPiecesInput}
          globalCoef={globalCoef}
          onReset={reset}
          decimals={decimals}
          setDecimals={setDecimals}
        />

        <div className="kpi">
          <div className="kpi-l">
            Base (×1)
            <Help title="Base de la recette" calc={`Ingrédients`.padEnd(26) + formatG(baseTotalG) + (subRecipes.length ? `\nSous-recettes`.padEnd(27) + formatG(subBase) : "")}>
              La masse de la recette telle qu&apos;elle est enregistrée, sans multiplicateur. «
              Enregistrer comme base » dans le multiplicateur remplace ces quantités.
            </Help>
          </div>
          <div className="kpi-v num">{formatG(grandBase)}</div>
          {globalCoef !== 1 && <div className="kpi-s">{formatCoef(globalCoef)} appliqué</div>}
        </div>
      </div>

      <div className="itable">
        <div className="irow ihead">
          <span />
          <span>Ingrédient</span>
          <span className="q">Quantité</span>
          <span className="p desk-only">
            % masse
            <Help title="% de la masse" calc="% = masse de la ligne ÷ masse totale × 100" example="300 g de purée dans une recette de 1 500 g : 20 %.">
              La part de chaque ingrédient ou sous-recette dans la masse totale (sous-recettes
              comprises). Pratique pour comparer deux recettes.
            </Help>
          </span>
          <span />
        </div>

        {ingredients.length === 0 && subRecipes.length === 0 && (
          <div className="irow">
            <span />
            <span style={{ color: "var(--muted)" }}>Aucun ingrédient.</span>
          </div>
        )}

        {ingredients.map((ing, idx) => (
          <OwnRow key={ing.id} ing={ing} adj={own.rows[idx]} decimals={decimals} pct={pct} />
        ))}

        {subs.map(({ sr, calc }, i) => (
          <SubRows
            key={sr.id}
            parentId={recipeId}
            sr={sr}
            calc={calc}
            locked={locks[sr.id] ?? sr.isLocked}
            setLocked={(v) => setLocks((p) => ({ ...p, [sr.id]: v }))}
            open={!!open[sr.id]}
            setOpen={(v) => setOpen((p) => ({ ...p, [sr.id]: v }))}
            pct={pct}
            first={i === 0}
            last={i === subs.length - 1}
          />
        ))}

        <button type="button" className="irow iadd" onClick={() => setAdding(true)}>
          <Plus size={15} />
          <span>Ajouter une sous-recette</span>
        </button>

        <div className="irow itotal">
          <span />
          <span>Total</span>
          <span className="q num">
            {own.min !== own.max && subs.length === 0 ? `${fmt(own.min)} à ${fmt(own.max)}` : fmt(grandTotal)}
          </span>
          <span className="p desk-only" />
          <span />
        </div>
      </div>

      <CostCard
        recipeId={recipeId}
        lines={[...own.rows, ...subs.flatMap((x) => x.calc.ingredients)]}
        pieces={yieldInfo ? { count: yieldInfo.count * globalCoef, label: yieldInfo.label } : null}
        initialCoef={saleCoef ?? DEFAULT_SALE_COEF}
      />

      {adding && <AddSubRecipeDialog parentId={recipeId} onClose={() => setAdding(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Ligne d'ingrédient
// ─────────────────────────────────────────────

function OwnRow({
  ing,
  adj,
  decimals,
  pct,
}: {
  ing: IngredientRow;
  adj: AdjIngredient;
  decimals: boolean;
  pct: (g: number) => string;
}) {
  const show = (n: number) => (decimals ? fmtNum(n) : roundScaled(n, adj.unit).toLocaleString("fr-FR"));
  const spoon = ing.unit === "cc" ? 5 : ing.unit === "cs" ? 15 : ing.unit === "pièce" ? (ing.pieceG ?? 0) : 0;
  const avg = (adj.quantityG + (adj.quantityGMax ?? adj.quantityG)) / 2;
  const mass = ingMass(avg, adj.unit, adj.pieceG);
  return (
    <div className="irow">
      <span />
      <span className="n">{ing.name}</span>
      <span className="q num">
        {ing.unit === "QS" ? (
          <b style={{ color: "var(--accent)" }}>QS</b>
        ) : (
          <>
            {show(adj.quantityG)}
            {adj.quantityGMax != null && <>–{show(adj.quantityGMax)}</>} <span className="u">{adj.unit}</span>
            {spoon > 0 && <span className="u"> (≈ {fmtNum(avg * spoon, 0)} g)</span>}
          </>
        )}
      </span>
      <span className="p desk-only num">{mass > 0 ? pct(mass) : ""}</span>
      <span />
    </div>
  );
}

// ─────────────────────────────────────────────
// Sous-recette : ligne + ingrédients dépliés + menu
// ─────────────────────────────────────────────

function SubRows({
  parentId,
  sr,
  calc,
  locked,
  setLocked,
  open,
  setOpen,
  pct,
  first,
  last,
}: {
  parentId: number;
  sr: SubRecipeRow;
  calc: ReturnType<typeof resolveLink>;
  locked: boolean;
  setLocked: (v: boolean) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  pct: (g: number) => string;
  first: boolean;
  last: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const avg = (calc.min + calc.max) / 2;
  const mass = calc.min !== calc.max ? `${formatG(calc.min)}–${formatG(calc.max)}` : formatG(calc.min);
  const pivotName = sr.pivotIngredientId ? sr.childIngredients.find((i) => i.id === sr.pivotIngredientId)?.name : null;

  const setLock = (v: boolean) => {
    if (v === locked) return;
    setLocked(v);
    startTransition(() => toggleSubRecipeLock(sr.id, parentId));
  };

  const spec = (): MenuSpec => ({
    title: `Sous-recette : ${sr.label}`,
    icon: Layers,
    head: (
      <>
        <span style={{ width: 44, height: 44, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: "var(--accent-dim)", color: "var(--accent)" }}>
          <Layers size={20} />
        </span>
        <div>
          <b>{sr.label}</b>
          <small>{sr.childName} · {mass}</small>
        </div>
      </>
    ),
    items: [
      { label: "Ouvrir la recette d'origine", icon: ExternalLink, href: `/recipes/${sr.childId}` },
      { label: open ? "Replier les ingrédients" : "Déplier les ingrédients", icon: ListTree, onSelect: () => setOpen(!open) },
      { section: "Quand on change le multiplicateur" },
      { label: "Suit le multiplicateur", icon: locked ? Circle : CircleDot, checked: !locked, onSelect: () => setLock(false) },
      { label: "Garde sa quantité (verrouillée)", icon: locked ? CircleDot : Circle, checked: locked, onSelect: () => setLock(true) },
      { separator: true },
      { label: "Régler la quantité…", icon: SlidersHorizontal, onSelect: () => setEditing(true) },
      { label: "Monter", icon: ArrowUp, disabled: first, onSelect: () => startTransition(async () => { await moveSubRecipe(sr.id, parentId, -1); }) },
      { label: "Descendre", icon: ArrowDown, disabled: last, onSelect: () => startTransition(async () => { await moveSubRecipe(sr.id, parentId, 1); }) },
      { separator: true },
      {
        label: "Retirer de la recette",
        icon: XCircle,
        danger: true,
        onSelect: () => {
          if (confirm(`Retirer la sous-recette « ${sr.label} » ? La recette d'origine n'est pas supprimée.`)) {
            startTransition(() => removeSubRecipe(sr.id, parentId));
          }
        },
      },
    ],
  });

  const tag =
    locked ? (
      <span className="fl-tag" style={{ color: "var(--lock)", borderColor: "rgba(143,156,240,.35)", background: "rgba(143,156,240,.08)" }}>
        <Lock size={11} /> fixe
      </span>
    ) : sr.calcMode === "pivot_ingredient" ? (
      <span className="fl-tag" title={pivotName ? `Pivot : ${pivotName}` : undefined}>pivot</span>
    ) : (
      <span className="fl-tag num">{formatCoef(calc.effectiveCoef)}</span>
    );

  return (
    <>
      <ContextArea spec={spec} className={`irow isub${locked ? " locked" : ""}`}>
        <button type="button" className="ichev" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Replier" : "Déplier"}>
          <ChevronRight size={15} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 120ms" }} />
        </button>
        <span className="n" onClick={() => setOpen(!open)}>
          <b>{sr.label}</b>
          {sr.label !== sr.childName && <small className="desk-only">{sr.childName}</small>}
          {tag}
        </span>
        <span className="q num">{mass}</span>
        <span className="p desk-only num">{pct(avg)}</span>
        <MoreButton spec={spec} label={`Actions pour la sous-recette ${sr.label}`} />
      </ContextArea>
      {open &&
        calc.ingredients.map((ing, i) => (
          <div className="irow ichild" key={i}>
            <span />
            <span className="n">{ing.name}</span>
            <span className="q num">
              {ing.unit === "QS" ? (
                <b style={{ color: "var(--accent)" }}>QS</b>
              ) : (
                <>
                  {ing.quantityG.toLocaleString("fr-FR")}
                  {ing.quantityGMax != null && <>–{ing.quantityGMax.toLocaleString("fr-FR")}</>} <span className="u">{ing.unit}</span>
                </>
              )}
            </span>
            <span className="p desk-only" />
            <span />
          </div>
        ))}
      {editing && <EditSubRecipeModal subRecipe={sr} parentId={parentId} onClose={() => setEditing(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────
// Coût de revient et prix de vente conseillé
// ─────────────────────────────────────────────

/** Singulier approximatif d'un nom de pièces (« financiers » → « financier »). */
const singular = (label: string) => (/[^s]s$/i.test(label) && !label.includes(" ") ? label.slice(0, -1) : label);

function CostCard({
  recipeId,
  lines,
  pieces,
  initialCoef,
}: {
  recipeId: number;
  lines: AdjIngredient[];
  pieces: { count: number; label: string } | null;
  initialCoef: number;
}) {
  const [coefInput, setCoefInput] = useState(String(initialCoef).replace(".", ","));
  const [savedCoef, setSavedCoef] = useState(initialCoef);
  const [, startTransition] = useTransition();
  const cost = useMemo(() => costOf(lines), [lines]);
  const priced = cost.detail.length > 0 || lines.some((l) => l.cost);

  const v = Number(coefInput.replace(",", "."));
  const coef = Number.isFinite(v) && v > 0 ? v : savedCoef;
  const saveCoef = () => {
    if (!Number.isFinite(v) || v <= 0 || v > 100 || v === savedCoef) return;
    setSavedCoef(v);
    startTransition(async () => { await setRecipeSaleCoef(recipeId, v); });
  };

  if (!priced) {
    return (
      <div className="fl-card cost-card cost-empty">
        <span className="kpi-l">Coût matière</span>
        <span>
          Renseigne le prix d&apos;achat des ingrédients (Réglages → Ingrédients) pour voir le coût de revient et un prix de vente conseillé.
        </span>
      </div>
    );
  }

  const per = pieces && pieces.count > 0 ? pieces : null;
  const each = per ? ` / ${singular(per.label)}` : "";
  const calc = [
    ...cost.detail
      .slice()
      .sort((a, b) => b.cost - a.cost)
      .map((d) => d.name.slice(0, 24).padEnd(26) + formatEuro(d.cost)),
    "─".repeat(34),
    "Coût matière".padEnd(26) + formatEuro(cost.total),
    ...(per ? [`÷ ${fmtNum(per.count, 1)} ${per.label}`.slice(0, 25).padEnd(26) + formatEuro(cost.total / per.count)] : []),
    `Prix conseillé (×${fmtNum(coef)})`.padEnd(26) + formatEuro(cost.total * coef),
  ].join("\n");

  return (
    <div className="fl-card cost-card">
      <div className="cost-cell">
        <div className="kpi-l">
          Coût matière
          <Help
            title="Coût matière"
            calc={calc}
            example="250 g de beurre à 7,90 €/kg = 1,98 €. Avec un coefficient ×4, le prix de vente conseillé est 4 fois le coût matière."
          >
            Le prix des ingrédients de la recette, sous-recettes comprises, avec le multiplicateur
            appliqué. Il vient des prix d&apos;achat réglés sur la fiche de chaque ingrédient
            (Réglages → Ingrédients). Hors main-d&apos;œuvre, énergie et emballage.
          </Help>
        </div>
        <div className="cost-v num">{formatEuro(cost.total)}</div>
        {per && <div className="kpi-s">{formatEuro(cost.total / per.count)}{each}</div>}
      </div>
      <div className="cost-cell">
        <div className="kpi-l">
          Prix conseillé
          <Help title="Prix de vente conseillé" calc={"prix conseillé = coût matière × coefficient"} example="Coût 12,40 € × 4 = 49,60 €.">
            Le coût matière multiplié par ton coefficient (souvent ×3 à ×5 en pâtisserie). Le
            coefficient est gardé pour cette recette.
          </Help>
          <span className="stepper cost-coef">
            <span className="x">×</span>
            <input
              value={coefInput}
              inputMode="decimal"
              aria-label="Coefficient de vente"
              onChange={(e) => setCoefInput(e.target.value)}
              onBlur={saveCoef}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </span>
        </div>
        <div className="cost-v num" style={{ color: "var(--accent)" }}>{formatEuro(cost.total * coef)}</div>
        {per && <div className="kpi-s">{formatEuro((cost.total * coef) / per.count)}{each}</div>}
      </div>
      {cost.missing.length > 0 && (
        <div className="cost-missing">
          {cost.missing.length} ingrédient{cost.missing.length > 1 ? "s" : ""} sans prix, non compté{cost.missing.length > 1 ? "s" : ""}
          <Help title="Ingrédients sans prix" calc={cost.missing.join("\n")}>
            Ces ingrédients n&apos;ont pas de prix d&apos;achat (ou sont à la pièce sans poids connu) : le coût
            affiché est donc un peu sous-estimé. Règle-les dans Réglages → Ingrédients.
          </Help>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Multiplicateur
// ─────────────────────────────────────────────

function MultiplierCard({
  recipeId,
  hasSubRecipes,
  mode,
  setMode,
  coefInput,
  setCoefInput,
  massInput,
  setMassInput,
  pivotId,
  setPivotId,
  pivotInput,
  setPivotInput,
  ingredients,
  yieldInfo,
  piecesInput,
  setPiecesInput,
  globalCoef,
  onReset,
  decimals,
  setDecimals,
}: {
  recipeId: number;
  hasSubRecipes: boolean;
  mode: MultMode;
  setMode: (m: MultMode) => void;
  coefInput: string;
  setCoefInput: (v: string) => void;
  massInput: string;
  setMassInput: (v: string) => void;
  pivotId: number | null;
  setPivotId: (v: number) => void;
  pivotInput: string;
  setPivotInput: (v: string) => void;
  ingredients: IngredientRow[];
  yieldInfo: YieldInfo | null;
  piecesInput: string;
  setPiecesInput: (v: string) => void;
  globalCoef: number;
  onReset: () => void;
  decimals: boolean;
  setDecimals: (v: boolean) => void;
}) {
  const [savePending, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = Math.abs(globalCoef - 1) > 1e-4;

  const step = (d: number) => {
    const cur = Number(coefInput.replace(",", "."));
    const next = Math.max(0.1, Math.round(((Number.isFinite(cur) ? cur : 1) + d) * 100) / 100);
    setCoefInput(String(next).replace(".", ","));
  };

  const handleApply = () => {
    if (!dirty) return;
    const k = globalCoef.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
    const msg = hasSubRecipes
      ? `Enregistrer les quantités ×${k} comme nouvelle base de la recette ?\n\nLes sous-recettes liées ne sont pas modifiées.`
      : `Enregistrer les quantités ×${k} comme nouvelle base de la recette ?`;
    if (!confirm(msg)) return;
    setSaveError(null);
    const targetG = mode === "mass_target" ? Number(massInput.replace(",", ".")) : undefined;
    startSave(async () => {
      const r = await applyMultiplierToRecipe(recipeId, globalCoef, targetG);
      if (!r.ok) return setSaveError(r.error);
      onReset();
    });
  };

  return (
    <div className="kpi kpi-mult">
      <div className="kpi-l">
        Multiplicateur
        <Help
          title="Multiplicateur"
          calc={"quantité affichée = quantité de base × multiplicateur"}
          example={<>Masse : passer de 1 400 g à 2 100 g donne ×1,5. Pivot : passer la purée de 300 g à 450 g donne aussi ×1,5.</>}
        >
          Agrandit ou réduit toute la recette sans la modifier. Trois façons de le régler :
          <br />• <b>Coef.</b> : tu tapes le multiplicateur.
          <br />• <b>Masse</b> : tu tapes la masse voulue des ingrédients
          {hasSubRecipes ? " (hors sous-recettes)" : ""}.
          <br />• <b>Pivot</b> : tu fixes la quantité d&apos;un ingrédient.
          {yieldInfo && (
            <>
              <br />• <b>Pièces</b> : tu tapes le nombre de {yieldInfo.label} voulu (rendement de la recette).
            </>
          )}
          <br />
          <br />
          <b>Entiers</b> arrondit chaque quantité au gramme supérieur ; en mode Masse, l&apos;écart
          est réparti pour tomber pile sur la masse voulue.
        </Help>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {dirty && (
            <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" style={{ width: 28, height: 28 }} onClick={onReset} title="Revenir à ×1" aria-label="Revenir à ×1">
              <RotateCcw size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="mrow">
        <div className="fl-seg">
          {(["coefficient", "mass_target", "pivot_ingredient", ...(yieldInfo ? (["pieces"] as const) : [])] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} disabled={m === "pivot_ingredient" && ingredients.length === 0}>
              {m === "coefficient" ? "Coef." : m === "mass_target" ? "Masse" : m === "pieces" ? "Pièces" : "Pivot"}
            </button>
          ))}
        </div>
        {mode === "coefficient" && (
          <div className="stepper">
            <button type="button" onClick={() => step(-0.1)} aria-label="Diminuer">
              <Minus size={14} />
            </button>
            <span className="x">×</span>
            <input value={coefInput} inputMode="decimal" onChange={(e) => setCoefInput(e.target.value)} aria-label="Multiplicateur" />
            <button type="button" onClick={() => step(0.1)} aria-label="Augmenter">
              <Plus size={14} />
            </button>
          </div>
        )}
        {mode === "mass_target" && (
          <div className="stepper" style={{ minWidth: 150 }}>
            <input value={massInput} inputMode="numeric" onChange={(e) => setMassInput(e.target.value)} aria-label="Masse voulue en grammes" style={{ width: 90 }} />
            <span className="x">g</span>
          </div>
        )}
        {mode === "pieces" && yieldInfo && (
          <div className="stepper" style={{ minWidth: 150 }}>
            <input value={piecesInput} inputMode="decimal" onChange={(e) => setPiecesInput(e.target.value)} aria-label={`Nombre de ${yieldInfo.label} voulu`} style={{ width: 70 }} />
            <span className="x">{yieldInfo.label}</span>
          </div>
        )}
      </div>
      {mode === "pivot_ingredient" && (
        <div className="mrow" style={{ marginTop: 8 }}>
          <select className="fl-input" value={pivotId ?? ""} onChange={(e) => { const id = Number(e.target.value); setPivotId(id); const ing = ingredients.find((i) => i.id === id); if (ing) setPivotInput(String(Math.round(ingMass(ing.quantityG, ing.unit ?? "g", ing.pieceG)))); }} style={{ flex: "2 1 150px", minHeight: 34, height: 34, padding: "0 30px 0 10px", fontSize: 13 }} aria-label="Ingrédient pivot">
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <div className="stepper" style={{ flex: "1 1 100px" }}>
            <input value={pivotInput} inputMode="decimal" onChange={(e) => setPivotInput(e.target.value)} aria-label="Quantité voulue" style={{ width: "100%" }} />
            <span className="x">g</span>
          </div>
        </div>
      )}
      <div className="mrow" style={{ marginTop: 10, justifyContent: "space-between" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--soft)" }}>
          <button type="button" role="switch" aria-checked={!decimals} className="fl-switch" onClick={() => setDecimals(!decimals)} aria-label="Arrondir au gramme supérieur" />
          Entiers
        </label>
        <span className="num" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>{formatCoef(globalCoef)}</span>
        {dirty && (
          <button type="button" className="fl-btn fl-btn-edit" style={{ height: 30, fontSize: 12.5, padding: "0 10px" }} onClick={handleApply} disabled={savePending} title="Écrit les quantités affichées comme nouvelle base de la recette">
            <Save size={14} /> {savePending ? "…" : "Enregistrer comme base"}
          </button>
        )}
      </div>
      {saveError && <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{saveError}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Réglage d'une sous-recette
// ─────────────────────────────────────────────

function EditSubRecipeModal({
  subRecipe,
  parentId,
  onClose,
}: {
  subRecipe: SubRecipeRow;
  parentId: number;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(subRecipe.label);
  const [calcMode, setCalcMode] = useState<Mode>(subRecipe.calcMode);
  const [calcValue, setCalcValue] = useState(String(subRecipe.calcValue).replace(".", ","));
  const usable = subRecipe.childIngredients.filter((i) => i.unit !== "QS" && i.quantityG > 0);
  const [pivotId, setPivotId] = useState<number | null>(subRecipe.pivotIngredientId ?? usable[0]?.id ?? null);
  const [isExact, setIsExact] = useState(subRecipe.isExact);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData();
    fd.set("label", label);
    fd.set("calcMode", calcMode);
    fd.set("calcValue", calcValue.replace(",", "."));
    fd.set("isExact", String(isExact));
    if (calcMode === "pivot_ingredient" && pivotId) fd.set("pivotIngredientId", String(pivotId));
    const res = await updateSubRecipe(subRecipe.id, parentId, fd);
    setSubmitting(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SlidersHorizontal size={18} style={{ color: "var(--accent)" }} /> {subRecipe.label}
        </span>
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ color: "var(--muted)", marginTop: -6 }}>Recette d&apos;origine : {subRecipe.childName}</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Nom dans cette recette</span>
          <input className="fl-input" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={200} />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Quantité</span>
          <div className="fl-seg" style={{ alignSelf: "flex-start" }}>
            {(["mass_target", "coefficient", "pivot_ingredient"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={calcMode === m} onClick={() => setCalcMode(m)} disabled={m === "pivot_ingredient" && usable.length === 0}>
                {m === "mass_target" ? "Masse cible" : m === "coefficient" ? "Coefficient" : "Pivot"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {calcMode === "pivot_ingredient" && (
              <select className="fl-input" style={{ flex: "2 1 200px" }} value={pivotId ?? ""} onChange={(e) => setPivotId(Number(e.target.value))} aria-label="Ingrédient pivot">
                {usable.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({fmtNum(i.quantityG)} {i.unit ?? "g"})</option>
                ))}
              </select>
            )}
            <div style={{ position: "relative", flex: "1 1 120px" }}>
              <input type="text" inputMode="decimal" className="fl-input" value={calcValue} onChange={(e) => setCalcValue(e.target.value)} required style={{ paddingRight: 34 }} aria-label="Valeur" />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 13 }}>
                {calcMode === "coefficient" ? "×" : "g"}
              </span>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12.5 }}>{SUB_MODE_HELP[calcMode]}</p>
        </div>
        {calcMode === "mass_target" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" role="switch" aria-checked={isExact} className="fl-switch" onClick={() => setIsExact(!isExact)} aria-label="Masse exacte" />
            <span style={{ fontSize: 13.5, color: "var(--soft)", display: "flex", alignItems: "center" }}>
              Masse exacte
              <Help title="Masse exacte" example="Cible 250 g : sans masse exacte, les arrondis donnent 252 g ; avec, 250 g pile.">
                Les quantités sont arrondies au gramme supérieur, ce qui peut dépasser un peu la
                cible. Avec la masse exacte, l&apos;écart est retiré des plus gros ingrédients pour
                tomber pile.
              </Help>
            </span>
          </div>
        )}
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">Annuler</button>
          <button type="submit" disabled={submitting} className="fl-btn fl-btn-primary">{submitting ? "…" : "Enregistrer"}</button>
        </div>
      </form>
    </ModalOverlay>
  );
}


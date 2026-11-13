"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Library, Link2, Pin } from "lucide-react";
import { addRecipeToCookbook } from "@/app/actions/cookbooks";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { fetchCookbooksForModal, fetchRecipeMassInfo } from "@/app/actions/modals";
import { formatCoef, formatG } from "@/lib/format";
import { treeCoefficientForMass, treeScaledMass, type TreeNode } from "@/lib/recipeTree";

type Cookbook = { id: number; name: string };
type Ingredient = { name: string; quantityG: number };
type CalcMode = "coefficient" | "mass" | "pivot";

/**
 * Fenêtre « Ajouter à un cahier ». Charge les cahiers et, si besoin, la masse
 * et les ingrédients de la recette (ouverture depuis une liste de recettes).
 */
export function AddToCookbookDialog({
  recipeId,
  recipeName,
  onClose,
}: {
  recipeId: number;
  recipeName?: string;
  onClose: () => void;
}) {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchRecipeMassInfo>>>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchCookbooksForModal(), fetchRecipeMassInfo(recipeId)]).then(([books, r]) => {
      if (!active) return;
      setCookbooks(books);
      setInfo(r);
      setLoadError(!r);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [recipeId]);

  const title = (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Library size={18} style={{ color: "var(--accent)" }} /> Ajouter à un cahier
    </span>
  );

  if (loadError || cookbooks === null || info === null) {
    return (
      <ModalOverlay onClose={onClose} title={title}>
        <p style={{ color: "var(--muted)" }}>{loadError ? "Impossible de charger la recette. Ferme cette fenêtre et réessaie." : "Chargement…"}</p>
      </ModalOverlay>
    );
  }
  if (cookbooks.length === 0) {
    return (
      <ModalOverlay onClose={onClose} title={title}>
        <p style={{ color: "var(--soft)" }}>Aucun cahier pour le moment. Crée d&apos;abord un cahier.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">Fermer</button>
          <Link href="/cookbooks/new" className="fl-btn fl-btn-primary" onClick={onClose}>Créer un cahier</Link>
        </div>
      </ModalOverlay>
    );
  }
  return (
    <ModalOverlay onClose={onClose} title={title}>
      <CookbookForm
        recipeId={recipeId}
        recipeName={recipeName}
        cookbooks={cookbooks}
        totalMassG={info.totalMassG}
        ingredients={info.ingredients}
        tree={info.tree}
        onClose={onClose}
      />
    </ModalOverlay>
  );
}

function CookbookForm({
  recipeId,
  recipeName,
  cookbooks,
  totalMassG,
  ingredients,
  tree,
  onClose,
}: {
  recipeId: number;
  recipeName?: string;
  cookbooks: Cookbook[];
  totalMassG: number;
  ingredients: Ingredient[];
  tree: TreeNode;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [cookbookId, setCookbookId] = useState(cookbooks[0]?.id ?? 0);
  const [linkMode, setLinkMode] = useState<"linked" | "snapshot">("linked");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Multiplication (uniquement en mode figé)
  const [calcMode, setCalcMode] = useState<CalcMode>("coefficient");
  const [coefStr, setCoefStr] = useState("1");
  const [targetMassStr, setTargetMassStr] = useState(String(Math.round(totalMassG)));
  const [pivotIdx, setPivotIdx] = useState(0);
  const [pivotValueStr, setPivotValueStr] = useState(String(ingredients[0]?.quantityG ?? 0));

  const scale = useMemo(() => {
    try {
      if (linkMode !== "snapshot") return 1;
      if (calcMode === "coefficient") {
        const k = Number(coefStr.replace(",", "."));
        return Number.isFinite(k) && k > 0 ? k : null;
      }
      if (calcMode === "mass") return treeCoefficientForMass(tree, Number(targetMassStr.replace(",", ".")));
      const ref = ingredients[pivotIdx]?.quantityG ?? 0;
      const target = Number(pivotValueStr.replace(",", "."));
      if (!Number.isFinite(target) || target <= 0 || ref <= 0) return null;
      return target / ref;
    } catch { return null; }
  }, [linkMode, calcMode, coefStr, targetMassStr, pivotValueStr, pivotIdx, ingredients, tree]);
  const multiplier = scale ?? 1;

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addRecipeToCookbook(cookbookId, recipeId, linkMode, "single", multiplier,
        linkMode === "snapshot" && calcMode === "mass" ? Number(targetMassStr.replace(",", ".")) : undefined);
      if (result.ok) {
        setDone(true);
        setTimeout(onClose, 700);
      } else {
        setError(result.error);
      }
    });
  }

  const modeCard = (mode: "linked" | "snapshot", Icon: typeof Link2, label: string, text: string) => (
    <button
      type="button"
      onClick={() => setLinkMode(mode)}
      aria-pressed={linkMode === mode}
      className="pdf-theme-opt"
      style={{ border: "1px solid var(--border)", alignItems: "flex-start" }}
    >
      <Icon size={18} style={{ color: linkMode === mode ? "var(--accent)" : "var(--muted)", marginTop: 2 }} />
      <span style={{ flex: 1 }}>
        <b>{label}</b>
        <small style={{ whiteSpace: "normal" }}>{text}</small>
      </span>
    </button>
  );

  return (
    <>
      {recipeName && <p style={{ color: "var(--muted)", marginTop: -6 }}>{recipeName}</p>}
      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="fl-label">Cahier</span>
        <select value={cookbookId} onChange={(e) => setCookbookId(Number(e.target.value))} className="fl-input">
          {cookbooks.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
          Liaison
          <Help title="Recette liée ou figée">
            <b>Liée</b> : le cahier affiche toujours la version actuelle de la recette ; si tu la
            modifies, le cahier suit.
            <br />
            <b>Figée</b> : le cahier garde une copie de la recette telle qu&apos;elle est aujourd&apos;hui,
            éventuellement multipliée. Les modifications futures de la recette ne la changent pas.
          </Help>
        </span>
        {modeCard("linked", Link2, "Liée", "Toujours à jour avec la recette.")}
        {modeCard("snapshot", Pin, "Figée", "Une copie fixe, avec multiplication possible.")}
      </div>

      {linkMode === "snapshot" && (
        <div className="fl-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, background: "var(--bg)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div className="fl-seg">
              {(["coefficient", "mass", "pivot"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={calcMode === m} onClick={() => setCalcMode(m)} disabled={m === "pivot" && ingredients.length === 0}>
                  {m === "coefficient" ? "Coefficient" : m === "mass" ? "Masse cible" : "Pivot"}
                </button>
              ))}
            </div>
            <span className="num" style={{ color: "var(--accent)", fontSize: 13 }}>
              {formatG(treeScaledMass(tree, multiplier))} · {formatCoef(multiplier)}
            </span>
          </div>
          {calcMode === "coefficient" && (
            <input type="number" step="0.01" min="0.01" inputMode="decimal" value={coefStr} onChange={(e) => setCoefStr(e.target.value)} className="fl-input" aria-label="Coefficient" />
          )}
          {calcMode === "mass" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ color: "var(--muted)", fontSize: 12.5 }}>Masse voulue en grammes (actuelle : {formatG(totalMassG)})</span>
              <input type="number" step="1" min="1" inputMode="numeric" value={targetMassStr} onChange={(e) => setTargetMassStr(e.target.value)} className="fl-input" />
            </label>
          )}
          {calcMode === "pivot" && ingredients.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={pivotIdx}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setPivotIdx(i);
                  setPivotValueStr(String(ingredients[i]?.quantityG ?? 0));
                }}
                className="fl-input"
                style={{ flex: "2 1 180px" }}
                aria-label="Ingrédient pivot"
              >
                {ingredients.map((ing, i) => (
                  <option key={i} value={i}>{ing.name} ({Math.round(ing.quantityG)} g)</option>
                ))}
              </select>
              <input type="number" step="0.01" min="0.01" inputMode="decimal" value={pivotValueStr} onChange={(e) => setPivotValueStr(e.target.value)} className="fl-input" style={{ flex: "1 1 100px" }} aria-label="Quantité voulue (g)" />
            </div>
          )}
        </div>
      )}

      {(error || scale === null) && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error ?? "Cette masse ne peut pas être obtenue avec les quantités ajustables de cette recette."}</p>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">Annuler</button>
        <button type="button" onClick={handleAdd} disabled={pending || done || scale === null} className="fl-btn fl-btn-primary">
          {done ? <><Check size={16} /> Ajoutée</> : pending ? "Ajout…" : "Ajouter"}
        </button>
      </div>
    </>
  );
}

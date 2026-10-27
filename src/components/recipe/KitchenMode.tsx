"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Sun, Timer, X } from "lucide-react";
import type { IngredientRow, RecipeScale, SubRecipeRow } from "@/components/RecipeBody";
import { resolveLink } from "@/lib/recipeTree";
import { roundScaled, scaledUnit } from "@/lib/massAdjust";
import { formatCoef, formatQty } from "@/lib/format";
import { parseStepLines } from "@/lib/stepLines";
import { scaleStepParts } from "@/lib/stepQty";
import { htmlToPlainText } from "@/lib/stepsText";
import { findDurations, formatClock } from "@/lib/durations";
import { useEscape } from "@/components/ui/useMedia";
import { loadStored, saveStored, type LabTimers } from "./labTimers";

type Line = { key: string; name: string; qty: string } | { key: string; title: string };
type Section = { key: string; title: string; lines: Line[] };
type Step = { key: string; section: string; title?: string; no?: number; text: string };

const num = (n: number) => Math.round(n * 100) / 100;

/** Pesées de la recette au multiplicateur courant : chaque sous-recette puis ses propres ingrédients. */
function weighSections(name: string, ingredients: IngredientRow[], subs: SubRecipeRow[], scale: RecipeScale): Section[] {
  const own: Line[] = ingredients.map((i) => {
    if (i.unit === "titre") return { key: `o${i.id}`, title: i.name };
    const k = i.unit === "L" ? scale.coef * 1000 : scale.coef;
    // Comme l'onglet Recette : arrondi seulement avec « Entiers ».
    const q = scale.wholeNumbers ? roundScaled(i.quantityG * k, i.unit) : i.quantityG * k;
    return { key: `o${i.id}`, name: i.name, qty: formatQty(num(q), scaledUnit(i.unit)) };
  });
  // Sous-recettes d'abord, comme on les prépare ; la recette elle-même à la fin.
  const sections: Section[] = [];
  const memo = new Map();
  for (const s of subs) {
    const r = resolveLink({ ...s, child: s.childTree }, scale.coef, memo);
    sections.push({
      key: `s${s.id}`,
      title: s.label,
      lines: r.ingredients
        .filter((i) => i.unit !== "titre")
        .map((i, j) => ({ key: `s${s.id}-${j}`, name: i.name, qty: formatQty(num(i.quantityG), i.unit) })),
    });
  }
  if (own.length) sections.push({ key: "own", title: name, lines: own });
  return sections;
}

/** Étapes de la recette puis de ses sous-recettes, quantités liées à l'échelle. */
function allSteps(name: string, steps: string | null, subs: SubRecipeRow[], scale: RecipeScale): Step[] {
  const out: Step[] = [];
  const add = (section: string, raw: string | null, coef: number) => {
    if (!raw) return;
    for (const [i, l] of parseStepLines(htmlToPlainText(raw)).entries()) {
      const text = scaleStepParts(l.text, coef, scale.wholeNumbers).map((p) => (typeof p === "string" ? p : p.qty)).join("");
      out.push(l.kind === "title" ? { key: `${section}-${i}`, section, title: text, text } : { key: `${section}-${i}`, section, no: l.no, text });
    }
  };
  for (const s of subs) add(s.label, s.childSteps, scale.subCoefs[s.id] ?? scale.coef);
  add(name, steps, scale.coef);
  return out;
}

/** Garde l'écran allumé tant que le mode labo est ouvert (si le téléphone l'accepte). */
function useWakeLock(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    type Sentinel = { release: () => Promise<void>; addEventListener: (t: string, f: () => void) => void };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let alive = true;
    const request = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock.request("screen");
        if (!alive) return void lock.release();
        setOn(true);
        lock.addEventListener("release", () => setOn(false));
      } catch {
        setOn(false);
      }
    };
    void request();
    // Le verrou saute quand on change d'appli : on le redemande au retour.
    const onVis = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, []);
  return on;
}

/**
 * Mode labo : la recette en grand, au multiplicateur de la fiche, écran gardé
 * allumé. Pesées à cocher, étape en cours mise en avant, durées des étapes
 * transformées en minuteurs. Rien n'est enregistré dans la recette ; cases et
 * minuteurs sont gardés sur le téléphone jusqu'à la fermeture de l'onglet (les
 * minuteurs sont tenus par la fiche : ils sonnent même mode labo fermé).
 */
export function KitchenMode({
  recipeId,
  name,
  steps,
  ingredients,
  subRecipes,
  scale,
  lab,
  onClose,
}: {
  recipeId: number;
  name: string;
  steps: string | null;
  ingredients: IngredientRow[];
  subRecipes: SubRecipeRow[];
  scale: RecipeScale;
  lab: LabTimers;
  onClose: () => void;
}) {
  const sections = useMemo(() => weighSections(name, ingredients, subRecipes, scale), [name, ingredients, subRecipes, scale]);
  const stepList = useMemo(() => allSteps(name, steps, subRecipes, scale), [name, steps, subRecipes, scale]);
  const numbered = stepList.filter((s) => s.no !== undefined);

  // Cases cochées gardées par recette, avec le multiplicateur où elles ont été cochées :
  // si la page a été rechargée (retour à ×1), on propose de les garder.
  const store = `labo:${recipeId}:progress`;
  type Progress = { coef: number; checked: Record<string, boolean>; step: string | null };
  const [saved] = useState<Progress | null>(() => loadStored<Progress | null>(store, null));
  const sameCoef = !!saved && Math.abs(saved.coef - scale.coef) < 1e-6;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => (sameCoef ? saved!.checked : {}));
  const [current, setCurrent] = useState<string | null>(() => (sameCoef ? saved!.step : null) ?? numbered[0]?.key ?? null);
  const [offer, setOffer] = useState<Progress | null>(() =>
    saved && !sameCoef && Object.values(saved.checked).some(Boolean) ? saved : null,
  );
  const [tab, setTab] = useState<"weigh" | "steps">("weigh");
  const awake = useWakeLock();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!offer) saveStored(store, { coef: scale.coef, checked, step: current });
  }, [store, scale.coef, checked, current, offer]);

  // Échap pour fermer (seulement si aucune autre fenêtre n'est par-dessus), page derrière figée.
  useEscape(true, () => closeRef.current?.click());
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      before?.focus?.();
    };
  }, []);

  // Bouton retour du téléphone : ferme le mode labo au lieu de quitter la fiche.
  // Une entrée d'historique est ajoutée à l'ouverture ; fermer (croix, Échap) revient
  // en arrière, et c'est ce retour qui ferme.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!history.state?.labo) history.pushState({ ...(history.state ?? {}), labo: true }, "");
    const onPop = () => {
      if (!history.state?.labo) onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const close = () => (history.state?.labo ? history.back() : onClose());

  // L'étape en cours reste visible.
  useEffect(() => {
    if (current) document.querySelector(`[data-step="${current}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  const startTimer = lab.start;
  const left = lab.left;

  const total = sections.reduce((s, x) => s + x.lines.filter((l) => "qty" in l).length, 0);
  const done = Object.values(checked).filter(Boolean).length;
  const idx = numbered.findIndex((s) => s.key === current);
  const go = (d: number) => {
    const next = numbered[Math.min(numbered.length - 1, Math.max(0, idx + d))];
    if (next) setCurrent(next.key);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="lab" role="dialog" aria-modal="true" aria-label={`Mode labo : ${name}`}>
      <header className="lab-top">
        <button ref={closeRef} type="button" className="lab-icon" onClick={close} aria-label="Quitter le mode labo">
          <X size={22} />
        </button>
        <div className="lab-title">
          <b>{name}</b>
          <small>
            {formatCoef(scale.coef)}
            {awake ? (
              <span className="lab-awake"><Sun size={12} /> écran allumé</span>
            ) : (
              <span className="lab-awake off">l&apos;écran peut s&apos;éteindre</span>
            )}
          </small>
        </div>
        <button
          type="button"
          className="lab-icon"
          title="Tout décocher et revenir à la 1re étape"
          aria-label="Recommencer"
          onClick={() => {
            setChecked({});
            setCurrent(numbered[0]?.key ?? null);
          }}
        >
          <RotateCcw size={19} />
        </button>
      </header>

      {offer && (
        <div className="lab-offer" role="status">
          <span>
            {Object.values(offer.checked).filter(Boolean).length} pesée(s) cochée(s) à {formatCoef(offer.coef)} ; la fiche est à {formatCoef(scale.coef)}.
          </span>
          <button
            type="button"
            className="fl-btn fl-btn-secondary"
            onClick={() => {
              setChecked(offer.checked);
              if (offer.step) setCurrent(offer.step);
              setOffer(null);
            }}
          >
            Garder les cases
          </button>
          <button type="button" className="fl-btn fl-btn-ghost" onClick={() => setOffer(null)}>
            Repartir de zéro
          </button>
        </div>
      )}

      <div className="lab-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "weigh"} onClick={() => setTab("weigh")}>
          Pesées <span>{done}/{total}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "steps"} onClick={() => setTab("steps")}>
          Étapes {idx >= 0 && <span>{idx + 1}/{numbered.length}</span>}
        </button>
      </div>

      <div className="lab-body" data-tab={tab}>
        <div className="lab-col lab-weigh">
          {sections.map((s) => (
            <section key={s.key}>
              <h2>{s.title}</h2>
              {s.lines.map((l) =>
                "title" in l ? (
                  <h3 key={l.key}>{l.title}</h3>
                ) : (
                  <button
                    key={l.key}
                    type="button"
                    className="lab-ing"
                    aria-pressed={!!checked[l.key]}
                    onClick={() => setChecked((c) => ({ ...c, [l.key]: !c[l.key] }))}
                  >
                    <span className="lab-check">{checked[l.key] && <Check size={18} />}</span>
                    <span className="lab-name">{l.name}</span>
                    <b className="lab-qty">{l.qty}</b>
                  </button>
                ),
              )}
            </section>
          ))}
        </div>

        <div className="lab-col lab-steps">
          {stepList.length === 0 && <p className="lab-empty">Pas d&apos;étapes sur cette recette.</p>}
          {stepList.map((s, i) => {
            const newSection = i === 0 || stepList[i - 1].section !== s.section;
            const head = newSection && (stepList.some((x) => x.section !== s.section) ? <h2 key={`h${s.key}`}>{s.section}</h2> : null);
            if (s.title !== undefined) return [head, <h3 key={s.key}>{s.title}</h3>];
            const hits = findDurations(s.text);
            const parts: React.ReactNode[] = [];
            let last = 0;
            for (const h of hits) {
              parts.push(s.text.slice(last, h.start));
              parts.push(
                <button
                  key={h.start}
                  type="button"
                  className="lab-timer-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    startTimer(`${s.section} · étape ${s.no} · ${h.text.trim()}`, h.seconds);
                  }}
                >
                  <Timer size={15} /> {h.text.trim()}
                </button>,
              );
              last = h.end;
            }
            parts.push(s.text.slice(last));
            return [
              head,
              <div key={s.key} data-step={s.key} className="lab-step" data-current={s.key === current ? "true" : undefined} onClick={() => setCurrent(s.key)}>
                <b className="lab-no">{s.no}</b>
                <p>{parts}</p>
              </div>,
            ];
          })}
          {numbered.length > 1 && (
            <div className="lab-nav">
              <button type="button" className="fl-btn fl-btn-secondary" onClick={() => go(-1)} disabled={idx <= 0}>
                <ChevronLeft size={18} /> Précédente
              </button>
              <button type="button" className="fl-btn fl-btn-primary" onClick={() => go(1)} disabled={idx >= numbered.length - 1}>
                Suivante <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {lab.timers.length > 0 && (
        <div className="lab-timers">
          {lab.timers.map((t) => {
            const l = left(t);
            const over = l <= 0;
            return (
              <div key={t.id} className="lab-timer" data-over={over ? "true" : undefined}>
                <span className="lab-clock num">{over ? "Terminé" : formatClock(l)}</span>
                <span className="lab-tl">{t.label}</span>
                {!over && (
                  <button
                    type="button"
                    className="lab-icon"
                    aria-label={t.endsAt ? "Mettre en pause" : "Reprendre"}
                    onClick={() => lab.toggle(t.id)}
                  >
                    {t.endsAt ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                )}
                <button type="button" className="lab-icon" aria-label="Arrêter le minuteur" onClick={() => lab.stop(t.id)}>
                  <X size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}

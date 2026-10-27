"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type Line = { key: string; name: string; qty: string } | { key: string; title: string };
type Section = { key: string; title: string; lines: Line[] };
type Step = { key: string; section: string; title?: string; no?: number; text: string };
type TimerState = { id: string; label: string; total: number; endsAt: number | null; left: number };

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

/** Son de fin de minuteur (trois bips), sans fichier audio. */
function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  const unlock = useCallback(() => {
    if (ctx.current) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx.current = new AC();
  }, []);
  const beep = useCallback(() => {
    const c = ctx.current;
    if (c) {
      void c.resume();
      for (let i = 0; i < 3; i++) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, c.currentTime + i * 0.45);
        g.gain.exponentialRampToValueAtTime(0.4, c.currentTime + i * 0.45 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + i * 0.45 + 0.3);
        o.connect(g).connect(c.destination);
        o.start(c.currentTime + i * 0.45);
        o.stop(c.currentTime + i * 0.45 + 0.32);
      }
    }
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  }, []);
  return { unlock, beep };
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* navigation privée : rien n'est gardé */
  }
}

/**
 * Mode labo : la recette en grand, au multiplicateur de la fiche, écran gardé
 * allumé. Pesées à cocher, étape en cours mise en avant, durées des étapes
 * transformées en minuteurs. Rien n'est enregistré dans la recette ; cases et
 * minuteurs sont gardés sur le téléphone jusqu'à la fermeture de l'onglet.
 */
export function KitchenMode({
  recipeId,
  name,
  steps,
  ingredients,
  subRecipes,
  scale,
  onClose,
}: {
  recipeId: number;
  name: string;
  steps: string | null;
  ingredients: IngredientRow[];
  subRecipes: SubRecipeRow[];
  scale: RecipeScale;
  onClose: () => void;
}) {
  const sections = useMemo(() => weighSections(name, ingredients, subRecipes, scale), [name, ingredients, subRecipes, scale]);
  const stepList = useMemo(() => allSteps(name, steps, subRecipes, scale), [name, steps, subRecipes, scale]);
  const numbered = stepList.filter((s) => s.no !== undefined);

  const store = `labo:${recipeId}:${scale.coef.toFixed(4)}`;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => load(`${store}:checked`, {}));
  const [current, setCurrent] = useState<string | null>(() => load(`${store}:step`, numbered[0]?.key ?? null));
  const [timers, setTimers] = useState<TimerState[]>(() => load(`labo:${recipeId}:timers`, []));
  const [tab, setTab] = useState<"weigh" | "steps">("weigh");
  const [now, setNow] = useState(() => Date.now());
  const awake = useWakeLock();
  const { unlock, beep } = useBeep();
  // Minuteurs déjà finis à l'ouverture : pas de nouvelle sonnerie.
  const rang = useRef<Set<string>>(new Set(timers.filter((t) => t.endsAt && t.endsAt <= Date.now()).map((t) => t.id)));

  useEffect(() => save(`${store}:checked`, checked), [store, checked]);
  useEffect(() => save(`${store}:step`, current), [store, current]);
  useEffect(() => save(`labo:${recipeId}:timers`, timers), [recipeId, timers]);

  // Horloge des minuteurs.
  useEffect(() => {
    if (!timers.some((t) => t.endsAt)) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timers]);
  useEffect(() => {
    for (const t of timers) {
      if (t.endsAt && t.endsAt <= now && !rang.current.has(t.id)) {
        rang.current.add(t.id);
        beep();
      }
    }
  }, [now, timers, beep]);

  // Échap pour fermer, page derrière figée.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // L'étape en cours reste visible.
  useEffect(() => {
    if (current) document.querySelector(`[data-step="${current}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  const startTimer = (label: string, seconds: number) => {
    unlock();
    const id = `${Date.now()}`;
    setTimers((ts) => [...ts, { id, label, total: seconds, endsAt: Date.now() + seconds * 1000, left: seconds }]);
    setNow(Date.now());
  };
  const left = (t: TimerState) => (t.endsAt ? Math.max(0, (t.endsAt - now) / 1000) : t.left);

  const total = sections.reduce((s, x) => s + x.lines.filter((l) => "qty" in l).length, 0);
  const done = Object.values(checked).filter(Boolean).length;
  const idx = numbered.findIndex((s) => s.key === current);
  const go = (d: number) => {
    const next = numbered[Math.min(numbered.length - 1, Math.max(0, idx + d))];
    if (next) setCurrent(next.key);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="lab" role="dialog" aria-label={`Mode labo : ${name}`}>
      <header className="lab-top">
        <button type="button" className="lab-icon" onClick={onClose} aria-label="Quitter le mode labo">
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

      {timers.length > 0 && (
        <div className="lab-timers">
          {timers.map((t) => {
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
                    onClick={() =>
                      setTimers((ts) =>
                        ts.map((x) =>
                          x.id !== t.id ? x : x.endsAt ? { ...x, endsAt: null, left: left(x) } : { ...x, endsAt: Date.now() + x.left * 1000 },
                        ),
                      )
                    }
                  >
                    {t.endsAt ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                )}
                <button type="button" className="lab-icon" aria-label="Arrêter le minuteur" onClick={() => setTimers((ts) => ts.filter((x) => x.id !== t.id))}>
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

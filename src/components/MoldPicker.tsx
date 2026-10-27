"use client";

import { useState } from "react";
import { MOLD_PRESETS, MOLD_SHAPE_LABEL, moldKey, moldLabel, type Mold, type MoldShape } from "@/lib/mold";

const CUSTOM = "autre";
const NONE = "";

const numStr = (x: number | null | undefined) => (x ? String(x).replace(".", ",") : "");
const toNum = (s: string) => {
  const x = Number(s.replace(",", "."));
  return Number.isFinite(x) && x > 0 ? x : null;
};

/**
 * Choix d'un moule : liste des moules courants, ou « Autre dimension » (forme +
 * dimensions libres), avec une hauteur facultative.
 * `allowNone` : propose « Aucun » (formulaire de la recette).
 */
export function MoldPicker({
  value,
  onChange,
  allowNone = false,
  label,
  compact = false,
}: {
  value: Mold | null;
  onChange: (m: Mold | null) => void;
  allowNone?: boolean;
  label: string;
  compact?: boolean;
}) {
  const presetKey = value && MOLD_PRESETS.some((p) => moldKey(p) === moldKey(value)) ? moldKey(value) : null;
  const [custom, setCustom] = useState(!!value && !presetKey);
  const [shape, setShape] = useState<MoldShape>(value?.shape ?? "cercle");
  const [a, setA] = useState(numStr(value?.a));
  const [b, setB] = useState(numStr(value?.b));
  const [h, setH] = useState(numStr(value?.h));

  const emit = (next: { shape?: MoldShape; a?: string; b?: string; h?: string }) => {
    const s = next.shape ?? shape;
    const av = toNum(next.a ?? a);
    const bv = toNum(next.b ?? b);
    const hv = toNum(next.h ?? h);
    if (!av || (s === "cadre" && !bv)) return onChange(null);
    onChange({ shape: s, a: av, ...(s === "cadre" ? { b: bv } : {}), ...(hv ? { h: hv } : {}) });
  };

  const selectValue = custom ? CUSTOM : presetKey ?? NONE;
  const inputStyle = { width: 62, minHeight: compact ? 32 : undefined, height: compact ? 32 : undefined, padding: "0 8px", fontSize: 13 };

  return (
    <div className="mold-pick">
      <select
        className="fl-input"
        aria-label={label}
        value={selectValue}
        style={compact ? { minHeight: 32, height: 32, padding: "0 28px 0 10px", fontSize: 13 } : undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) {
            setCustom(true);
            return emit({});
          }
          setCustom(false);
          if (v === NONE) return onChange(null);
          const p = MOLD_PRESETS.find((m) => moldKey(m) === v)!;
          setShape(p.shape);
          setA(numStr(p.a));
          setB(numStr(p.b));
          emit({ shape: p.shape, a: String(p.a), b: String(p.b ?? "") });
        }}
      >
        {allowNone && <option value={NONE}>Aucun</option>}
        {!allowNone && !presetKey && !custom && <option value={NONE}>Choisir…</option>}
        {(["cercle", "carre", "cadre"] as const).map((s) => (
          <optgroup key={s} label={s === "cercle" ? "Cercles" : s === "carre" ? "Carrés" : "Cadres"}>
            {MOLD_PRESETS.filter((p) => p.shape === s).map((p) => (
              <option key={moldKey(p)} value={moldKey(p)}>
                {moldLabel(p, false)}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Autre dimension…</option>
      </select>
      {custom && (
        <>
          <select
            className="fl-input"
            aria-label="Forme"
            value={shape}
            style={compact ? { minHeight: 32, height: 32, padding: "0 28px 0 10px", fontSize: 13 } : undefined}
            onChange={(e) => {
              const s = e.target.value as MoldShape;
              setShape(s);
              emit({ shape: s });
            }}
          >
            {(["cercle", "carre", "cadre"] as const).map((s) => (
              <option key={s} value={s}>{MOLD_SHAPE_LABEL[s]}</option>
            ))}
          </select>
          <span className="mold-dims">
          <input
            className="fl-input num"
            inputMode="decimal"
            value={a}
            placeholder={shape === "cercle" ? "Ø" : shape === "carre" ? "côté" : "long."}
            aria-label={shape === "cercle" ? "Diamètre en cm" : shape === "carre" ? "Côté en cm" : "Longueur en cm"}
            style={inputStyle}
            onChange={(e) => {
              setA(e.target.value);
              emit({ a: e.target.value });
            }}
          />
          {shape === "cadre" && (
            <>
              <span className="mold-x">×</span>
              <input
                className="fl-input num"
                inputMode="decimal"
                value={b}
                placeholder="larg."
                aria-label="Largeur en cm"
                style={inputStyle}
                onChange={(e) => {
                  setB(e.target.value);
                  emit({ b: e.target.value });
                }}
              />
            </>
          )}
          </span>
        </>
      )}
      {(custom || presetKey) && (
        <span className="mold-h">
          <span className="mold-x">h</span>
          <input
            className="fl-input num"
            inputMode="decimal"
            value={h}
            placeholder="—"
            title="Hauteur en cm (facultatif) : si les deux moules en ont une, le calcul se fait au volume"
            aria-label="Hauteur en cm (facultatif)"
            style={inputStyle}
            onChange={(e) => {
              setH(e.target.value);
              emit({ h: e.target.value });
            }}
          />
          <span className="mold-x">cm</span>
        </span>
      )}
    </div>
  );
}

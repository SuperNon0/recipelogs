/**
 * Petits schémas affichés au-dessus des choix de l'éditeur de thème PDF :
 * une mini page qui montre en gros où va chaque bloc (titre, ingrédients,
 * préparation). Ce sont des croquis, pas le rendu exact (voir l'aperçu).
 */
import type {
  Density,
  IngredientRatio,
  IngredientStyle,
  PageFrame,
  Paper,
  RecipeLayout,
  SectionTitleStyle,
  StepStyle,
  TitleAlign,
  TitleStyle,
} from "@/lib/pdf/theme";
import { PAPER_COLORS } from "@/lib/pdf/theme";

const W = 60;
const H = 80;
const ACC = "var(--accent)";
const INK = "var(--muted)";

/** Mini page (cadre + contenu). */
function Page({ children, bg }: { children?: React.ReactNode; bg?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={42} height={56} aria-hidden style={{ display: "block" }}>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={3} fill={bg ?? "var(--card)"} stroke="var(--border2)" />
      {children}
    </svg>
  );
}

/** Lignes de texte grises. */
function Lines({ x, y, w, n, gap = 4, short = true }: { x: number; y: number; w: number; n: number; gap?: number; short?: boolean }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <line
          key={i}
          x1={x}
          y1={y + i * gap}
          x2={x + (short && i === n - 1 ? w * 0.6 : w)}
          y2={y + i * gap}
          stroke={INK}
          strokeWidth={1.4}
          strokeLinecap="round"
          opacity={0.55}
        />
      ))}
    </>
  );
}

/** Barre de titre, alignée à gauche, au centre ou à droite. */
function TitleBar({ y, w = 28, align = "center", h = 3.6 }: { y: number; w?: number; align?: "left" | "center" | "right"; h?: number }) {
  const x = align === "left" ? 7 : align === "right" ? W - 7 - w : (W - w) / 2;
  return <rect x={x} y={y} width={w} height={h} rx={1.2} fill={ACC} />;
}

/** Bloc « ingrédients » : fond teinté + lignes avec quantités en couleur. */
function IngBlock({ x, y, w, n = 4, gap = 4.2 }: { x: number; y: number; w: number; n?: number; gap?: number }) {
  return (
    <>
      <rect x={x - 1.5} y={y - 2.5} width={w + 3} height={n * gap + 2} rx={1.5} fill={ACC} opacity={0.14} />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <line x1={x} y1={y + i * gap} x2={x + Math.min(5, w * 0.3)} y2={y + i * gap} stroke={ACC} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={x + Math.min(7, w * 0.4)} y1={y + i * gap} x2={x + w} y2={y + i * gap} stroke={INK} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
        </g>
      ))}
    </>
  );
}

// ─── Modèle de fiche ─────────────────────────────────────────────────────────

export function LayoutThumb({ layout }: { layout: RecipeLayout }) {
  switch (layout) {
    case "classique":
      return (
        <Page>
          <TitleBar y={7} />
          <Lines x={18} y={15} w={24} n={1} short={false} />
          <IngBlock x={7} y={24} w={16} n={6} />
          <Lines x={28} y={24} w={25} n={10} />
        </Page>
      );
    case "fiche-technique":
      return (
        <Page>
          <TitleBar y={6} align="left" w={30} h={3} />
          <line x1={7} y1={11.5} x2={53} y2={11.5} stroke={ACC} strokeWidth={1} />
          <rect x={7} y={15} width={46} height={7} fill="none" stroke={ACC} strokeWidth={0.9} />
          <line x1={22.3} y1={15} x2={22.3} y2={22} stroke={ACC} strokeWidth={0.6} />
          <line x1={37.6} y1={15} x2={37.6} y2={22} stroke={ACC} strokeWidth={0.6} />
          <rect x={7} y={26} width={46} height={3.2} fill={ACC} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={7} y={29.2 + i * 3.6} width={46} height={3.6} fill={i % 2 ? "var(--border2)" : "none"} opacity={0.6} />
          ))}
          <Lines x={7} y={49} w={46} n={6} />
        </Page>
      );
    case "moderne":
      return (
        <Page>
          <TitleBar y={7} align="left" w={36} h={5} />
          <line x1={7} y1={16} x2={17} y2={16} stroke={ACC} strokeWidth={1.2} />
          <IngBlock x={7} y={24} w={20} n={3} />
          <IngBlock x={33} y={24} w={20} n={3} />
          <Lines x={7} y={42} w={46} n={7} />
        </Page>
      );
    case "magazine":
      return (
        <Page>
          <TitleBar y={7} align="left" w={40} h={5.5} />
          <rect x={6} y={18} width={19} height={30} fill={ACC} opacity={0.14} />
          <rect x={6} y={18} width={1.6} height={30} fill={ACC} />
          <Lines x={10} y={22} w={13} n={6} />
          <rect x={29} y={18} width={6} height={7} rx={1} fill={ACC} />
          <Lines x={37} y={20} w={16} n={2} short={false} />
          <Lines x={29} y={28} w={24} n={8} />
        </Page>
      );
  }
}

// ─── Place des ingrédients ───────────────────────────────────────────────────

/** Ingrédients à gauche / à droite / au-dessus (modèles en deux colonnes). */
export function IngPositionThumb({ position }: { position: "left" | "right" | "top" }) {
  if (position === "top") {
    return (
      <Page>
        <TitleBar y={7} />
        <IngBlock x={9} y={19} w={42} n={4} />
        <Lines x={7} y={42} w={46} n={7} />
      </Page>
    );
  }
  const ingX = position === "left" ? 7 : 37;
  const prepX = position === "left" ? 28 : 7;
  return (
    <Page>
      <TitleBar y={7} />
      <IngBlock x={ingX} y={20} w={16} n={6} />
      <Lines x={prepX} y={20} w={25} n={11} />
    </Page>
  );
}

/** Ordre des blocs dans les modèles en une colonne. */
export function BlockOrderThumb({ ingFirst }: { ingFirst: boolean }) {
  return (
    <Page>
      <TitleBar y={7} align="left" w={32} />
      {ingFirst ? (
        <>
          <IngBlock x={9} y={19} w={42} n={4} />
          <Lines x={7} y={42} w={46} n={7} />
        </>
      ) : (
        <>
          <Lines x={7} y={18} w={46} n={7} />
          <IngBlock x={9} y={52} w={42} n={4} />
        </>
      )}
    </Page>
  );
}

/** Largeur de la colonne ingrédients. */
export function IngRatioThumb({ ratio }: { ratio: IngredientRatio }) {
  const pct = ratio === "narrow" ? 0.38 : ratio === "balanced" ? 0.48 : 0.58;
  const inner = 46;
  const ingW = inner * pct - 2;
  return (
    <Page>
      <TitleBar y={7} />
      <IngBlock x={7} y={20} w={ingW} n={6} />
      <Lines x={7 + ingW + 5} y={20} w={inner - ingW - 5} n={11} />
    </Page>
  );
}

// ─── Titre ───────────────────────────────────────────────────────────────────

/** Alignement du titre (et des lignes juste en dessous). */
export function TitleAlignThumb({ align, layout }: { align: TitleAlign; layout: RecipeLayout }) {
  const a = align === "auto" ? (layout === "classique" ? "center" : "left") : align;
  const subW = 18;
  const subX = a === "left" ? 7 : a === "right" ? W - 7 - subW : (W - subW) / 2;
  return (
    <Page>
      <TitleBar y={9} align={a} w={32} h={4.5} />
      <Lines x={subX} y={19} w={subW} n={2} short={false} />
      <Lines x={7} y={34} w={46} n={9} />
      {align === "auto" && (
        <text x={W - 6} y={H - 5} textAnchor="end" fontSize={7} fill={ACC} fontWeight={700}>
          auto
        </text>
      )}
    </Page>
  );
}

/** Style du titre de la recette. */
export function TitleStyleThumb({ style }: { style: TitleStyle }) {
  return (
    <Page>
      {style === "band" ? (
        <>
          <rect x={6} y={8} width={48} height={11} rx={1.5} fill={ACC} />
          <rect x={16} y={12} width={28} height={3} rx={1} fill="#ffffff" />
        </>
      ) : (
        <TitleBar y={10} w={30} h={4.5} />
      )}
      {style === "underline" && <line x1={24} y1={20} x2={36} y2={20} stroke={ACC} strokeWidth={1.4} />}
      {style === "ornament" && (
        <>
          <line x1={14} y1={21} x2={27} y2={21} stroke={ACC} strokeWidth={0.8} />
          <circle cx={30} cy={21} r={1.5} fill={ACC} />
          <line x1={33} y1={21} x2={46} y2={21} stroke={ACC} strokeWidth={0.8} />
        </>
      )}
      <Lines x={7} y={32} w={46} n={10} />
    </Page>
  );
}

// ─── Espacement ──────────────────────────────────────────────────────────────

export function DensityThumb({ density }: { density: Density }) {
  const gap = density === "compact" ? 3.2 : density === "normal" ? 4.6 : 6.4;
  const n = Math.floor(52 / gap);
  return (
    <Page>
      <TitleBar y={density === "airy" ? 9 : 6} />
      <Lines x={7} y={density === "airy" ? 22 : 17} w={46} n={n} gap={gap} />
    </Page>
  );
}

// ─── Styles des éléments ─────────────────────────────────────────────────────

/** Intertitres « Ingrédients » / « Préparation ». */
export function SectionTitleThumb({ style }: { style: SectionTitleStyle }) {
  const head = (y: number) => {
    switch (style) {
      case "simple":
        return <rect x={7} y={y} width={22} height={3.6} rx={1} fill={ACC} />;
      case "underline":
        return (
          <>
            <rect x={7} y={y} width={22} height={3.6} rx={1} fill={ACC} />
            <line x1={7} y1={y + 6} x2={53} y2={y + 6} stroke={ACC} strokeWidth={1} />
          </>
        );
      case "caps":
        return (
          <text x={7} y={y + 4} fontSize={5.4} letterSpacing={1.4} fontWeight={700} fill={ACC}>
            INGRÉD.
          </text>
        );
      case "pill":
        return (
          <>
            <rect x={7} y={y - 1} width={26} height={6} rx={3} fill={ACC} />
            <rect x={11} y={y + 1.2} width={18} height={1.6} rx={0.8} fill="#ffffff" />
          </>
        );
    }
  };
  return (
    <Page>
      {head(9)}
      <Lines x={7} y={20} w={46} n={4} />
      {head(42)}
      <Lines x={7} y={53} w={46} n={5} />
    </Page>
  );
}

/** Présentation de la liste d'ingrédients. */
export function IngStyleThumb({ style }: { style: IngredientStyle }) {
  const rows = [0, 1, 2, 3, 4, 5, 6];
  return (
    <Page>
      {style === "boxed" && <rect x={5} y={7} width={50} height={64} rx={4} fill={ACC} fillOpacity={0.08} stroke={ACC} strokeOpacity={0.45} />}
      {rows.map((i) => {
        const y = 15 + i * 8;
        if (style === "leaders") {
          return (
            <g key={i}>
              <line x1={9} y1={y} x2={26} y2={y} stroke={INK} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
              <line x1={28} y1={y} x2={42} y2={y} stroke={INK} strokeWidth={0.9} strokeDasharray="0.6 1.6" strokeLinecap="round" />
              <line x1={44} y1={y} x2={51} y2={y} stroke={ACC} strokeWidth={1.4} strokeLinecap="round" />
            </g>
          );
        }
        return (
          <g key={i}>
            <line x1={9} y1={y} x2={17} y2={y} stroke={ACC} strokeWidth={1.4} strokeLinecap="round" />
            <line x1={20} y1={y} x2={i % 2 ? 40 : 48} y2={y} stroke={INK} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
          </g>
        );
      })}
    </Page>
  );
}

/** Numéros des étapes. */
export function StepStyleThumb({ style }: { style: StepStyle }) {
  return (
    <Page>
      {[0, 1, 2].map((i) => {
        const y = 12 + i * 22;
        return (
          <g key={i}>
            {style === "circles" ? (
              <>
                <circle cx={11} cy={y + 1} r={3.6} fill={ACC} />
                <text x={11} y={y + 3} textAnchor="middle" fontSize={5.4} fontWeight={700} fill="#ffffff">
                  {i + 1}
                </text>
              </>
            ) : (
              <text x={7} y={y + 3} fontSize={6.4} fontWeight={700} fill={ACC}>
                {i + 1}.
              </text>
            )}
            <Lines x={18} y={y + 1} w={35} n={3} />
          </g>
        );
      })}
    </Page>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

/** Fond de page. */
export function PaperThumb({ paper }: { paper: Paper }) {
  const bg = PAPER_COLORS[paper] ?? "#ffffff";
  return (
    <Page bg={bg}>
      <TitleBar y={8} w={26} />
      {paper === "grid" &&
        Array.from({ length: 11 }, (_, i) => (
          <g key={i} stroke="#cfdbe8" strokeWidth={0.5}>
            <line x1={(i + 1) * 5.5} y1={1} x2={(i + 1) * 5.5} y2={H - 1} />
            <line x1={1} y1={(i + 1) * 6.5} x2={W - 1} y2={(i + 1) * 6.5} />
          </g>
        ))}
      {paper === "lined" && (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={1} y1={12 + i * 7} x2={W - 1} y2={12 + i * 7} stroke="#cfdcec" strokeWidth={0.6} />
          ))}
          <line x1={7} y1={1} x2={7} y2={H - 1} stroke="#eeb4b4" strokeWidth={0.7} />
        </>
      )}
    </Page>
  );
}

/** Décor répété sur chaque page. */
export function FrameThumb({ frame }: { frame: PageFrame }) {
  let inner: React.ReactNode = null;
  switch (frame) {
    case "line":
      inner = <rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke={ACC} strokeWidth={0.9} />;
      break;
    case "double":
      inner = (
        <>
          <rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke={ACC} strokeWidth={1.4} />
          <rect x={6} y={6} width={W - 12} height={H - 12} fill="none" stroke={ACC} strokeWidth={0.5} />
        </>
      );
      break;
    case "corners":
      inner = (
        <g stroke={ACC} strokeWidth={1.4} fill="none">
          <polyline points={`4,14 4,4 14,4`} />
          <polyline points={`${W - 14},4 ${W - 4},4 ${W - 4},14`} />
          <polyline points={`4,${H - 14} 4,${H - 4} 14,${H - 4}`} />
          <polyline points={`${W - 14},${H - 4} ${W - 4},${H - 4} ${W - 4},${H - 14}`} />
        </g>
      );
      break;
    case "side":
      inner = <rect x={1} y={1} width={3.5} height={H - 2} fill={ACC} />;
      break;
    case "band":
      inner = <rect x={1} y={1} width={W - 2} height={4.5} fill={ACC} />;
      break;
  }
  return (
    <Page>
      {inner}
      <Lines x={12} y={18} w={36} n={10} />
    </Page>
  );
}

/** Format A4 / A5 (à la même échelle). */
export function FormatThumb({ format }: { format: "A4" | "A5" }) {
  const s = format === "A4" ? 1 : 0.71;
  const w = W * s;
  const h = H * s;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={42} height={56} aria-hidden style={{ display: "block" }}>
      <rect x={(W - w) / 2 + 0.5} y={H - h + 0.5} width={w - 1} height={h - 1} rx={3} fill="var(--card)" stroke="var(--border2)" />
      <text x={W / 2} y={H - h / 2 + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill={ACC}>
        {format}
      </text>
    </svg>
  );
}

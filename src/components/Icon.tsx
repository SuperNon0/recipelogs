/**
 * Wrapper autour de `lucide-react` avec des variantes de couleur alignées
 * sur la palette FuelLog. Toutes les icônes du site passent par ce composant
 * — l'objectif est de remplacer les emojis unicode (📁 🔗 🔒 …) qui rendent
 * mal en dark mode + varient selon la plateforme.
 *
 * Usage :
 *   <Icon name="Folder" tone="accent" />
 *   <Icon name="Trash2" tone="danger" size={18} />
 *   <Icon name="Star" fill style={{ color: "var(--accent)" }} />
 */
import * as Lucide from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { CSSProperties, ComponentType } from "react";

type Tone =
  | "text"
  | "muted"
  | "accent"
  | "accent2"
  | "pending"
  | "danger"
  | "inherit";

const TONE_COLOR: Record<Tone, string> = {
  text: "var(--text)",
  muted: "var(--muted)",
  accent: "var(--accent)",
  accent2: "var(--accent-2)",
  pending: "var(--pending)",
  danger: "var(--danger)",
  inherit: "currentColor",
};

export type IconName = keyof typeof Lucide;

export function Icon({
  name,
  tone = "inherit",
  size = 16,
  strokeWidth = 1.75,
  fill = false,
  style,
  className,
  ...rest
}: {
  name: IconName;
  tone?: Tone;
  size?: number;
  strokeWidth?: number;
  fill?: boolean;
  style?: CSSProperties;
  className?: string;
} & Omit<LucideProps, "size" | "strokeWidth" | "fill" | "color">) {
  const Cmp = Lucide[name] as ComponentType<LucideProps> | undefined;
  if (!Cmp || typeof Cmp !== "function") {
    // Fallback silencieux : un carré vide pour ne pas casser le rendu si
    // le nom est mal orthographié.
    return (
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: size,
          height: size,
          ...style,
        }}
        className={className}
      />
    );
  }
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      color={TONE_COLOR[tone]}
      fill={fill ? TONE_COLOR[tone] : "none"}
      aria-hidden
      focusable={false}
      className={className}
      style={{ flexShrink: 0, verticalAlign: "-2px", ...style }}
      {...rest}
    />
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { ContextArea, MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { ModalOverlay } from "@/components/ModalOverlay";
import { ThemeThumb } from "@/components/ThemeThumb";
import { ThemePreviewPanel, type RecipeChoice } from "./ThemePreviewPanel";
import {
  createPdfTheme,
  deletePdfTheme,
  movePdfTheme,
  resetPdfTheme,
  setDefaultPdfTheme,
} from "@/app/actions/pdfThemes";
import { FONT_LABELS, RECIPE_LAYOUT_LABELS, PAPER_LABELS, type CookbookTheme } from "@/lib/pdf/theme";

export type ThemeCard = {
  id: number;
  name: string;
  description: string | null;
  presetKey: string | null;
  format: "A4" | "A5";
  isDefault: boolean;
  config: CookbookTheme;
};

/** Grille des thèmes PDF, chacun avec son menu (aperçu, modifier, dupliquer…). */
export function ThemeList({ themes, recipes }: { themes: ThemeCard[]; recipes: RecipeChoice[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ThemeCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Action impossible.");
      router.refresh();
    });

  const createFrom = (fromId?: number) =>
    startTransition(async () => {
      const r = await createPdfTheme(fromId);
      if (r.ok) router.push(`/settings/themes/${r.id}`);
      else setError(r.error);
    });

  const specFor = (t: ThemeCard, i: number): MenuSpec => ({
    title: t.name,
    icon: Palette,
    head: (
      <>
        <ThemeThumb config={t.config} width={34} />
        <div>
          <b>{t.name}</b>
          <small>{RECIPE_LAYOUT_LABELS[t.config.recipeLayout]} · {t.format}</small>
        </div>
      </>
    ),
    quick: [
      { label: "Aperçu", icon: Eye, onSelect: () => setPreview(t) },
      { label: "Modifier", icon: Pencil, href: `/settings/themes/${t.id}` },
      { label: "Dupliquer", icon: Copy, onSelect: () => createFrom(t.id) },
    ],
    items: [
      { label: "Aperçu", icon: Eye, onSelect: () => setPreview(t) },
      { label: "Modifier", icon: Pencil, href: `/settings/themes/${t.id}`, hint: "Entrée" },
      { label: "Dupliquer", icon: Copy, onSelect: () => createFrom(t.id) },
      { separator: true },
      {
        label: t.isDefault ? "Thème par défaut" : "Utiliser par défaut",
        icon: Star,
        disabled: t.isDefault,
        onSelect: () => run(() => setDefaultPdfTheme(t.id)),
      },
      ...(t.presetKey
        ? [{
            label: "Revenir à l'original",
            icon: RotateCcw,
            onSelect: () => {
              if (confirm(`Remettre « ${t.name} » dans son état d'origine ? Tes modifications de ce thème seront perdues.`)) {
                run(() => resetPdfTheme(t.id));
              }
            },
          }]
        : []),
      { label: "Monter", icon: ArrowUp, disabled: i === 0, onSelect: () => run(() => movePdfTheme(t.id, -1)) },
      { label: "Descendre", icon: ArrowDown, disabled: i === themes.length - 1, onSelect: () => run(() => movePdfTheme(t.id, 1)) },
      { separator: true },
      {
        label: "Supprimer…",
        icon: Trash2,
        danger: true,
        disabled: themes.length <= 1,
        onSelect: () => {
          if (confirm(`Supprimer le thème « ${t.name} » ?`)) run(() => deletePdfTheme(t.id));
        },
      },
    ],
  });

  return (
    <>
      {error && (
        <p className="fl-card" style={{ color: "var(--danger)", borderColor: "rgba(239,125,107,.35)", padding: "10px 14px", marginBottom: 14 }}>
          {error}
        </p>
      )}
      <div className="theme-grid" style={{ opacity: pending ? 0.6 : 1 }}>
        {themes.map((t, i) => (
          <ContextArea key={t.id} spec={() => specFor(t, i)} className="theme-card">
            <Link href={`/settings/themes/${t.id}`} className="theme-card-link" aria-label={`Modifier ${t.name}`}>
              <div className="theme-card-thumb">
                <ThemeThumb config={t.config} width={92} />
              </div>
              <div style={{ minWidth: 0 }}>
                <b>{t.name}</b>
                <small>
                  {RECIPE_LAYOUT_LABELS[t.config.recipeLayout]} · {FONT_LABELS[t.config.titleFont] ?? t.config.titleFont} · {PAPER_LABELS[t.config.paper]} · {t.format}
                </small>
                {t.description && <p>{t.description}</p>}
              </div>
            </Link>
            <div className="theme-card-top">
              {t.isDefault && (
                <span className="fl-tag" style={{ color: "var(--accent)", borderColor: "rgba(240,166,74,.35)", background: "var(--accent-dim)" }}>
                  <Star size={11} /> Par défaut
                </span>
              )}
              {!t.presetKey && <span className="fl-tag">Perso</span>}
              <MoreButton spec={() => specFor(t, i)} label={`Actions pour ${t.name}`} horizontal />
            </div>
          </ContextArea>
        ))}
        <button type="button" className="theme-card theme-card-new" onClick={() => createFrom()} disabled={pending}>
          <Plus size={22} />
          <b>Nouveau thème</b>
          <small>Part du style classique, à personnaliser</small>
        </button>
      </div>

      {preview && (
        <ModalOverlay wide onClose={() => setPreview(null)} title={<>Aperçu · {preview.name}</>}>
          <ThemePreviewPanel config={preview.config} format={preview.format} recipes={recipes} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setPreview(null)}>
              Fermer
            </button>
            <Link href={`/settings/themes/${preview.id}`} className="fl-btn fl-btn-primary">
              <Pencil size={15} /> Modifier ce thème
            </Link>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}

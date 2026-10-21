"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ContextArea, MoreButton, type MenuEntry, type MenuSpec } from "@/components/ui/Menu";
import { EmptyState } from "@/components/EmptyState";
import type { ActionResult } from "@/lib/actionResult";
import { DATA_COLORS, NameColorModal } from "./NameColorModal";

export type ColoredItem = { id: number; name: string; color: string; count: number };

type Editing =
  | { mode: "create" }
  | { mode: "rename" | "color"; item: ColoredItem };

/**
 * Liste de dossiers ou de catégories : pastille de couleur, nombre de
 * recettes, menu « ⋯ » / clic droit (ouvrir, renommer, couleur, supprimer…).
 * Le bouton « Nouveau » est passé à `head`, qui rend l'en-tête de page.
 */
export function ColoredItemList({
  items,
  icon,
  noun,
  newLabel,
  placeholder,
  hrefOf,
  extraEntries,
  confirmDelete,
  create,
  update,
  remove,
  head,
  emptyTitle,
  emptyText,
}: {
  items: ColoredItem[];
  icon: LucideIcon;
  /** Ex. { the: "le dossier", of: "du dossier" } (titres des fenêtres et menus). */
  noun: { the: string; of: string };
  newLabel: string;
  placeholder: string;
  hrefOf: (item: ColoredItem) => string;
  extraEntries?: (item: ColoredItem) => MenuEntry[];
  confirmDelete: (item: ColoredItem) => string;
  create: (fd: FormData) => Promise<ActionResult>;
  update: (id: number, fd: FormData) => Promise<ActionResult>;
  remove: (id: number) => Promise<ActionResult>;
  head: (newButton: React.ReactNode) => React.ReactNode;
  emptyTitle: string;
  emptyText: string;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toForm = (name: string, color: string) => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("color", color);
    return fd;
  };

  function setColor(item: ColoredItem, color: string) {
    setError(null);
    startTransition(async () => {
      const r = await update(item.id, toForm(item.name, color));
      if (!r.ok) setError(r.error);
    });
  }

  function handleDelete(item: ColoredItem) {
    if (!confirm(confirmDelete(item))) return;
    setError(null);
    startTransition(async () => {
      const r = await remove(item.id);
      if (!r.ok) setError(r.error);
    });
  }

  const Icon = icon;
  const specOf = (item: ColoredItem): MenuSpec => ({
    title: item.name,
    icon,
    items: [
      { label: "Voir les recettes", icon: ExternalLink, href: hrefOf(item) },
      ...(extraEntries?.(item) ?? []),
      { separator: true },
      { label: "Renommer…", icon: Pencil, onSelect: () => setEditing({ mode: "rename", item }) },
      {
        label: "Couleur",
        icon: Palette,
        submenu: [
          ...DATA_COLORS.map((c) => ({
            label: c.label,
            dot: c.hex,
            checked: c.hex.toLowerCase() === item.color.toLowerCase(),
            onSelect: () => setColor(item, c.hex),
          })),
          { separator: true } as MenuEntry,
          { label: "Autre couleur…", icon: Palette, onSelect: () => setEditing({ mode: "color", item }) },
        ],
      },
      { separator: true },
      { label: "Supprimer…", icon: Trash2, danger: true, onSelect: () => handleDelete(item) },
    ],
  });

  const newButton = (
    <button type="button" className="fl-btn fl-btn-primary" onClick={() => setEditing({ mode: "create" })}>
      <Plus size={16} /> {newLabel}
    </button>
  );

  return (
    <>
      {head(newButton)}

      {error && <p className="set-error" style={{ marginBottom: 12 }}>{error}</p>}

      {items.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} description={emptyText} />
      ) : (
        <div className="fl-list" style={{ opacity: pending ? 0.7 : 1, transition: "opacity 120ms" }}>
          {items.map((item) => (
            <ContextArea key={item.id} spec={() => specOf(item)} className="fl-row set-item">
              <Link href={hrefOf(item)} className="set-item-main">
                <span className="ic set-ic-c" style={{ "--c": item.color } as React.CSSProperties}>
                  <Icon size={17} />
                </span>
                <span className="set-tx">
                  <b>
                    <span>{item.name}</span>
                  </b>
                  <small>
                    {item.count === 0 ? "Aucune recette" : `${item.count} recette${item.count > 1 ? "s" : ""}`}
                  </small>
                </span>
              </Link>
              <MoreButton spec={() => specOf(item)} label={`Actions pour ${noun.the} ${item.name}`} />
            </ContextArea>
          ))}
        </div>
      )}

      {editing?.mode === "create" && (
        <NameColorModal
          title={newLabel}
          submitLabel="Créer"
          icon={icon}
          placeholder={placeholder}
          onClose={() => setEditing(null)}
          onSubmit={async (name, color) => {
            const r = await create(toForm(name, color));
            return r.ok ? null : r.error;
          }}
        />
      )}
      {(editing?.mode === "rename" || editing?.mode === "color") && (
        <NameColorModal
          title={editing.mode === "rename" ? `Renommer ${noun.the}` : `Couleur ${noun.of}`}
          submitLabel="Enregistrer"
          icon={icon}
          fields={editing.mode === "rename" ? "name" : "color"}
          initialName={editing.item.name}
          initialColor={editing.item.color}
          placeholder={placeholder}
          onClose={() => setEditing(null)}
          onSubmit={async (name, color) => {
            const r = await update(editing.item.id, toForm(name, color));
            return r.ok ? null : r.error;
          }}
        />
      )}
    </>
  );
}

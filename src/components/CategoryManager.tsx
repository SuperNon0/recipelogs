"use client";

import { useState, useTransition } from "react";
import { createCategory, updateCategory, deleteCategory } from "@/app/actions/settings";

type Category = { id: number; name: string; color: string };

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    void startTransition(async (): Promise<void> => {
      const result = await createCategory(fd);
      if (result.ok) {
        setShowCreate(false);
        (e.target as HTMLFormElement).reset();
      } else {
        setError(result.error);
      }
    });
  }

  function handleUpdate(id: number, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    void startTransition(async (): Promise<void> => {
      const result = await updateCategory(id, fd);
      if (result.ok) setEditingId(null);
      else setError(result.error);
    });
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Supprimer la catégorie « ${name} » ? Les recettes ne seront pas supprimées.`)) return;
    void startTransition(async (): Promise<void> => {
      await deleteCategory(id);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {categories.map((cat) =>
        editingId === cat.id ? (
          <form
            key={cat.id}
            onSubmit={(e) => handleUpdate(cat.id, e)}
            className="flex items-center gap-2"
          >
            <input type="color" name="color" defaultValue={cat.color} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <input
              name="name"
              defaultValue={cat.name}
              required
              maxLength={100}
              className="fl-input flex-1"
              style={{ fontSize: "0.9rem" }}
            />
            <button type="submit" disabled={pending} className="fl-btn fl-btn-primary" style={{ fontSize: "0.8rem" }}>
              ✓
            </button>
            <button type="button" onClick={() => setEditingId(null)} className="fl-btn fl-btn-secondary" style={{ fontSize: "0.8rem" }}>
              ✕
            </button>
          </form>
        ) : (
          <div key={cat.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-1">
            <div
              className="flex items-center gap-2 min-w-0 sm:flex-1"
              style={{
                padding: "0.4rem 0.75rem",
                background: `${cat.color}1a`,
                border: `1px solid ${cat.color}55`,
                borderRadius: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: cat.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "0.9rem",
                  color: "var(--text)",
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {cat.name}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditingId(cat.id)}
                className="fl-btn fl-btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
              >
                Éditer
              </button>
              <button
                type="button"
                onClick={() => handleDelete(cat.id, cat.name)}
                disabled={pending}
                className="fl-btn"
                style={{
                  fontSize: "0.75rem",
                  padding: "0.3rem 0.6rem",
                  color: "var(--danger)",
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        ),
      )}

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      {showCreate ? (
        <form onSubmit={handleCreate} className="flex items-center gap-2 mt-1">
          <input type="color" name="color" defaultValue="#888888" className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Nom de la catégorie"
            className="fl-input flex-1"
            style={{ fontSize: "0.9rem" }}
            autoFocus
          />
          <button type="submit" disabled={pending} className="fl-btn fl-btn-primary" style={{ fontSize: "0.8rem" }}>
            Créer
          </button>
          <button type="button" onClick={() => setShowCreate(false)} className="fl-btn fl-btn-secondary" style={{ fontSize: "0.8rem" }}>
            Annuler
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="fl-btn fl-btn-secondary self-start"
          style={{ fontSize: "0.8rem", marginTop: 4 }}
        >
          + Nouvelle catégorie
        </button>
      )}
    </div>
  );
}

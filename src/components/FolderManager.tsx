"use client";

import { useState, useTransition } from "react";
import { createFolder, updateFolder, deleteFolder } from "@/app/actions/settings";
import { AddRecipesToFolderModal } from "./AddRecipesToFolderModal";

type Folder = {
  id: number;
  name: string;
  color: string;
  _count: { recipes: number };
};

export function FolderManager({ folders }: { folders: Folder[] }) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [addingToFolder, setAddingToFolder] = useState<Folder | null>(null);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    const form = e.currentTarget;
    void startTransition(async (): Promise<void> => {
      const result = await createFolder(fd);
      if (result.ok) {
        setShowCreate(false);
        form.reset();
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
      const result = await updateFolder(id, fd);
      if (result.ok) setEditingId(null);
      else setError(result.error);
    });
  }

  function handleDelete(id: number, name: string, count: number) {
    const msg =
      count > 0
        ? `Supprimer le dossier « ${name} » ?\n\nLes ${count} recette${count > 1 ? "s" : ""} de ce dossier passeront en « Sans dossier ». Aucune recette ne sera supprimée.`
        : `Supprimer le dossier « ${name} » ?`;
    if (!confirm(msg)) return;
    void startTransition(async (): Promise<void> => {
      await deleteFolder(id);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {folders.length === 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          Aucun dossier pour le moment.
        </p>
      )}

      {folders.map((f) =>
        editingId === f.id ? (
          <form
            key={f.id}
            onSubmit={(e) => handleUpdate(f.id, e)}
            className="flex items-center gap-2"
          >
            <input
              type="color"
              name="color"
              defaultValue={f.color}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              name="name"
              defaultValue={f.name}
              required
              maxLength={100}
              className="fl-input flex-1"
              style={{ fontSize: "0.9rem" }}
            />
            <button
              type="submit"
              disabled={pending}
              className="fl-btn fl-btn-primary"
              style={{ fontSize: "0.8rem" }}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.8rem" }}
            >
              ✕
            </button>
          </form>
        ) : (
          <div
            key={f.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 py-1"
          >
            {/* Pastille colorée + nom — pleine largeur sur mobile */}
            <div
              className="flex items-center gap-2 min-w-0 sm:flex-1"
              style={{
                padding: "0.4rem 0.75rem",
                background: `${f.color}1a`,
                border: `1px solid ${f.color}55`,
                borderRadius: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: f.color,
                  flexShrink: 0,
                }}
              />
              <span
                className="fl-title-serif"
                style={{
                  fontSize: "0.95rem",
                  color: "var(--text)",
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.name}
              </span>
              <span
                className="fl-label"
                style={{ fontSize: "0.7rem", marginLeft: 4, flexShrink: 0 }}
              >
                · {f._count.recipes} recette{f._count.recipes > 1 ? "s" : ""}
              </span>
            </div>
            {/* Boutons groupés sur une ligne */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setAddingToFolder(f)}
                className="fl-btn fl-btn-primary"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                title="Ranger des recettes existantes dans ce dossier"
              >
                + Ajouter
              </button>
              <button
                type="button"
                onClick={() => setEditingId(f.id)}
                className="fl-btn fl-btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
              >
                Éditer
              </button>
              <button
                type="button"
                onClick={() => handleDelete(f.id, f.name, f._count.recipes)}
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

      {addingToFolder && (
        <AddRecipesToFolderModal
          folder={addingToFolder}
          onClose={() => setAddingToFolder(null)}
        />
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {showCreate ? (
        <form onSubmit={handleCreate} className="flex items-center gap-2 mt-1">
          <input
            type="color"
            name="color"
            defaultValue="#888888"
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Nom du dossier"
            className="fl-input flex-1"
            style={{ fontSize: "0.9rem" }}
            autoFocus
          />
          <button
            type="submit"
            disabled={pending}
            className="fl-btn fl-btn-primary"
            style={{ fontSize: "0.8rem" }}
          >
            Créer
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="fl-btn fl-btn-secondary"
            style={{ fontSize: "0.8rem" }}
          >
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
          + Nouveau dossier
        </button>
      )}
    </div>
  );
}

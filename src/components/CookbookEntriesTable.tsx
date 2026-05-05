"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  reorderCookbookEntries,
  toggleGroupWithPrevious,
  setSectionTitle,
  refreshSnapshot,
  convertToLinked,
  removeFromCookbook,
  deleteChapter,
  updateChapter,
  addChapter,
} from "@/app/actions/cookbooks";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecipeEntry = {
  type: "recipe";
  id: number;
  position: number;
  recipeId: number;
  recipeName: string;
  categories: { name: string; color: string }[];
  linkMode: "linked" | "snapshot";
  subrecipeMode: "single" | "separate";
  groupWithPrevious: boolean;
  sectionTitle: string | null;
  snapshotDate: Date | null;
};

export type ChapterEntry = {
  type: "chapter";
  id: number;
  position: number;
  title: string;
  intro: string | null;
};

export type Entry = RecipeEntry | ChapterEntry;

const DND_ID = (e: Entry) => `${e.type}-${e.id}`;

// ─── Composant principal ─────────────────────────────────────────────────────

export function CookbookEntriesTable({
  cookbookId,
  initial,
}: {
  cookbookId: number;
  initial: Entry[];
}) {
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [pending, startTransition] = useTransition();

  // Sync l'état local avec les props quand le serveur revalide
  useEffect(() => {
    setEntries(initial);
  }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = entries.findIndex((e) => DND_ID(e) === active.id);
    const newIndex = entries.findIndex((e) => DND_ID(e) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(entries, oldIndex, newIndex);
    setEntries(next); // optimistic

    startTransition(async () => {
      const r = await reorderCookbookEntries(
        cookbookId,
        next.map((e) => ({ type: e.type, id: e.id })),
      );
      if (!r.ok) {
        // rollback
        setEntries(entries);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="fl-label" style={{ color: "var(--text)" }}>
          {entries.length} entrée{entries.length > 1 ? "s" : ""}
          {pending && (
            <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 8 }}>
              · synchronisation…
            </span>
          )}
        </p>
        <AddChapterButton cookbookId={cookbookId} />
      </div>

      {entries.length === 0 ? (
        <div className="fl-card text-center py-8">
          <p className="text-[color:var(--muted)] text-sm">
            Aucune entrée dans ce cahier.
          </p>
          <p className="text-[color:var(--muted)] text-xs mt-1">
            Ajoute des recettes depuis leur fiche, ou crée un chapitre ci-dessus.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={entries.map(DND_ID)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className="flex flex-col rounded-md overflow-hidden border"
              style={{ borderColor: "var(--border)" }}
            >
              {entries.map((entry, idx) => (
                <SortableEntryRow
                  key={DND_ID(entry)}
                  entry={entry}
                  index={idx}
                  cookbookId={cookbookId}
                  isFirst={idx === 0}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

// ─── Sortable wrapper ─────────────────────────────────────────────────────────

function SortableEntryRow({
  entry,
  index,
  cookbookId,
  isFirst,
}: {
  entry: Entry;
  index: number;
  cookbookId: number;
  isFirst: boolean;
}) {
  const sortable = useSortable({ id: DND_ID(entry) });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
    background: sortable.isDragging ? "var(--card)" : "transparent",
    borderTop: index === 0 ? "none" : "1px solid var(--border)",
  };

  return (
    <div ref={sortable.setNodeRef} style={style}>
      {entry.type === "recipe" ? (
        <RecipeRow
          entry={entry}
          index={index}
          cookbookId={cookbookId}
          isFirst={isFirst}
          dragHandleProps={{ ...sortable.attributes, ...sortable.listeners }}
        />
      ) : (
        <ChapterRow
          entry={entry}
          cookbookId={cookbookId}
          dragHandleProps={{ ...sortable.attributes, ...sortable.listeners }}
        />
      )}
    </div>
  );
}

// ─── Recipe row ───────────────────────────────────────────────────────────────

function RecipeRow({
  entry,
  index,
  cookbookId,
  isFirst,
  dragHandleProps,
}: {
  entry: RecipeEntry;
  index: number;
  cookbookId: number;
  isFirst: boolean;
  dragHandleProps: Record<string, unknown>;
}) {
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(false);
  const [sectionDraft, setSectionDraft] = useState(entry.sectionTitle ?? "");

  const linkBadge =
    entry.linkMode === "linked"
      ? { emoji: "🔗", title: "Liée", color: "var(--accent-2)" }
      : { emoji: "📌", title: "Figée", color: "var(--pending)" };
  const subBadge =
    entry.subrecipeMode === "single"
      ? { emoji: "📄", title: "Fiche unique" }
      : { emoji: "📚", title: "Sous-recettes séparées" };

  function handleSaveSection() {
    const v = sectionDraft.trim();
    startTransition(async () => {
      await setSectionTitle(entry.id, v, cookbookId);
      setEditingSection(false);
    });
  }

  return (
    <>
      {/* Section title above the recipe */}
      {entry.sectionTitle && !editingSection && (
        <div
          className="px-3 pt-3 pb-1 flex items-center justify-between gap-2"
          style={{ background: "var(--surface)" }}
        >
          <span
            className="fl-title-serif"
            style={{ fontSize: "0.95rem", color: "var(--accent)" }}
          >
            ▸ {entry.sectionTitle}
          </span>
          <button
            type="button"
            onClick={() => setEditingSection(true)}
            className="fl-label hover:text-[color:var(--text)]"
            style={{ fontSize: "0.7rem" }}
          >
            Modifier section
          </button>
        </div>
      )}
      {editingSection && (
        <div
          className="px-3 py-2 flex items-center gap-2 flex-wrap"
          style={{ background: "var(--surface)" }}
        >
          <input
            type="text"
            value={sectionDraft}
            onChange={(e) => setSectionDraft(e.target.value)}
            placeholder="Titre de section (vide pour retirer)"
            className="fl-input flex-1 min-w-[140px]"
            style={{ fontSize: "0.85rem" }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleSaveSection}
            disabled={pending}
            className="fl-btn fl-btn-primary"
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setSectionDraft(entry.sectionTitle ?? "");
              setEditingSection(false);
            }}
            className="fl-btn"
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
          >
            Annuler
          </button>
        </div>
      )}

      <div
        className="px-3 py-2.5 flex items-center gap-2 flex-wrap hover:bg-[color:var(--card)] transition-colors"
      >
        {/* Drag handle */}
        <button
          type="button"
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            fontSize: "1.1rem",
            padding: "0 4px",
            touchAction: "none",
          }}
          aria-label="Réorganiser"
          title="Glisser pour réorganiser"
        >
          ⋮⋮
        </button>

        {/* Position number */}
        <span
          className="fl-label"
          style={{ minWidth: 22, textAlign: "right" }}
        >
          {index + 1}
        </span>

        {/* Recipe name + categories */}
        <div className="flex-1 min-w-0 flex flex-col">
          <a
            href={`/recipes/${entry.recipeId}`}
            className="text-sm hover:underline"
            style={{ color: "var(--text)" }}
          >
            {entry.recipeName}
          </a>
          {entry.categories.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-0.5">
              {entry.categories.slice(0, 3).map((c) => (
                <span
                  key={c.name}
                  className="text-xs"
                  style={{
                    color: c.color,
                    background: `${c.color}1a`,
                    padding: "0 5px",
                    borderRadius: 999,
                    border: `1px solid ${c.color}33`,
                  }}
                >
                  {c.name}
                </span>
              ))}
              {entry.categories.length > 3 && (
                <span
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  +{entry.categories.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            title={linkBadge.title}
            style={{
              fontSize: "0.85rem",
              padding: "0 4px",
              color: linkBadge.color,
            }}
          >
            {linkBadge.emoji}
          </span>
          <span
            title={subBadge.title}
            style={{ fontSize: "0.85rem", padding: "0 4px" }}
          >
            {subBadge.emoji}
          </span>
          {entry.groupWithPrevious && !isFirst && (
            <span
              title="Collée à la précédente sur la même page"
              style={{ fontSize: "0.75rem", color: "var(--accent)" }}
            >
              ↳
            </span>
          )}
        </div>

        {/* Group toggle (compact) */}
        {!isFirst && (
          <label
            className="flex items-center gap-1 cursor-pointer flex-shrink-0"
            title="Coller à la recette précédente sur la même page"
          >
            <input
              type="checkbox"
              checked={entry.groupWithPrevious}
              disabled={pending}
              onChange={(e) =>
                startTransition(() =>
                  toggleGroupWithPrevious(entry.id, e.target.checked, cookbookId),
                )
              }
              className="accent-[color:var(--accent)]"
              style={{ width: 14, height: 14 }}
            />
            <span className="text-xs text-[color:var(--muted)] hidden sm:inline">
              ↳ même page
            </span>
          </label>
        )}

        {/* Actions menu */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="fl-btn fl-btn-secondary"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
            aria-label="Plus"
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div
                className="absolute right-0 mt-1 z-50 min-w-[220px] flex flex-col"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 4,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                <MenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    setEditingSection(true);
                    if (!entry.sectionTitle) setSectionDraft("");
                  }}
                >
                  ▸ {entry.sectionTitle ? "Modifier" : "Définir"} le titre de section
                </MenuButton>
                {entry.linkMode === "linked" ? (
                  <MenuButton
                    onClick={() =>
                      startTransition(() => {
                        setMenuOpen(false);
                        return refreshSnapshot(entry.id, cookbookId);
                      })
                    }
                  >
                    📌 Figer à cette date
                  </MenuButton>
                ) : (
                  <>
                    <MenuButton
                      onClick={() =>
                        startTransition(() => {
                          setMenuOpen(false);
                          return refreshSnapshot(entry.id, cookbookId);
                        })
                      }
                    >
                      🔄 Mettre à jour le snapshot
                    </MenuButton>
                    <MenuButton
                      onClick={() =>
                        startTransition(() => {
                          setMenuOpen(false);
                          return convertToLinked(entry.id, cookbookId);
                        })
                      }
                    >
                      🔗 Reconvertir en liée
                    </MenuButton>
                  </>
                )}
                <a
                  href={`/recipes/${entry.recipeId}`}
                  className="px-3 py-2 rounded text-sm hover:bg-[color:var(--border)]"
                >
                  Voir la fiche complète
                </a>
                <MenuButton
                  danger
                  onClick={() => {
                    if (
                      confirm(`Retirer « ${entry.recipeName} » du cahier ?`)
                    ) {
                      startTransition(() => {
                        setMenuOpen(false);
                        return removeFromCookbook(entry.id, cookbookId);
                      });
                    }
                  }}
                >
                  Retirer du cahier
                </MenuButton>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Chapter row ──────────────────────────────────────────────────────────────

function ChapterRow({
  entry,
  cookbookId,
  dragHandleProps,
}: {
  entry: ChapterEntry;
  cookbookId: number;
  dragHandleProps: Record<string, unknown>;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(entry.title);
  const [introDraft, setIntroDraft] = useState(entry.intro ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await updateChapter(
        entry.id,
        { title: titleDraft, intro: introDraft },
        cookbookId,
      );
      if (r.ok) {
        setEditing(false);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div
      className="px-3 py-3 flex items-start gap-2"
      style={{
        background: "rgba(232, 197, 71, 0.06)",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <button
        type="button"
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing mt-1"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          fontSize: "1.1rem",
          padding: "0 4px",
          touchAction: "none",
        }}
        aria-label="Réorganiser"
      >
        ⋮⋮
      </button>

      {!editing ? (
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="fl-label"
                style={{ color: "var(--accent)", fontSize: "0.7rem" }}
              >
                CHAPITRE
              </span>
              <span
                className="fl-title-serif"
                style={{ fontSize: "1.05rem", color: "var(--text)" }}
              >
                {entry.title}
              </span>
            </div>
            {entry.intro && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}
              >
                {entry.intro.length > 140
                  ? `${entry.intro.slice(0, 140)}…`
                  : entry.intro}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="fl-btn fl-btn-secondary flex-shrink-0"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
          >
            Éditer
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Supprimer le chapitre « ${entry.title} » ?`)) {
                startTransition(() => deleteChapter(entry.id, cookbookId));
              }
            }}
            className="fl-btn fl-btn-secondary flex-shrink-0"
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              color: "var(--danger)",
            }}
          >
            ✕
          </button>
        </>
      ) : (
        <div className="flex-1 flex flex-col gap-2">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="Titre du chapitre"
            className="fl-input"
            maxLength={200}
            autoFocus
          />
          <textarea
            value={introDraft}
            onChange={(e) => setIntroDraft(e.target.value)}
            placeholder="Intro (optionnelle, affichée sur la page chapitre du PDF)"
            rows={3}
            maxLength={5000}
            className="fl-input"
          />
          {error && (
            <span className="text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="fl-btn fl-btn-primary"
              style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTitleDraft(entry.title);
                setIntroDraft(entry.intro ?? "");
                setEditing(false);
                setError(null);
              }}
              className="fl-btn"
              style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add chapter button ───────────────────────────────────────────────────────

function AddChapterButton({ cookbookId }: { cookbookId: number }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const r = await addChapter(cookbookId, { title, intro });
      if (r.ok) {
        setTitle("");
        setIntro("");
        setOpen(false);
      } else {
        setError(r.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fl-btn fl-btn-secondary"
        style={{ fontSize: "0.8rem" }}
      >
        + Ajouter un chapitre
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-md w-full max-w-md"
      style={{ background: "var(--card)", border: "1px solid var(--accent)" }}
    >
      <span className="fl-label">Nouveau chapitre</span>
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre"
        className="fl-input"
        maxLength={200}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <textarea
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
        placeholder="Intro (optionnelle)"
        rows={2}
        maxLength={5000}
        className="fl-input"
      />
      {error && (
        <span className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !title.trim()}
          className="fl-btn fl-btn-primary"
          style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}
        >
          {pending ? "Ajout…" : "Ajouter"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
            setIntro("");
            setError(null);
          }}
          className="fl-btn"
          style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── Menu button helper ───────────────────────────────────────────────────────

function MenuButton({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 rounded text-sm text-left hover:bg-[color:var(--border)]"
      style={{ color: danger ? "var(--danger)" : undefined }}
    >
      {children}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
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
  ArrowDown,
  ArrowUp,
  BookOpen,
  BookPlus,
  FileText,
  GripVertical,
  Heading,
  Layers,
  Link2,
  Pencil,
  Pin,
  RefreshCw,
  Scale,
  Trash2,
} from "lucide-react";
import {
  reorderCookbookEntries,
  setSectionTitle,
  refreshSnapshot,
  convertToLinked,
  removeFromCookbook,
  deleteChapter,
  updateChapter,
  addChapter,
} from "@/app/actions/cookbooks";
import { ContextArea, MoreButton, type MenuSpec } from "./ui/Menu";
import { Help } from "./ui/Help";
import { ModalOverlay } from "./ModalOverlay";
import { EditSnapshotMassModal } from "./EditSnapshotMassModal";
import { AddRecipesToCookbookModal } from "./AddRecipesToCookbookModal";
import { formatG } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecipeEntry = {
  type: "recipe";
  id: number;
  position: number;
  recipeId: number;
  recipeName: string;
  photoPath: string | null;
  categories: { name: string; color: string }[];
  linkMode: "linked" | "snapshot";
  subrecipeMode: "single" | "separate";
  sectionTitle: string | null;
  snapshotDate: Date | null;
  /** Masse de la copie figée (null pour une recette liée). */
  snapshotMassG: number | null;
  /** Masse actuelle de la recette (affichée pour une recette liée). */
  linkedMassG: number;
};

export type ChapterEntry = {
  type: "chapter";
  id: number;
  position: number;
  title: string;
  intro: string | null;
};

export type Entry = RecipeEntry | ChapterEntry;

type Dialog =
  | { kind: "add" }
  | { kind: "chapter"; entry: ChapterEntry | null }
  | { kind: "section"; entry: RecipeEntry }
  | { kind: "mass"; entry: RecipeEntry };

const DND_ID = (e: Entry) => `${e.type}-${e.id}`;

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

// ─── Composant principal ─────────────────────────────────────────────────────

/**
 * Contenu du cahier : recettes et chapitres dans l'ordre du PDF.
 * Poignée pour glisser-déposer ; clic droit, appui long ou « ⋯ » pour les actions.
 */
export function CookbookEntriesTable({
  cookbookId,
  initial,
}: {
  cookbookId: number;
  initial: Entry[];
}) {
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  // Identifiant stable : évite l'écart serveur / navigateur des attributs dnd-kit.
  const dndId = useId();

  // Reprend l'état du serveur après chaque revalidation.
  useEffect(() => {
    setEntries(initial);
  }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const saveOrder = (next: Entry[]) => {
    const prev = entries;
    setEntries(next);
    startTransition(async () => {
      const r = await reorderCookbookEntries(
        cookbookId,
        next.map((e) => ({ type: e.type, id: e.id })),
      );
      if (!r.ok) setEntries(prev);
    });
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((e) => DND_ID(e) === active.id);
    const newIndex = entries.findIndex((e) => DND_ID(e) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    saveOrder(arrayMove(entries, oldIndex, newIndex));
  }

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= entries.length) return;
    saveOrder(arrayMove(entries, index, to));
  };

  const run = (fn: () => Promise<unknown>) => startTransition(async () => void (await fn()));

  // Numéro de chaque recette dans le cahier (les chapitres ne comptent pas).
  const numbers = new Map<string, number>();
  entries.filter((e) => e.type === "recipe").forEach((e, i) => numbers.set(DND_ID(e), i + 1));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", flexWrap: "wrap", marginRight: "auto" }}>
          {pending ? "Enregistrement…" : "Dans l'ordre du PDF"}
          <Help title="Chapitres et sections">
            <b>Chapitre</b> : une page à part entière dans le PDF (titre et texte d&apos;introduction),
            qui ouvre une partie du cahier. Il apparaît dans le sommaire.
            <br />
            <b>Titre de section</b> : un simple intertitre imprimé au-dessus d&apos;une recette, sans
            page dédiée. Pratique pour regrouper quelques recettes (« Les crèmes »).
            <br />
            <br />
            Glisse la poignée à gauche d&apos;une ligne pour changer l&apos;ordre, ou utilise « Monter »
            et « Descendre » dans le menu de la ligne.
          </Help>
        </p>
        <button type="button" onClick={() => setDialog({ kind: "chapter", entry: null })} className="fl-btn fl-btn-secondary">
          <BookOpen size={16} /> Chapitre
        </button>
        <button type="button" onClick={() => setDialog({ kind: "add" })} className="fl-btn fl-btn-primary">
          <BookPlus size={16} /> Ajouter des recettes
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="fl-card" style={{ textAlign: "center", padding: "36px 18px", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <p className="fl-title-serif" style={{ fontSize: 20 }}>Cahier vide</p>
          <p style={{ color: "var(--muted)", maxWidth: 420 }}>
            Ajoute des recettes avec le bouton ci-dessus, ou depuis la fiche d&apos;une recette (menu
            « Ajouter à un cahier »).
          </p>
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={entries.map(DND_ID)} strategy={verticalListSortingStrategy}>
            <div className="cb-table" style={{ opacity: pending ? 0.75 : 1, transition: "opacity 120ms ease" }}>
              <div className="cb-head desk-only">
                <span style={{ textAlign: "right" }}>N°</span>
                <span />
                <span>Recette</span>
                <span style={{ display: "flex", alignItems: "center" }}>
                  Liaison
                  <LinkHelp />
                </span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                  Masse
                  <Help title="Masse figée">
                    Pour une recette figée, la masse de la copie gardée dans le cahier : tu peux la
                    changer (menu de la ligne, « Modifier la masse figée ») sans toucher à la recette.
                    Une recette liée est imprimée avec la masse actuelle de la recette.
                  </Help>
                </span>
              </div>
              {entries.map((entry, idx) => {
                return (
                  <SortableItem key={DND_ID(entry)} id={DND_ID(entry)}>
                    {(handle) =>
                      entry.type === "recipe" ? (
                        <RecipeRow
                          entry={entry}
                          no={numbers.get(DND_ID(entry)) ?? 0}
                          cookbookId={cookbookId}
                          handle={handle}
                          canUp={idx > 0}
                          canDown={idx < entries.length - 1}
                          onMove={(d) => move(idx, d)}
                          onDialog={setDialog}
                          run={run}
                        />
                      ) : (
                        <ChapterRow
                          entry={entry}
                          cookbookId={cookbookId}
                          handle={handle}
                          canUp={idx > 0}
                          canDown={idx < entries.length - 1}
                          onMove={(d) => move(idx, d)}
                          onDialog={setDialog}
                          run={run}
                        />
                      )
                    }
                  </SortableItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {entries.length > 0 && (
        <p className="mob-only" style={{ color: "var(--muted)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Link2 size={14} style={{ color: "var(--accent-2)" }} /> liée
          <Pin size={14} style={{ color: "var(--lock)", marginLeft: 6 }} /> figée
          <LinkHelp />
        </p>
      )}

      {dialog?.kind === "add" && (
        <AddRecipesToCookbookModal
          cookbookId={cookbookId}
          existingRecipeIds={entries.filter((e): e is RecipeEntry => e.type === "recipe").map((e) => e.recipeId)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "chapter" && <ChapterDialog cookbookId={cookbookId} entry={dialog.entry} onClose={closeDialog} />}
      {dialog?.kind === "section" && <SectionDialog cookbookId={cookbookId} entry={dialog.entry} onClose={closeDialog} />}
      {dialog?.kind === "mass" && (
        <EditSnapshotMassModal cookbookId={cookbookId} entryId={dialog.entry.id} recipeName={dialog.entry.recipeName} onClose={closeDialog} />
      )}
    </div>
  );
}

function LinkHelp() {
  return (
    <Help title="Recette liée ou figée">
      <b>Liée</b> : le cahier imprime toujours la version actuelle de la recette ; si tu la modifies,
      le cahier suit.
      <br />
      <b>Figée</b> : le cahier garde une copie de la recette prise à une date donnée, éventuellement
      à une autre masse. Les modifications futures de la recette ne la changent pas, sauf si tu
      rafraîchis la copie.
      <br />
      <br />
      Menu de la ligne : « Figer » prend une copie maintenant ; « Relier à la recette » abandonne la
      copie.
    </Help>
  );
}

// ─── Élément déplaçable ──────────────────────────────────────────────────────

type Handle = Record<string, unknown>;

function SortableItem({ id, children }: { id: string; children: (handle: Handle) => React.ReactNode }) {
  const s = useSortable({ id });
  return (
    <div
      ref={s.setNodeRef}
      className="cb-item"
      data-dragging={s.isDragging ? "true" : undefined}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
    >
      {children({ ...s.attributes, ...s.listeners })}
    </div>
  );
}

function Grip({ handle }: { handle: Handle }) {
  return (
    <button type="button" {...handle} className="cb-grip" aria-label="Glisser pour réorganiser" title="Glisser pour réorganiser">
      <GripVertical size={16} />
    </button>
  );
}

type RowProps = {
  cookbookId: number;
  handle: Handle;
  canUp: boolean;
  canDown: boolean;
  onMove: (delta: number) => void;
  onDialog: (d: Dialog) => void;
  run: (fn: () => Promise<unknown>) => void;
};

// ─── Ligne de recette ────────────────────────────────────────────────────────

function RecipeRow({ entry, no, cookbookId, handle, canUp, canDown, onMove, onDialog, run }: RowProps & { entry: RecipeEntry; no: number }) {
  const linked = entry.linkMode === "linked";
  const color = entry.categories[0]?.color ?? "#3b475e";
  const sub = [
    !linked && entry.snapshotDate ? `Figée le ${fmtDate(entry.snapshotDate)}` : null,
    ...entry.categories.slice(0, 3).map((c) => c.name),
  ]
    .filter(Boolean)
    .join(" · ");

  const getSpec = (): MenuSpec => {
    const open = { label: "Ouvrir la recette", icon: FileText, href: `/recipes/${entry.recipeId}` };
    const freeze = {
      label: "Figer (prendre une copie)",
      icon: Pin,
      onSelect: () => run(() => refreshSnapshot(entry.id, cookbookId)),
    };
    const relink = {
      label: "Relier à la recette",
      icon: Link2,
      onSelect: () => {
        if (confirm(`Relier « ${entry.recipeName} » ? La copie figée (et sa masse) sera abandonnée : le cahier suivra la recette.`)) {
          run(() => convertToLinked(entry.id, cookbookId));
        }
      },
    };
    const section = {
      label: entry.sectionTitle ? "Modifier le titre de section…" : "Ajouter un titre de section…",
      icon: Heading,
      onSelect: () => onDialog({ kind: "section", entry }),
    };
    const remove = {
      label: "Retirer du cahier…",
      icon: Trash2,
      danger: true,
      onSelect: () => {
        if (confirm(`Retirer « ${entry.recipeName} » du cahier ? La recette elle-même n'est pas supprimée.`)) {
          run(() => removeFromCookbook(entry.id, cookbookId));
        }
      },
    };
    return {
      title: entry.recipeName,
      icon: linked ? Link2 : Pin,
      quick: [open, linked ? freeze : { ...relink, label: "Relier" }, { ...section, label: "Section" }],
      items: [
        open,
        { separator: true },
        ...(linked
          ? [freeze]
          : [
              { label: "Modifier la masse figée…", icon: Scale, onSelect: () => onDialog({ kind: "mass", entry }) },
              { label: "Rafraîchir la copie", icon: RefreshCw, onSelect: () => run(() => refreshSnapshot(entry.id, cookbookId)) },
              relink,
            ]),
        section,
        { separator: true },
        { label: "Monter", icon: ArrowUp, disabled: !canUp, onSelect: () => onMove(-1) },
        { label: "Descendre", icon: ArrowDown, disabled: !canDown, onSelect: () => onMove(1) },
        { separator: true },
        remove,
      ],
    };
  };

  const ModeIcon = linked ? Link2 : Pin;

  return (
    <>
      {entry.sectionTitle && (
        <button type="button" className="cb-section" onClick={() => onDialog({ kind: "section", entry })} title="Modifier le titre de section">
          {entry.sectionTitle}
        </button>
      )}
      <ContextArea spec={getSpec} className="cb-row">
        <Grip handle={handle} />
        <Link href={`/recipes/${entry.recipeId}`} className="cb-link">
          <span className="cb-no desk-only">{no}</span>
          <span className="rthumb" style={{ "--c": color } as React.CSSProperties}>
            <Layers size={16} style={{ opacity: 0.5 }} />
          </span>
          <span className="rname">
            <b>{entry.recipeName}</b>
            {sub && <small>{sub}</small>}
          </span>
          <span className="cb-mode desk-only" data-mode={entry.linkMode}>
            <ModeIcon size={14} /> {linked ? "Liée" : "Figée"}
          </span>
          <span className="cb-mass num desk-only">
            {entry.snapshotMassG !== null
              ? formatG(Math.round(entry.snapshotMassG))
              : entry.linkedMassG > 0
                ? formatG(Math.round(entry.linkedMassG))
                : <span style={{ color: "var(--muted)" }}>—</span>}
          </span>
          <span className="cb-mode mob-only" data-mode={entry.linkMode} aria-label={linked ? "Liée" : "Figée"}>
            {(entry.snapshotMassG ?? entry.linkedMassG) > 0 && <span className="num" style={{ color: "var(--soft)" }}>{formatG(Math.round(entry.snapshotMassG ?? entry.linkedMassG))}</span>}
            <ModeIcon size={15} />
          </span>
        </Link>
        <MoreButton spec={getSpec} label={`Actions pour ${entry.recipeName}`} />
      </ContextArea>
    </>
  );
}

// ─── Ligne de chapitre ───────────────────────────────────────────────────────

function ChapterRow({ entry, cookbookId, handle, canUp, canDown, onMove, onDialog, run }: RowProps & { entry: ChapterEntry }) {
  const getSpec = (): MenuSpec => {
    const edit = { label: "Modifier le chapitre…", icon: Pencil, onSelect: () => onDialog({ kind: "chapter", entry }) };
    const remove = {
      label: "Supprimer le chapitre…",
      icon: Trash2,
      danger: true,
      onSelect: () => {
        if (confirm(`Supprimer le chapitre « ${entry.title} » ? Les recettes du cahier ne sont pas touchées.`)) {
          run(() => deleteChapter(entry.id, cookbookId));
        }
      },
    };
    return {
      title: `Chapitre : ${entry.title}`,
      icon: BookOpen,
      quick: [{ ...edit, label: "Modifier" }, { ...remove, label: "Supprimer" }],
      items: [
        edit,
        { separator: true },
        { label: "Monter", icon: ArrowUp, disabled: !canUp, onSelect: () => onMove(-1) },
        { label: "Descendre", icon: ArrowDown, disabled: !canDown, onSelect: () => onMove(1) },
        { separator: true },
        remove,
      ],
    };
  };

  return (
    <ContextArea spec={getSpec} className="cb-row cb-chapter">
      <Grip handle={handle} />
      <button type="button" className="cb-link" onClick={() => onDialog({ kind: "chapter", entry })}>
        <span className="cb-no desk-only" />
        <span className="cb-chap-ic">
          <BookOpen size={18} />
        </span>
        <span className="rname">
          <small style={{ color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10.5 }}>Chapitre</small>
          <span className="cb-chap-title">{entry.title}</span>
          {entry.intro && <small>{entry.intro}</small>}
        </span>
      </button>
      <MoreButton spec={getSpec} label={`Actions pour le chapitre ${entry.title}`} />
    </ContextArea>
  );
}

// ─── Fenêtres ────────────────────────────────────────────────────────────────

function ChapterDialog({ cookbookId, entry, onClose }: { cookbookId: number; entry: ChapterEntry | null; onClose: () => void }) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [intro, setIntro] = useState(entry?.intro ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = entry
        ? await updateChapter(entry.id, { title, intro }, cookbookId)
        : await addChapter(cookbookId, { title, intro });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BookOpen size={18} style={{ color: "var(--accent)" }} /> {entry ? "Modifier le chapitre" : "Nouveau chapitre"}
          <Help title="Chapitre">
            Une page de titre dans le PDF, avec un texte d&apos;introduction facultatif. Elle est
            placée là où se trouve le chapitre dans la liste et apparaît au sommaire. Un nouveau
            chapitre est ajouté à la fin : déplace-le ensuite au bon endroit.
          </Help>
        </span>
      }
    >
      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="fl-label">Titre</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. Les entremets"
          className="fl-input"
          maxLength={200}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) save();
          }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="fl-label">Introduction (facultatif)</span>
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={4} maxLength={5000} className="fl-input" placeholder="Quelques lignes imprimées sous le titre du chapitre" />
      </label>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">
          Annuler
        </button>
        <button type="button" onClick={save} disabled={pending || !title.trim()} className="fl-btn fl-btn-primary">
          {pending ? "Enregistrement…" : entry ? "Enregistrer" : "Ajouter le chapitre"}
        </button>
      </div>
    </ModalOverlay>
  );
}

function SectionDialog({ cookbookId, entry, onClose }: { cookbookId: number; entry: RecipeEntry; onClose: () => void }) {
  const [value, setValue] = useState(entry.sectionTitle ?? "");
  const [pending, startTransition] = useTransition();

  const save = (v: string) =>
    startTransition(async () => {
      await setSectionTitle(entry.id, v, cookbookId);
      onClose();
    });

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Heading size={18} style={{ color: "var(--accent)" }} /> Titre de section
          <Help title="Titre de section">
            Un intertitre imprimé juste au-dessus de cette recette, sur la même page (pas de page
            dédiée, contrairement à un chapitre). Laisse vide pour le retirer.
          </Help>
        </span>
      }
    >
      <p style={{ color: "var(--muted)", marginTop: -6 }}>Au-dessus de « {entry.recipeName} »</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ex. Les crèmes"
        className="fl-input"
        maxLength={200}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") save(value);
        }}
      />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {entry.sectionTitle && (
          <button type="button" onClick={() => save("")} disabled={pending} className="fl-btn fl-btn-ghost" style={{ marginRight: "auto" }}>
            <Trash2 size={15} /> Retirer
          </button>
        )}
        <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">
          Annuler
        </button>
        <button type="button" onClick={() => save(value)} disabled={pending} className="fl-btn fl-btn-primary">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </ModalOverlay>
  );
}

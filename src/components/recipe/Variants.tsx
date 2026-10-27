"use client";

import { foldText } from "@/lib/textSearch";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpToLine, Columns2, GitBranch, Link2, Pencil, Plus, Search, Unlink } from "lucide-react";
import type { VariantFamily } from "@/lib/variants";
import { formatG } from "@/lib/format";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { fetchAvailableRecipes } from "@/app/actions/modals";
import { createVariant, linkVariant, promoteVariant, setVariantNote, unlinkVariant } from "@/app/actions/variants";

/** Bloc « Variantes » de la fiche : la version principale et ses essais, à ouvrir ou comparer. */
export function VariantsCard({
  family,
  currentId,
  onNew,
  onLink,
  onNavigate,
  inDialog,
}: {
  family: VariantFamily;
  currentId: number;
  onNew: () => void;
  onLink?: () => void;
  /** Appelé quand on suit un lien (ouvrir, comparer), pour fermer la fenêtre. */
  onNavigate?: () => void;
  /** Affiché dans la fenêtre « Variantes » du menu ⋯ : pas d'en-tête de carte (la fenêtre a son titre). */
  inDialog?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState<{ id: number; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Action impossible.");
      router.refresh();
    });

  // La plus ancienne (version principale d'abord) à gauche : les écarts se lisent « avant → après ».
  const order = (id: number) => family.members.findIndex((m) => m.id === id);
  const cmpHref = (id: number) => {
    const [l, r] = order(id) < order(currentId) ? [id, currentId] : [currentId, id];
    return `/recipes/${l}/compare?with=${r}`;
  };

  const rowMenu = (id: number, isRoot: boolean, note: string | null): MenuSpec => ({
    title: note ?? "Version principale",
    items: [
      { label: "Ouvrir", icon: GitBranch, href: `/recipes/${id}` },
      ...(id !== currentId ? [{ label: "Comparer avec celle-ci", icon: Columns2, href: cmpHref(id) }] : []),
      ...(!isRoot
        ? [
            { separator: true as const },
            { label: "Renommer l'essai…", icon: Pencil, onSelect: () => setRenaming({ id, note: note ?? "" }) },
            { label: "En faire la version principale", icon: ArrowUpToLine, onSelect: () => run(() => promoteVariant(id)) },
            {
              label: "Détacher (recette indépendante)",
              icon: Unlink,
              onSelect: () => {
                if (confirm("Détacher cette variante ? Elle redevient une recette indépendante, rien n'est supprimé.")) run(() => unlinkVariant(id));
              },
            },
          ]
        : []),
    ],
  });

  return (
    <section className={inDialog ? "variants variants-in-dialog" : "fl-card variants"} aria-busy={pending} onClickCapture={(e) => {
      if (onNavigate && (e.target as HTMLElement).closest("a")) onNavigate();
    }}>
      {!inDialog && (
      <div className="variants-head">
        <GitBranch size={16} style={{ color: "var(--accent)" }} />
        <h2>
          Variantes
          <Help title="Variantes">
            Tes essais d&apos;une même recette, rangés sous la version principale. Chaque variante
            est une recette complète que tu peux modifier sans toucher aux autres. Les variantes
            n&apos;apparaissent pas dans la liste des recettes (sauf en recherche) : on les retrouve ici.
          </Help>
        </h2>
        <button type="button" className="fl-btn fl-btn-secondary variants-new" onClick={onNew}>
          <Plus size={15} /> Nouvelle variante
        </button>
      </div>
      )}
      <ul className="variants-list">
        {family.members.map((m) => {
          const current = m.id === currentId;
          return (
            <li key={m.id} data-current={current ? "true" : undefined}>
              <Link href={`/recipes/${m.id}`} className="variants-main">
                <b>{m.isRoot ? "Version principale" : m.note ?? "Essai"}</b>
                <small>{m.isRoot ? m.name : `${m.name} · modifiée le ${new Date(m.updatedAt).toLocaleDateString("fr-FR")}`}</small>
              </Link>
              <span className="num variants-mass">{m.massG > 0 ? formatG(Math.round(m.massG)) : ""}</span>
              {current ? (
                <span className="fl-tag variants-here">affichée</span>
              ) : (
                <Link href={cmpHref(m.id)} className="fl-btn fl-btn-ghost variants-cmp" title="Comparer avec la recette affichée">
                  <Columns2 size={15} /> <span className="desk-only">Comparer</span>
                </Link>
              )}
              <MoreButton spec={() => rowMenu(m.id, m.isRoot, m.note)} label="Actions de la variante" className="fl-btn fl-btn-ghost fl-btn-icon" />
            </li>
          );
        })}
      </ul>
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      {inDialog && (
        <div className="variants-foot">
          {onLink && (
            <button type="button" className="fl-btn fl-btn-ghost" onClick={onLink}>
              <Link2 size={15} /> Relier une recette
            </button>
          )}
          <button type="button" className="fl-btn fl-btn-primary" onClick={onNew}>
            <Plus size={15} /> Nouvelle variante
          </button>
        </div>
      )}
      {renaming && (
        <NoteDialog
          title="Renommer l'essai"
          initial={renaming.note}
          submitLabel="Renommer"
          onClose={() => setRenaming(null)}
          onSubmit={async (note) => {
            const r = await setVariantNote(renaming.id, note);
            if (r.ok) router.refresh();
            return r.ok ? null : r.error;
          }}
        />
      )}
    </section>
  );
}

/** Fenêtre « Variantes » ouverte depuis le menu ⋯ de la recette. */
export function VariantsDialog({
  family,
  currentId,
  onClose,
  onNew,
  onLink,
}: {
  family: VariantFamily;
  currentId: number;
  onClose: () => void;
  onNew: () => void;
  onLink: () => void;
}) {
  return (
    <ModalOverlay onClose={onClose} title={`Variantes · ${family.members.length - 1}`}>
      <p style={{ color: "var(--soft)", fontSize: 13.5, margin: "0 0 12px" }}>
        Tes essais de cette recette, rangés sous la version principale. Touche une ligne pour l&apos;ouvrir, ou « Comparer » pour voir les écarts.
      </p>
      <VariantsCard family={family} currentId={currentId} onNew={onNew} onLink={onLink} onNavigate={onClose} inDialog />
    </ModalOverlay>
  );
}

/** Petite fenêtre avec un seul champ « nom de l'essai ». */
function NoteDialog({
  title,
  initial = "",
  submitLabel,
  intro,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: string;
  submitLabel: string;
  intro?: React.ReactNode;
  onClose: () => void;
  onSubmit: (note: string) => Promise<string | null>;
}) {
  const [note, setNote] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ModalOverlay onClose={onClose} title={title}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const err = await onSubmit(note);
          setBusy(false);
          if (err) setError(err);
          else onClose();
        }}
      >
        {intro && <p style={{ color: "var(--soft)", fontSize: 13.5, margin: 0 }}>{intro}</p>}
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Nom de l&apos;essai</span>
          <input className="fl-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ex. moins sucré, chocolat 64 %, + 1 feuille de gélatine" autoFocus />
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={busy}>{busy ? "…" : submitLabel}</button>
        </div>
      </form>
    </ModalOverlay>
  );
}

/** « Nouvelle variante » : copie la recette, la relie, puis ouvre la copie. */
export function NewVariantDialog({ recipeId, recipeName, onClose }: { recipeId: number; recipeName: string; onClose: () => void }) {
  const router = useRouter();
  return (
    <NoteDialog
      title="Nouvelle variante"
      submitLabel="Créer la variante"
      intro={<>Une copie de « {recipeName} » est créée et rangée sous la version principale. Tu pourras la modifier sans toucher à l&apos;original.</>}
      onClose={onClose}
      onSubmit={async (note) => {
        const r = await createVariant(recipeId, note);
        if (!r.ok) return r.error;
        if (r.id) router.push(`/recipes/${r.id}`);
        return null;
      }}
    />
  );
}

/** « Relier une recette comme variante » : pour des essais faits avant, en recettes séparées. */
export function LinkVariantDialog({ recipeId, recipeName, onClose }: { recipeId: number; recipeName: string; onClose: () => void }) {
  const router = useRouter();
  const [recipes, setRecipes] = useState<{ id: number; name: string }[] | null>(null);
  const [query, setQuery] = useState("");
  const [otherId, setOtherId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAvailableRecipes(recipeId).then(setRecipes);
  }, [recipeId]);

  const filtered = useMemo(() => {
    const n = foldText;
    const q = n(query);
    return (recipes ?? []).filter((r) => n(r.name).includes(q)).slice(0, 80);
  }, [recipes, query]);

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link2 size={18} style={{ color: "var(--accent)" }} /> Relier une variante
        </span>
      }
    >
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!otherId) return setError("Choisis la recette à relier.");
          setBusy(true);
          const r = await linkVariant(recipeId, otherId, note);
          setBusy(false);
          if (!r.ok) return setError(r.error);
          router.refresh();
          onClose();
        }}
      >
        <p style={{ color: "var(--soft)", fontSize: 13.5, margin: 0 }}>
          La recette choisie devient un essai de « {recipeName} ». Rien n&apos;est copié ni supprimé.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Recette à relier</span>
          <label className="searchbox">
            <Search size={16} />
            <input placeholder="Rechercher une recette…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>
          <div className="fl-scroll" style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
            {recipes === null ? (
              <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Chargement…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Aucune recette trouvée.</div>
            ) : (
              filtered.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="pdf-theme-opt"
                  aria-pressed={otherId === r.id}
                  style={{ margin: 0, borderRadius: 0, borderBottom: "1px solid var(--border)" }}
                  onClick={() => setOtherId(r.id)}
                >
                  <span style={{ flex: 1, fontSize: 13.5 }}>{r.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Nom de l&apos;essai (facultatif)</span>
          <input className="fl-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ex. moins sucré" />
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={busy}>{busy ? "…" : "Relier"}</button>
        </div>
      </form>
    </ModalOverlay>
  );
}

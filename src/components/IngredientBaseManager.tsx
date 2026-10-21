"use client";

import Link from "next/link";
import { useCallback, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CaseUpper,
  Check,
  CheckCheck,
  CookingPot,
  ExternalLink,
  FolderInput,
  Inbox,
  Leaf,
  ListChecks,
  Merge,
  Pencil,
  Search,
  Trash2,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  capitalizeIngredientBase,
  deleteIngredientBase,
  deleteIngredientBasesBulk,
  mergeIngredientBases,
  mergeIngredientBasesBulk,
  renameIngredientBase,
  setIngredientCategory,
  setIngredientCategoryBulk,
} from "@/app/actions/settings";
import { ContextArea, MoreButton, useActionMenu, type MenuSpec } from "@/components/ui/Menu";
import { Help } from "@/components/ui/Help";
import { MergeIngredientModal, RenameIngredientModal } from "@/components/settings/IngredientModals";

type IngredientCategory = "base" | "fruit" | "preparation" | null;

type IngredientBase = {
  id: number;
  name: string;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { usages: number };
};

type SortKey = "az" | "za" | "most" | "least" | "none" | "nocap" | "newest" | "modified";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "De A à Z" },
  { key: "za", label: "De Z à A" },
  { key: "most", label: "Plus de recettes" },
  { key: "least", label: "Moins de recettes" },
  { key: "none", label: "Sans recette" },
  { key: "nocap", label: "Commence par une minuscule" },
  { key: "newest", label: "Ajoutés récemment" },
  { key: "modified", label: "Modifiés récemment" },
];

const KNOWN_CATEGORIES = ["base", "fruit", "preparation"] as const;

const CATEGORIES: { key: IngredientCategory; label: string; icon: LucideIcon }[] = [
  { key: null, label: "À classer", icon: Inbox },
  { key: "base", label: "Base", icon: Wheat },
  { key: "fruit", label: "Arôme", icon: Leaf },
  { key: "preparation", label: "Préparation", icon: CookingPot },
];

/** Filtre de catégorie : toutes, ou une catégorie (null = « À classer »). */
type CatFilter = "all" | IngredientCategory;

/** Catégorie connue de l'ingrédient (les valeurs inconnues comptent comme « À classer »). */
function catOf(ing: { category: string | null }): IngredientCategory {
  return KNOWN_CATEGORIES.includes(ing.category as (typeof KNOWN_CATEGORIES)[number])
    ? (ing.category as IngredientCategory)
    : null;
}

const catInfo = (key: IngredientCategory) => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];
const hasLowerFirst = (name: string) => name.charAt(0) !== name.charAt(0).toUpperCase();
const capitalize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const recipesLabel = (n: number) => (n === 0 ? "Aucune recette" : `${n} recette${n > 1 ? "s" : ""}`);

type Merging = { sourceIds: number[]; label: string };

export function IngredientBaseManager({
  ingredientBases,
}: {
  ingredientBases: IngredientBase[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticBases, addOptimistic] = useOptimistic(
    ingredientBases,
    (state, { ids, category }: { ids: number[]; category: IngredientCategory }) =>
      state.map((ing) => (ids.includes(ing.id) ? { ...ing, category } : ing)),
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("az");
  const [catFilter, setCatFilter] = useState<CatFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set<number>());
  const [merging, setMerging] = useState<Merging | null>(null);
  const [renaming, setRenaming] = useState<IngredientBase | null>(null);

  // ─── Actions sur un ingrédient ─────────────────────────────────────────────

  function handleDelete(id: number, name: string) {
    if (!confirm(`Supprimer « ${name} » de la base ?\n\nLes recettes qui utilisent cet ingrédient ne sont pas modifiées.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteIngredientBase(id);
      if (!r.ok) setError(r.error);
    });
  }

  function handleCapitalize(id: number, name: string) {
    if (capitalize(name) === name) return;
    setError(null);
    startTransition(async () => {
      const r = await capitalizeIngredientBase(id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function handleSetCategory(id: number, category: IngredientCategory) {
    setError(null);
    startTransition(async () => {
      addOptimistic({ ids: [id], category });
      const r = await setIngredientCategory(id, category);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  // ─── Sélection multiple ────────────────────────────────────────────────────

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set<number>());
  }

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function handleBulkSetCategory(category: IngredientCategory) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      addOptimistic({ ids, category });
      const r = await setIngredientCategoryBulk(ids, category);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      exitSelection();
      router.refresh();
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Supprimer ${ids.length} ingrédient${ids.length > 1 ? "s" : ""} de la base ?\n\nLes recettes qui les utilisent ne sont pas modifiées. Cette action est irréversible.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteIngredientBasesBulk(ids);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      exitSelection();
      router.refresh();
    });
  }

  /** Fusion (une source ou la sélection) : renvoie une erreur ou null. */
  async function runMerge(m: Merging, target: { id: number; name: string }): Promise<string | null> {
    const ids = m.sourceIds.filter((id) => id !== target.id);
    if (ids.length === 0) return "Choisis un autre ingrédient que ceux à fusionner.";
    const msg =
      ids.length === 1 && m.sourceIds.length === 1
        ? `Fusionner ${m.label} dans « ${target.name} » ?\n\nToutes les recettes qui utilisent ${m.label} seront mises à jour avec « ${target.name} ». Cette action est irréversible.`
        : `Fusionner ${ids.length} ingrédient${ids.length > 1 ? "s" : ""} dans « ${target.name} » ?\n\nToutes les recettes concernées seront mises à jour avec « ${target.name} ». Cette action est irréversible.`;
    if (!confirm(msg)) return null;
    const r = ids.length === 1 && m.sourceIds.length === 1
      ? await mergeIngredientBases(ids[0], target.id)
      : await mergeIngredientBasesBulk(ids, target.id);
    if (!r.ok) return r.error;
    setMerging(null);
    if (m.sourceIds.length > 1) exitSelection();
    router.refresh();
    return null;
  }

  // ─── Liste filtrée et triée ───────────────────────────────────────────────

  const sorted = useMemo(() => {
    const q = search.toLowerCase();
    let list = optimisticBases.filter((i) => i.name.toLowerCase().includes(q));
    if (catFilter !== "all") list = list.filter((i) => catOf(i) === catFilter);
    if (sort === "none") list = list.filter((i) => i._count.usages === 0);
    if (sort === "nocap") list = list.filter((i) => hasLowerFirst(i.name));
    switch (sort) {
      case "az": list = [...list].sort((a, b) => a.name.localeCompare(b.name, "fr")); break;
      case "za": list = [...list].sort((a, b) => b.name.localeCompare(a.name, "fr")); break;
      case "most": list = [...list].sort((a, b) => b._count.usages - a._count.usages); break;
      case "least": list = [...list].sort((a, b) => a._count.usages - b._count.usages); break;
      case "newest": list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case "modified": list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); break;
    }
    return list;
  }, [optimisticBases, search, sort, catFilter]);

  const zeroCount = optimisticBases.filter((i) => i._count.usages === 0).length;
  const nocapCount = optimisticBases.filter((i) => hasLowerFirst(i.name)).length;
  const catCount = (key: IngredientCategory) => optimisticBases.filter((i) => catOf(i) === key).length;
  const allVisibleSelected = sorted.length > 0 && sorted.every((i) => selectedIds.has(i.id));

  const specOf = (ing: IngredientBase): MenuSpec => {
    const current = catOf(ing);
    return {
      title: ing.name,
      icon: catInfo(current).icon,
      items: [
        { label: "Voir la fiche", icon: ExternalLink, href: `/settings/ingredients/${ing.id}` },
        {
          label: "Classer dans",
          icon: FolderInput,
          submenu: CATEGORIES.map((c) => ({
            label: c.label,
            icon: c.icon,
            checked: c.key === current,
            onSelect: () => handleSetCategory(ing.id, c.key),
          })),
        },
        {
          label: "Fusionner dans…",
          icon: Merge,
          onSelect: () => setMerging({ sourceIds: [ing.id], label: `« ${ing.name} »` }),
        },
        { label: "Renommer…", icon: Pencil, onSelect: () => setRenaming(ing) },
        ...(hasLowerFirst(ing.name)
          ? [{ label: `Écrire « ${capitalize(ing.name)} »`, icon: CaseUpper, onSelect: () => handleCapitalize(ing.id, ing.name) }]
          : []),
        { separator: true },
        { label: "Supprimer", icon: Trash2, danger: true, onSelect: () => handleDelete(ing.id, ing.name) },
      ],
    };
  };

  return (
    <>
      <div className="page-head">
        <h1>
          Ingrédients
          <Help title="Base d'ingrédients">
            La liste de tous les ingrédients utilisés dans tes recettes. Elle se remplit toute seule
            quand tu crées ou modifies une recette et sert à proposer les noms pendant la saisie.
            <br />
            <br />
            Ici tu peux corriger un nom (il change aussi dans les recettes), réunir les doublons et
            ranger les ingrédients par catégorie. Clic droit (ou bouton à trois points) sur une ligne
            pour ses actions ; « Sélectionner » pour agir sur plusieurs à la fois.
          </Help>
        </h1>
        {optimisticBases.length > 0 && (
          <button
            type="button"
            className="fl-btn fl-btn-ghost"
            onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
          >
            {selectionMode ? <X size={16} /> : <ListChecks size={16} />}
            {selectionMode ? "Annuler" : "Sélectionner"}
          </button>
        )}
        <p className="sub">
          {optimisticBases.length} ingrédient{optimisticBases.length > 1 ? "s" : ""} dans la base · ajoutés
          automatiquement à chaque création ou modification de recette
        </p>
      </div>

      {optimisticBases.length === 0 ? (
        <p className="set-note">
          Aucun ingrédient pour le moment. Ils s&apos;ajoutent automatiquement quand tu crées ou
          modifies des recettes.
        </p>
      ) : (
        <>
          <div className="set-toolbar">
            <div className="searchbox">
              <Search size={16} />
              <input
                type="search"
                placeholder="Filtrer par nom…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Filtrer les ingrédients par nom"
              />
            </div>
            <select
              className="fl-input"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Trier ou filtrer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                  {o.key === "none" && zeroCount > 0 ? ` (${zeroCount})` : ""}
                  {o.key === "nocap" && nocapCount > 0 ? ` (${nocapCount})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="chips set-catchips">
            <button type="button" className="fl-chip" aria-pressed={catFilter === "all"} onClick={() => setCatFilter("all")}>
              Tous <b>{optimisticBases.length}</b>
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={String(c.key)}
                type="button"
                className="fl-chip"
                aria-pressed={catFilter === c.key}
                onClick={() => setCatFilter(c.key)}
              >
                <c.icon size={14} />
                {c.label} <b>{catCount(c.key)}</b>
              </button>
            ))}
            <Help
              title="Catégories d'ingrédients"
              example="Farine, sucre, beurre : Base. Vanille, framboise, cannelle : Arôme. Crème pâtissière, pâte sucrée : Préparation."
            >
              Un rangement simple de ta base pour t&apos;y retrouver et repérer les doublons.
              <br />
              <b>Base</b> : les ingrédients de fond (farine, sucre, beurre, œufs…).
              <br />
              <b>Arôme</b> : ce qui donne le goût (fruits, épices, parfums, chocolat…).
              <br />
              <b>Préparation</b> : une préparation déjà faite utilisée comme ingrédient.
              <br />
              <b>À classer</b> : pas encore rangé. Dans cette vue, un clic sur Base, Arôme ou
              Préparation classe l&apos;ingrédient directement.
              <br />
              <br />
              La catégorie ne change rien aux recettes, aux quantités ni aux PDF.
            </Help>
          </div>

          <div className="set-meta">
            <span>
              {sorted.length === optimisticBases.length
                ? `${sorted.length} ingrédient${sorted.length > 1 ? "s" : ""}`
                : `${sorted.length} sur ${optimisticBases.length}`}
            </span>
          </div>

          {error && <p className="set-error" style={{ marginBottom: 10 }}>{error}</p>}

          {sorted.length === 0 ? (
            <p className="set-note" style={{ padding: "10px 2px" }}>
              {sort === "none"
                ? "Tous les ingrédients ont au moins une recette."
                : sort === "nocap"
                  ? "Toutes les premières lettres sont déjà en majuscule."
                  : search
                    ? `Aucun résultat pour « ${search} ».`
                    : "Aucun ingrédient dans cette catégorie."}
            </p>
          ) : (
            <div className="fl-list" style={{ opacity: pending ? 0.75 : 1, transition: "opacity 120ms" }}>
              {sorted.map((ing) => (
                <IngredientRow
                  key={ing.id}
                  ing={ing}
                  spec={specOf}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(ing.id)}
                  onToggle={toggleSelected}
                  quickClassify={catFilter === null && !selectionMode && catOf(ing) === null}
                  onClassify={handleSetCategory}
                  pending={pending}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selectionMode && (
        <SelectionBar
          count={selectedIds.size}
          pending={pending}
          allVisibleSelected={allVisibleSelected}
          onToggleAll={() =>
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const i of sorted) {
                if (allVisibleSelected) next.delete(i.id);
                else next.add(i.id);
              }
              return next;
            })
          }
          onSetCategory={handleBulkSetCategory}
          onMerge={() =>
            setMerging({
              sourceIds: Array.from(selectedIds),
              label: `${selectedIds.size} ingrédient${selectedIds.size > 1 ? "s" : ""}`,
            })
          }
          onDelete={handleBulkDelete}
          onCancel={exitSelection}
        />
      )}

      {merging && (
        <MergeIngredientModal
          sourceLabel={merging.label}
          options={ingredientBases
            .filter((i) => !merging.sourceIds.includes(i.id))
            .map((i) => ({ id: i.id, name: i.name, count: i._count.usages }))}
          onConfirm={(target) => runMerge(merging, target)}
          onClose={() => setMerging(null)}
        />
      )}

      {renaming && (
        <RenameIngredientModal
          name={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={async (fd) => {
            const r = await renameIngredientBase(renaming.id, fd);
            if (!r.ok) return r.error;
            router.refresh();
            return null;
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Ligne ingrédient
// ─────────────────────────────────────────────

function IngredientRow({
  ing,
  spec,
  selectionMode,
  selected,
  onToggle,
  quickClassify,
  onClassify,
  pending,
}: {
  ing: IngredientBase;
  spec: (ing: IngredientBase) => MenuSpec;
  selectionMode: boolean;
  selected: boolean;
  onToggle: (id: number) => void;
  quickClassify: boolean;
  onClassify: (id: number, category: IngredientCategory) => void;
  pending: boolean;
}) {
  const cat = catOf(ing);
  const info = catInfo(cat);
  const getSpec = () => spec(ing);
  const text = (
    <span className="set-tx">
      <b>
        <span>{ing.name}</span>
      </b>
      <small>
        <span className={ing._count.usages === 0 ? "set-ing-zero" : undefined}>{recipesLabel(ing._count.usages)}</span>
        {" · "}
        {info.label}
      </small>
    </span>
  );

  return (
    <ContextArea spec={getSpec} className="fl-row set-item set-item-wrap" selected={selectionMode && selected}>
      {selectionMode ? (
        <button type="button" className="set-item-main" onClick={() => onToggle(ing.id)} aria-pressed={selected}>
          <span className="set-check" data-on={selected ? "true" : undefined}>
            {selected && <Check size={16} strokeWidth={3} />}
          </span>
          {text}
        </button>
      ) : (
        <Link href={`/settings/ingredients/${ing.id}`} className="set-item-main">
          <span className="ic set-ic-c set-ing-cat" data-cat={cat ?? "none"}>
            <info.icon size={16} />
          </span>
          {text}
        </Link>
      )}
      {quickClassify && (
        <div className="set-quick">
          {CATEGORIES.filter((c) => c.key !== null).map((c) => (
            <button
              key={String(c.key)}
              type="button"
              className="fl-chip"
              disabled={pending}
              onClick={() => onClassify(ing.id, c.key)}
              title={`Classer dans « ${c.label} »`}
            >
              <c.icon size={13} />
              {c.label}
            </button>
          ))}
        </div>
      )}
      {!selectionMode && <MoreButton spec={getSpec} label={`Actions pour ${ing.name}`} />}
    </ContextArea>
  );
}

// ─────────────────────────────────────────────
// Barre d'actions de la sélection
// ─────────────────────────────────────────────

function SelectionBar({
  count,
  pending,
  allVisibleSelected,
  onToggleAll,
  onSetCategory,
  onMerge,
  onDelete,
  onCancel,
}: {
  count: number;
  pending: boolean;
  allVisibleSelected: boolean;
  onToggleAll: () => void;
  onSetCategory: (category: IngredientCategory) => void;
  onMerge: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const disabled = pending || count === 0;
  const classifyRef = useRef<HTMLButtonElement>(null);
  const getSpec = useCallback(
    (): MenuSpec => ({
      title: "Classer la sélection dans",
      items: CATEGORIES.map((c) => ({ label: c.label, icon: c.icon, onSelect: () => onSetCategory(c.key) })),
    }),
    [onSetCategory],
  );
  const classifyMenu = useActionMenu(getSpec);

  return (
    <div className="selbar" role="region" aria-label="Sélection">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 13.5 }}>
          <b className="num" style={{ color: "var(--accent)" }}>{count}</b> sélectionné{count > 1 ? "s" : ""}
        </span>
        <button type="button" className="fl-btn fl-btn-ghost" onClick={onToggleAll} disabled={pending}>
          <CheckCheck size={15} />
          {allVisibleSelected ? "Tout décocher" : "Tout cocher"}
        </button>
        <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" onClick={onCancel} disabled={pending} aria-label="Fermer la sélection">
          <X size={16} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          ref={classifyRef}
          type="button"
          className="fl-btn fl-btn-secondary"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={classifyMenu.open}
          onClick={() => {
            if (classifyMenu.open) return classifyMenu.close();
            const r = classifyRef.current!.getBoundingClientRect();
            classifyMenu.openAt({ x: r.left, y: r.top - 6, below: r.top });
          }}
        >
          <FolderInput size={15} /> Classer
        </button>
        <button type="button" className="fl-btn fl-btn-secondary" disabled={disabled} onClick={onMerge}>
          <Merge size={15} /> Fusionner
        </button>
        <button type="button" className="fl-btn fl-btn-danger" disabled={disabled} onClick={onDelete} style={{ marginLeft: "auto" }}>
          <Trash2 size={15} /> Supprimer
        </button>
      </div>
      {classifyMenu.element}
    </div>
  );
}

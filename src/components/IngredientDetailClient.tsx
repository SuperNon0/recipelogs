"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, Merge, Pencil } from "lucide-react";
import { renameIngredientBase, mergeIngredientBases } from "@/app/actions/settings";
import { EmptyState } from "@/components/EmptyState";
import { MergeIngredientModal, RenameIngredientModal } from "@/components/settings/IngredientModals";

type Recipe = { id: number; name: string; ingredientName: string };

/** Fiche d'un ingrédient de la base : renommer, fusionner, recettes qui l'utilisent. */
export function IngredientDetailClient({
  base,
  recipes,
  otherBases,
}: {
  base: { id: number; name: string };
  recipes: Recipe[];
  otherBases: { id: number; name: string; count?: number }[];
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [merging, setMerging] = useState(false);

  async function handleMerge(target: { id: number; name: string }): Promise<string | null> {
    if (!confirm(`Fusionner « ${base.name} » dans « ${target.name} » ?\n\nToutes les recettes utilisant « ${base.name} » seront mises à jour avec « ${target.name} ». Cette action est irréversible.`)) return null;
    const r = await mergeIngredientBases(base.id, target.id);
    if (!r.ok) return r.error;
    router.push("/settings/ingredients");
    return null;
  }

  return (
    <>
      <div className="page-head">
        <h1>{base.name}</h1>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setRenaming(true)}>
          <Pencil size={15} /> Renommer
        </button>
        <button
          type="button"
          className="fl-btn fl-btn-secondary"
          onClick={() => setMerging(true)}
          disabled={otherBases.length === 0}
        >
          <Merge size={15} /> Fusionner…
        </button>
        <p className="sub">
          {recipes.length === 0
            ? "Aucune recette n'utilise cet ingrédient"
            : `${recipes.length} recette${recipes.length > 1 ? "s utilisent" : " utilise"} cet ingrédient`}
        </p>
      </div>

      <div className="sect-title" style={{ marginTop: 8 }}>
        <h2>Recettes</h2>
      </div>
      {recipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucune recette"
          description="Aucune recette n'utilise cet ingrédient pour le moment."
        />
      ) : (
        <div className="fl-list">
          {recipes.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="fl-row">
              <span className="ic">
                <BookOpen size={16} />
              </span>
              <span className="set-tx">
                <b>
                  <span>{r.name}</span>
                </b>
                {r.ingredientName !== base.name && <small>Écrit « {r.ingredientName} » dans la recette</small>}
              </span>
              <ChevronRight size={16} className="set-chev" />
            </Link>
          ))}
        </div>
      )}

      {renaming && (
        <RenameIngredientModal
          name={base.name}
          onClose={() => setRenaming(false)}
          onSubmit={async (fd) => {
            const r = await renameIngredientBase(base.id, fd);
            if (!r.ok) return r.error;
            router.refresh();
            return null;
          }}
        />
      )}
      {merging && (
        <MergeIngredientModal
          sourceLabel={`« ${base.name} »`}
          options={otherBases}
          onConfirm={handleMerge}
          onClose={() => setMerging(false)}
        />
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChefHat, ChevronLeft, FileDown, GitBranch, Layers, Library, Pencil, Star, TriangleAlert } from "lucide-react";
import type { AllergenHit } from "@/lib/allergens";
import type { Mold } from "@/lib/mold";
import type { VariantFamily } from "@/lib/variants";
import { KitchenMode } from "./KitchenMode";
import { MoreButton } from "@/components/ui/Menu";
import { Help } from "@/components/ui/Help";
import { RecipeBody, type IngredientRow, type RecipeScale, type SubRecipeRow, type YieldInfo } from "@/components/RecipeBody";
import { formatCoef } from "@/lib/format";
import { hasStepQty } from "@/lib/stepQty";
import { StepsContent } from "@/components/StepsContent";
import { CommentsSection } from "@/components/CommentsSection";
import { toggleFavorite } from "@/app/actions/recipes";
import { useRecipeMenu } from "./RecipeMenu";

type Props = {
  recipe: {
    id: number;
    name: string;
    photoPath: string | null;
    favorite: boolean;
    rating: number | null;
    source: string | null;
    notesTips: string | null;
    steps: string | null;
    folder: { id: number; name: string; color: string } | null;
    categories: { id: number; name: string; color: string }[];
    tags: string[];
    createdAt: string;
    updatedAt: string;
    totalMassG: number;
    saleCoef: number | null;
  };
  ingredients: IngredientRow[];
  subRecipes: SubRecipeRow[];
  yieldInfo: YieldInfo | null;
  mold: Mold | null;
  variants: VariantFamily | null;
  allergens: AllergenHit[];
  comments: { id: number; content: string; createdAt: string }[];
  usedIn: { id: number; name: string; label: string }[];
  back: { href: string; label: string };
  /** Ouvre tout de suite la fenêtre des variantes (lien « Voir les variantes » depuis la liste). */
  openVariants?: boolean;
};

type Tab = "recipe" | "steps" | "notes";

/** Fiche recette : en-tête, actions, onglets Recette / Préparation / Notes. */
export function RecipeView({ recipe, ingredients, subRecipes, yieldInfo, mold, variants, allergens, comments, usedIn, back, openVariants }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("recipe");
  const [fav, setFav] = useState(recipe.favorite);
  const [lab, setLab] = useState(false);
  // Multiplicateur de l'onglet Recette, repris par les quantités liées des étapes.
  const [scale, setScale] = useState<RecipeScale>({ coef: 1, wholeNumbers: false, subCoefs: {} });
  const onScaleChange = useCallback((s: RecipeScale) => setScale(s), []);
  const [, startTransition] = useTransition();
  const menu = useRecipeMenu(
    {
      id: recipe.id,
      name: recipe.name,
      favorite: fav,
      folderId: recipe.folder?.id ?? null,
      totalMassG: recipe.totalMassG,
      color: recipe.folder?.color,
    },
    { onPage: true, variants },
  );
  useEffect(() => {
    if (openVariants && variants) menu.openDialog("variants");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openVariants, recipe.id]);
  const me = variants?.members.find((m) => m.id === recipe.id);
  const nVariants = variants ? variants.members.length - 1 : 0;

  const subSteps = subRecipes.filter((s) => s.childSteps);
  const notesCount = comments.length + (recipe.notesTips ? 1 : 0);

  return (
    <article>
      <Link href={back.href} className="crumb">
        <ChevronLeft size={14} /> {back.label}
      </Link>

      <div className="rhd">
        <h1>{recipe.name}</h1>
        <div className="rhd-actions">
          <button
            type="button"
            className="fl-btn fl-btn-secondary fl-btn-icon desk-only"
            aria-pressed={fav}
            aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            title={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            onClick={() => {
              setFav(!fav);
              startTransition(async () => {
                await toggleFavorite(recipe.id);
                router.refresh();
              });
            }}
          >
            <Star size={17} fill={fav ? "var(--accent)" : "none"} style={{ color: fav ? "var(--accent)" : undefined }} />
          </button>
          <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setLab(true)} title="Mode labo : la recette en grand, écran allumé, pesées à cocher et minuteurs">
            <ChefHat size={16} />
            <span className="desk-only">Mode labo</span>
          </button>
          <button type="button" className="fl-btn fl-btn-secondary desk-only" onClick={() => menu.openDialog("pdf")}>
            <FileDown size={16} /> PDF
          </button>
          <Link href={`/recipes/${recipe.id}/edit`} className="fl-btn fl-btn-secondary desk-only">
            <Pencil size={15} /> Modifier
          </Link>
          <MoreButton spec={menu.getSpec} label="Plus d'actions" horizontal className="fl-btn fl-btn-secondary fl-btn-icon" />
          <button type="button" className="fl-btn fl-btn-primary" onClick={() => menu.openDialog("cookbook")} aria-label="Ajouter à un cahier">
            <Library size={16} />
            <span className="desk-only">Ajouter au cahier</span>
          </button>
        </div>
      </div>

      <div className="rmeta">
        {recipe.folder && (
          <Link href={`/?folder=${recipe.folder.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--soft)" }}>
            <span className="dot" style={{ background: recipe.folder.color }} />
            {recipe.folder.name}
          </Link>
        )}
        {variants && (
          <button type="button" className="fl-tag rvariants" onClick={() => menu.openDialog("variants")} title="Voir les variantes de cette recette">
            <GitBranch size={12} />
            {me && !me.isRoot ? `Variante : ${me.note ?? "essai"}` : `${nVariants} variante${nVariants > 1 ? "s" : ""}`}
          </button>
        )}
        {recipe.categories.map((c) => (
          <span key={c.id} className="fl-tag" style={{ color: c.color, borderColor: `${c.color}55`, background: `${c.color}14` }}>
            {c.name}
          </span>
        ))}
        {recipe.tags.map((t) => (
          <span key={t} className="fl-tag">#{t}</span>
        ))}
        {recipe.rating ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--accent)" }} aria-label={`Note ${recipe.rating} sur 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={13} fill={i < (recipe.rating ?? 0) ? "currentColor" : "none"} style={{ opacity: i < (recipe.rating ?? 0) ? 1 : 0.35 }} />
            ))}
          </span>
        ) : null}
        {fav && (
          <span className="mob-only" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent)" }}>
            <Star size={13} fill="currentColor" /> Favori
          </span>
        )}
      </div>

      <div className="fl-tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "recipe"} onClick={() => setTab("recipe")}>
          Recette
        </button>
        <button type="button" role="tab" aria-selected={tab === "steps"} onClick={() => setTab("steps")}>
          Préparation
        </button>
        <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")}>
          Notes et essais{notesCount ? ` · ${notesCount}` : ""}
        </button>
      </div>

      {/* Toujours monté (caché hors de l'onglet) : le multiplicateur est gardé d'un onglet à l'autre. */}
      <div hidden={tab !== "recipe"}>
        <RecipeBody recipeId={recipe.id} ingredients={ingredients} subRecipes={subRecipes} yieldInfo={yieldInfo} mold={mold} saleCoef={recipe.saleCoef} onScaleChange={onScaleChange} />
        <AllergensCard allergens={allergens} />
        {usedIn.length > 0 && (
          <div className="fl-card" style={{ marginTop: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Layers size={16} style={{ color: "var(--accent)" }} />
            <span style={{ color: "var(--soft)", fontSize: 13.5, display: "flex", alignItems: "center" }}>
              Utilisée comme sous-recette dans
              <Help title="Utilisée comme sous-recette">
                Ces recettes contiennent celle-ci. Si tu la modifies, elles suivent
                automatiquement (les quantités sont recalculées selon leur réglage).
              </Help>
            </span>
            {usedIn.map((u) => (
              <Link key={u.id} href={`/recipes/${u.id}`} className="fl-tag" style={{ color: "var(--accent)" }}>
                {u.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {tab === "steps" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {scale.coef !== 1 && [recipe.steps, ...subSteps.map((s) => s.childSteps)].some(hasStepQty) && (
            <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "-4px 0 0" }}>
              Quantités en couleur calculées au multiplicateur {formatCoef(scale.coef)} de l&apos;onglet Recette.
            </p>
          )}
          <section className="fl-card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{recipe.name}</h2>
            {recipe.steps ? <StepsContent content={recipe.steps} coef={scale.coef} wholeNumbers={scale.wholeNumbers} /> : <p style={{ color: "var(--muted)" }}>Pas encore d&apos;étapes. Ajoute-les avec « Modifier ».</p>}
          </section>
          {subSteps.map((s) => (
            <section className="fl-card" key={s.id}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={15} style={{ color: "var(--accent)" }} />
                {s.label}
                {s.label !== s.childName && <small style={{ color: "var(--muted)", fontWeight: 400 }}>{s.childName}</small>}
              </h2>
              <StepsContent content={s.childSteps!} coef={scale.subCoefs[s.id] ?? scale.coef} wholeNumbers={scale.wholeNumbers} />
            </section>
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {recipe.notesTips && (
            <section className="fl-card">
              <h2 className="fl-label" style={{ marginBottom: 8 }}>Notes et astuces</h2>
              <p style={{ whiteSpace: "pre-wrap", color: "var(--soft)", lineHeight: 1.6 }}>{recipe.notesTips}</p>
            </section>
          )}
          <CommentsSection recipeId={recipe.id} comments={comments} />
          {recipe.source && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Source : <span style={{ color: "var(--soft)" }}>{recipe.source}</span>
            </p>
          )}
        </div>
      )}

      <p style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", marginTop: 24 }}>
        Créée le {new Date(recipe.createdAt).toLocaleDateString("fr-FR")} · modifiée le{" "}
        {new Date(recipe.updatedAt).toLocaleDateString("fr-FR")}
      </p>

      {menu.dialogs}
      {lab && (
        <KitchenMode
          recipeId={recipe.id}
          name={recipe.name}
          steps={recipe.steps}
          ingredients={ingredients}
          subRecipes={subRecipes}
          scale={scale}
          onClose={() => setLab(false)}
        />
      )}
    </article>
  );
}

/** Allergènes de la recette (sous-recettes comprises), calculés depuis les fiches des ingrédients. */
function AllergensCard({ allergens }: { allergens: AllergenHit[] }) {
  return (
    <div className="fl-card" style={{ marginTop: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <TriangleAlert size={16} style={{ color: allergens.length ? "var(--accent)" : "var(--muted)" }} />
      <span style={{ color: "var(--soft)", fontSize: 13.5, display: "flex", alignItems: "center" }}>
        Allergènes
        <Help
          title="Allergènes"
          calc={allergens.length ? allergens.map((a) => `${a.label.padEnd(15)}${a.sources.join(", ")}`).join("\n") : undefined}
        >
          Calculés tout seuls à partir des allergènes cochés sur chaque ingrédient (Réglages →
          Ingrédients), sous-recettes comprises. Un ingrédient sans case cochée ne compte pas :
          vérifie que ses fiches sont à jour avant de vendre.
        </Help>
      </span>
      {allergens.length === 0 ? (
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Aucun allergène coché sur ses ingrédients</span>
      ) : (
        allergens.map((a) => (
          <span key={a.key} className="fl-tag" style={{ color: "var(--accent)" }} title={a.sources.join(", ")}>
            {a.label}
          </span>
        ))
      )}
    </div>
  );
}

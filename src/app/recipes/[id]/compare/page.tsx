import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { loadRecipeTree } from "@/lib/recipes";
import { compareRecipes, compareSteps } from "@/lib/compare";
import { getVariantFamily } from "@/lib/variants";
import { formatG } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmtDiff = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${formatG(Math.abs(Math.round(d * 10) / 10))}`;
const fmtPct = (a: number, b: number) => (a > 0 ? `${b >= a ? "+" : "−"}${Math.abs(Math.round(((b - a) / a) * 100))} %` : "");
/** Étape lisible : quantités liées sans accolades, « # » des intertitres retiré. */
const stepText = (s: string) => s.replace(/^#\s*/, "").replace(/\{\s*([^}]*)\}/g, "$1");

/** Comparer deux recettes (une variante et sa version principale, ou deux essais) côte à côte. */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { id } = await params;
  const { with: withRaw } = await searchParams;
  const aId = Number(id);
  const bId = Number(withRaw);
  if (!Number.isInteger(aId) || !Number.isInteger(bId)) notFound();

  const [a, b, family] = await Promise.all([loadRecipeTree(aId), loadRecipeTree(bId), getVariantFamily(aId)]);
  if (!a || !b) notFound();
  const notes = new Map(family?.members.map((m) => [m.id, m.isRoot ? "Version principale" : m.note ?? "Essai"]) ?? []);
  const names = await prisma.recipe.findMany({ where: { id: { in: [aId, bId] } }, select: { id: true, name: true } });
  const title = (rid: number) => notes.get(rid) ?? names.find((n) => n.id === rid)?.name ?? "";

  const { rows, totalA, totalB } = compareRecipes(a, b);
  const steps = compareSteps(a.steps, b.steps);
  const changed = rows.filter((r) => r.a !== r.b).length;

  return (
    <article className="cmp-page">
      <Link href={`/recipes/${aId}`} className="crumb">
        <ChevronLeft size={14} /> {a.name}
      </Link>
      <div className="page-head">
        <h1>Comparer</h1>
        <Link href={`/recipes/${bId}/compare?with=${aId}`} className="fl-btn fl-btn-secondary" title="Inverser les deux recettes">
          <ArrowLeftRight size={15} /> Inverser
        </Link>
        <p className="sub">
          {changed === 0 ? "Mêmes ingrédients et mêmes quantités." : `${changed} ligne${changed > 1 ? "s" : ""} différente${changed > 1 ? "s" : ""}, en couleur.`}
        </p>
      </div>

      <div className="itable cmp-table-wrap">
        <table className="cmp-table">
          <thead>
            <tr>
              <th>Ingrédient</th>
              <th className="num">
                <Link href={`/recipes/${aId}`}>{title(aId)}</Link>
              </th>
              <th className="num">
                <Link href={`/recipes/${bId}`}>{title(bId)}</Link>
              </th>
              <th className="num">Écart</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.a !== null && r.b !== null ? r.b - r.a : null;
              const state = r.a === null ? "added" : r.b === null ? "removed" : Math.abs(diff ?? 0) > 0.001 ? "changed" : undefined;
              return (
                <tr key={r.key} data-state={state}>
                  <td>
                    {r.name}
                    {r.isSub && <small className="cmp-sub">sous-recette</small>}
                  </td>
                  <td className="num">{r.a === null ? "—" : r.note ?? formatG(r.a)}</td>
                  <td className="num">{r.b === null ? "—" : r.note ?? formatG(r.b)}</td>
                  <td className="num cmp-diff">
                    {state === "added" ? "ajouté" : state === "removed" ? "retiré" : state === "changed" && diff !== null ? (
                      <>
                        {fmtDiff(diff)} <small>{fmtPct(r.a!, r.b!)}</small>
                      </>
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="cmp-total">
              <td>Masse totale</td>
              <td className="num">{formatG(Math.round(totalA))}</td>
              <td className="num">{formatG(Math.round(totalB))}</td>
              <td className="num cmp-diff">{Math.abs(totalB - totalA) > 0.5 ? <>{fmtDiff(totalB - totalA)} <small>{fmtPct(totalA, totalB)}</small></> : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {(steps.a.length > 0 || steps.b.length > 0) && (
        <>
          <div className="sect-title" style={{ marginTop: 18 }}>
            <h2>Étapes</h2>
            <span style={{ color: "var(--muted)", fontSize: 12.5 }}>Les étapes qui diffèrent sont en couleur.</span>
          </div>
          <div className="cmp-steps">
            {([["a", aId, steps.a], ["b", bId, steps.b]] as const).map(([k, rid, list]) => (
              <section key={k} className="fl-card">
                <h3>{title(rid)}</h3>
                {list.length === 0 ? (
                  <p style={{ color: "var(--muted)" }}>Pas d&apos;étapes.</p>
                ) : (
                  <ol>
                    {list.map((s, i) => (
                      <li key={i} data-changed={s.changed ? "true" : undefined}>
                        {stepText(s.text)}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

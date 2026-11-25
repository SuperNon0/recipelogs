"use client";

import { useMemo, useState } from "react";
import { Check, CircleAlert, CircleCheck, Download, Search } from "lucide-react";
import { exportRecipesJson } from "@/app/actions/export";
import { foldText } from "@/lib/textSearch";
import { Help } from "@/components/ui/Help";

type Item = { id: number; name: string; folder: { name: string; color: string } | null; categories: string[]; sous: number };

/**
 * Réglages → Exporter des recettes : recherche, cases à cocher, puis un fichier
 * à importer dans un autre RecipeLog (Réglages → Import JSON).
 */
export function RecipeExport({ recettes }: { recettes: Item[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sousRecettes, setSousRecettes] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Recherche dans le nom, le dossier et les catégories, sans tenir compte des accents.
  const shown = useMemo(() => {
    const q = foldText(query).trim();
    if (!q) return recettes;
    const mots = q.split(/\s+/);
    return recettes.filter((r) => {
      const t = foldText(`${r.name} ${r.folder?.name ?? ""} ${r.categories.join(" ")}`);
      return mots.every((m) => t.includes(m));
    });
  }, [query, recettes]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const toggleShown = () =>
    setSelected((s) => {
      const n = new Set(s);
      for (const r of shown) {
        if (allShown) n.delete(r.id);
        else n.add(r.id);
      }
      return n;
    });
  const withSubs = recettes.some((r) => selected.has(r.id) && r.sous > 0);

  const download = async () => {
    setPending(true);
    setResult(null);
    try {
      const r = await exportRecipesJson([...selected], sousRecettes);
      if (!r.ok) {
        setResult({ ok: false, text: r.error });
        return;
      }
      const blob = new Blob([r.fichier], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recettes-recipelog-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const extra = r.nombre - selected.size;
      setResult({
        ok: true,
        text: `${r.nombre} recette${r.nombre > 1 ? "s" : ""} dans le fichier${extra > 0 ? ` (dont ${extra} sous-recette${extra > 1 ? "s" : ""} ajoutée${extra > 1 ? "s" : ""})` : ""}. Dans l'autre RecipeLog : Réglages → Import JSON.`,
      });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "L'export a échoué." });
    } finally {
      setPending(false);
    }
  };

  const n = selected.size;
  return (
    <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="searchbox">
        <Search size={16} />
        <input
          type="search"
          placeholder="Rechercher une recette, un dossier, une catégorie…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher une recette"
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={toggleShown} disabled={shown.length === 0}>
          {allShown ? "Tout décocher" : query ? `Cocher les ${shown.length} trouvées` : "Tout cocher"}
        </button>
        {n > 0 && (
          <button type="button" className="fl-btn fl-btn-ghost" onClick={() => setSelected(new Set())}>
            Vider la sélection
          </button>
        )}
        <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 13 }}>
          {n} cochée{n > 1 ? "s" : ""} sur {recettes.length}
        </span>
      </div>

      <div className="fl-list fl-scroll" style={{ background: "var(--bg)", maxHeight: "min(55vh, 520px)", overflowY: "auto" }}>
        {shown.length === 0 && (
          <p style={{ padding: 14, color: "var(--muted)", fontSize: 13 }}>
            {query ? `Aucune recette pour « ${query} ».` : "Aucune recette pour l'instant."}
          </p>
        )}
        {shown.map((r, i) => {
          const on = selected.has(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.id)}
              className="fl-row"
              style={{
                width: "100%",
                minHeight: 44,
                padding: "8px 14px",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
                background: on ? "var(--accent-dim)" : "transparent",
                color: "var(--text)",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border2)"}`,
                  background: on ? "var(--accent)" : "transparent",
                  color: "var(--accent-ink)",
                }}
              >
                {on && <Check size={14} strokeWidth={3} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
                {r.sous > 0 && <span style={{ color: "var(--muted)", fontSize: 12 }}> · {r.sous} sous-recette{r.sous > 1 ? "s" : ""}</span>}
              </span>
              {r.folder && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", flex: "none", maxWidth: "40%" }}>
                  <span className="dot" style={{ background: r.folder.color }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.folder.name}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={sousRecettes} onChange={(e) => setSousRecettes(e.target.checked)} />
        Ajouter aussi les sous-recettes utilisées
        <Help title="Sous-recettes" example="Tu coches « Tarte au citron » qui utilise « Pâte sucrée » : la pâte sucrée part aussi dans le fichier, et la tarte y est reliée là-bas.">
          Une recette qui utilise d&apos;autres recettes (pâte, crème…) en a besoin pour se calculer. Cochée,
          ces sous-recettes partent aussi dans le fichier, même si tu ne les as pas cochées, et sont
          reliées à la recette dans l&apos;autre RecipeLog. Décochée, la recette n&apos;est reliée que si
          une recette du même nom existe déjà là-bas.
        </Help>
      </label>
      {withSubs && !sousRecettes && (
        <p className="set-note">Certaines recettes cochées utilisent des sous-recettes : sans elles, l&apos;autre RecipeLog devra déjà les avoir.</p>
      )}

      {result && (
        <div className="set-result" data-ok={result.ok ? "true" : "false"}>
          {result.ok ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
          <span>{result.text}</span>
        </div>
      )}

      <div className="set-foot">
        <button type="button" className="fl-btn fl-btn-primary" onClick={download} disabled={pending || n === 0}>
          <Download size={15} />
          {pending ? "Préparation…" : n === 0 ? "Coche des recettes" : `Télécharger ${n} recette${n > 1 ? "s" : ""}`}
        </button>
      </div>
    </section>
  );
}

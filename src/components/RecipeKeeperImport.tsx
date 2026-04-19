"use client";

import { useState, useRef } from "react";
import { importRecipeKeeperCsv, type ImportResult } from "@/app/actions/import";

export function RecipeKeeperImport() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    const res = await importRecipeKeeperCsv(fd);
    setResult(res);
    setLoading(false);

    if (res.ok && inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[color:var(--muted)]">
        Exportez vos recettes depuis Recipe Keeper (Fichier → Exporter → CSV),
        puis importez le fichier ici. Les recettes déjà présentes (même nom) sont ignorées.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="fl-input"
          style={{ fontSize: "0.875rem" }}
        />
        <div>
          <button
            type="submit"
            disabled={loading}
            className="fl-btn fl-btn-primary"
          >
            {loading ? "Importation…" : "Importer"}
          </button>
        </div>
      </form>

      {result && (
        <div
          className="fl-card flex flex-col gap-2"
          style={{ borderColor: result.ok ? "var(--accent-2)" : "var(--danger)" }}
        >
          {result.ok ? (
            <>
              <p className="text-sm font-medium" style={{ color: "var(--accent-2)" }}>
                ✓ Import terminé
              </p>
              <p className="text-sm">
                {result.imported} recette{result.imported > 1 ? "s" : ""} importée{result.imported > 1 ? "s" : ""}
                {result.skipped > 0 && ` · ${result.skipped} ignorée${result.skipped > 1 ? "s" : ""} (déjà existante${result.skipped > 1 ? "s" : ""})`}
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {result.errors[0] ?? "Erreur inconnue"}
            </p>
          )}
          {result.errors.length > 0 && result.ok && (
            <details className="text-xs text-[color:var(--muted)]">
              <summary className="cursor-pointer">{result.errors.length} erreur{result.errors.length > 1 ? "s" : ""} individuelles</summary>
              <ul className="mt-2 flex flex-col gap-1 pl-3">
                {result.errors.map((e, i) => <li key={i}>· {e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

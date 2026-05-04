"use client";

import { useState, useRef } from "react";
import {
  importRecipeKeeperCsv,
  importRecipeKeeperHtmlOrZip,
  type ImportResult,
} from "@/app/actions/import";

type Mode = "html-zip" | "csv";

export function RecipeKeeperImport() {
  const [mode, setMode] = useState<Mode>("html-zip");
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

    const res =
      mode === "csv"
        ? await importRecipeKeeperCsv(fd)
        : await importRecipeKeeperHtmlOrZip(fd);

    setResult(res);
    setLoading(false);

    if (res.ok && inputRef.current) {
      inputRef.current.value = "";
    }
  }

  const accept = mode === "csv" ? ".csv,text/csv" : ".zip,.html,.htm";
  const helpText =
    mode === "csv"
      ? "Recipe Keeper → Exporter → CSV. Les recettes déjà présentes (même nom) sont ignorées."
      : "Recipe Keeper → Sauvegarde → Recettes au format HTML. Tu obtiens un dossier ; zippe-le et uploade-le ici (ou un seul fichier .html si tu n'as pas le zip). Les images sont sauvegardées et associées aux recettes. Les recettes déjà présentes (même nom) sont ignorées.";

  return (
    <div className="flex flex-col gap-4">
      {/* Onglets de mode */}
      <div
        className="inline-flex rounded-md overflow-hidden border self-start"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={() => {
            setMode("html-zip");
            setResult(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="px-3 py-1.5 text-sm transition-colors"
          style={{
            background: mode === "html-zip" ? "var(--accent)" : "transparent",
            color: mode === "html-zip" ? "var(--bg)" : "var(--text)",
            fontWeight: mode === "html-zip" ? 600 : 400,
            borderRight: "1px solid var(--border)",
          }}
        >
          ZIP / HTML
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("csv");
            setResult(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="px-3 py-1.5 text-sm transition-colors"
          style={{
            background: mode === "csv" ? "var(--accent)" : "transparent",
            color: mode === "csv" ? "var(--bg)" : "var(--text)",
            fontWeight: mode === "csv" ? 600 : 400,
          }}
        >
          CSV
        </button>
      </div>

      <p className="text-sm text-[color:var(--muted)]">{helpText}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          key={mode}
          ref={inputRef}
          type="file"
          accept={accept}
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
          style={{
            borderColor: result.ok ? "var(--accent-2)" : "var(--danger)",
          }}
        >
          {result.ok ? (
            <>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--accent-2)" }}
              >
                ✓ Import terminé
              </p>
              <p className="text-sm">
                {result.imported} recette{result.imported > 1 ? "s" : ""}{" "}
                importée{result.imported > 1 ? "s" : ""}
                {result.skipped > 0 &&
                  ` · ${result.skipped} ignorée${result.skipped > 1 ? "s" : ""} (déjà existante${result.skipped > 1 ? "s" : ""})`}
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {result.errors[0] ?? "Erreur inconnue"}
            </p>
          )}
          {result.errors.length > 0 && result.ok && (
            <details className="text-xs text-[color:var(--muted)]">
              <summary className="cursor-pointer">
                {result.errors.length} erreur
                {result.errors.length > 1 ? "s" : ""} individuelles
              </summary>
              <ul className="mt-2 flex flex-col gap-1 pl-3">
                {result.errors.map((e, i) => (
                  <li key={i}>· {e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

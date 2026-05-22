"use client";

import { useRef, useState } from "react";
import { importRecipesFromJson } from "@/app/actions/import";
import type { ImportResult } from "@/app/actions/import";

type JsonRecipe = { name: string; ingredients?: unknown[] };

export function JsonRecipeImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<JsonRecipe[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const list: JsonRecipe[] = Array.isArray(parsed) ? parsed : [parsed];
        if (list.length === 0 || !list[0]?.name) {
          setParseError("Format non reconnu — vérifie que le fichier est bien un tableau de recettes.");
          setPreview(null);
          return;
        }
        setPreview(list);
      } catch {
        setParseError("Fichier JSON invalide.");
        setPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!inputRef.current?.files?.[0] || !preview) return;
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", inputRef.current.files[0]);
    try {
      const res = await importRecipesFromJson(formData);
      setResult(res);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setResult({ ok: false, imported: 0, skipped: 0, errors: [e instanceof Error ? e.message : "Erreur inconnue"] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          className="fl-input"
          style={{ fontSize: "0.85rem" }}
        />
        <p className="fl-label" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
          Format attendu : tableau JSON avec name, ingredients (name/quantity/unit), steps, notes, source
        </p>
      </div>

      {parseError && (
        <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{parseError}</p>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <div
            className="fl-card"
            style={{ background: "rgba(255,255,255,0.03)", maxHeight: 280, overflowY: "auto", padding: "0.75rem 1rem" }}
          >
            <p className="fl-label mb-2" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              {preview.length} recette{preview.length > 1 ? "s" : ""} détectée{preview.length > 1 ? "s" : ""} — vérification avant import :
            </p>
            <ol className="flex flex-col gap-1" style={{ listStyle: "decimal inside", fontSize: "0.85rem" }}>
              {preview.map((r, i) => (
                <li key={i} style={{ color: "var(--text)" }}>
                  {r.name}
                  <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                    · {Array.isArray(r.ingredients) ? r.ingredients.length : 0} ingrédient{(Array.isArray(r.ingredients) ? r.ingredients.length : 0) > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className="fl-btn fl-btn-primary self-start"
          >
            {loading ? `Import en cours…` : `↓ Importer ${preview.length} recette${preview.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {result && (
        <div
          className="fl-card"
          style={{
            background: result.ok ? "rgba(100,200,100,0.06)" : "rgba(232,92,71,0.08)",
            borderColor: result.ok ? "rgba(100,200,100,0.3)" : "rgba(232,92,71,0.4)",
            padding: "0.8rem 1rem",
          }}
        >
          {result.ok ? (
            <p style={{ fontSize: "0.9rem" }}>
              ✅ <strong>{result.imported}</strong> recette{result.imported > 1 ? "s" : ""} importée{result.imported > 1 ? "s" : ""}
              {result.skipped > 0 && ` · ${result.skipped} ignorée${result.skipped > 1 ? "s" : ""} (déjà existante${result.skipped > 1 ? "s" : ""})`}
            </p>
          ) : (
            <p style={{ color: "var(--danger)", fontSize: "0.9rem" }}>❌ Import échoué</p>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1" style={{ fontSize: "0.8rem", color: "var(--danger)" }}>
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>· {e}</li>)}
              {result.errors.length > 10 && <li>… et {result.errors.length - 10} autres erreurs</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

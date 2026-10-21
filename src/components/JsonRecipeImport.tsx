"use client";

import { useRef, useState } from "react";
import { CircleAlert, CircleCheck, Download, Upload } from "lucide-react";
import { importRecipesFromJson } from "@/app/actions/import";
import type { ImportResult } from "@/app/actions/import";

type JsonRecipe = { name: string; ingredients?: unknown[] };

export function JsonRecipeImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<JsonRecipe[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? null);
    if (!file) return;
    setResult(null);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const list: JsonRecipe[] = Array.isArray(parsed) ? parsed : [parsed];
        if (list.length === 0 || !list[0]?.name) {
          setParseError("Format non reconnu : vérifie que le fichier est bien un tableau de recettes.");
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
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setResult({ ok: false, imported: 0, skipped: 0, errors: [e instanceof Error ? e.message : "Erreur inconnue"] });
    } finally {
      setLoading(false);
    }
  };

  const ingredientCount = (r: JsonRecipe) => (Array.isArray(r.ingredients) ? r.ingredients.length : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="set-file">
        <input ref={inputRef} type="file" accept=".json,application/json" onChange={handleFile} />
        <span style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface)", color: "var(--accent)", flex: "none" }}>
          <Upload size={17} />
        </span>
        <span className="set-tx">
          <b>
            <span>{fileName ?? "Choisir un fichier .json"}</span>
          </b>
          <small>Un tableau de recettes : name, ingredients, steps, notes, source</small>
        </span>
      </label>

      {parseError && (
        <div className="set-alert">
          <CircleAlert size={16} />
          <span>{parseError}</span>
        </div>
      )}

      {preview && (
        <>
          <div>
            <p className="fl-label" style={{ marginBottom: 8 }}>
              {preview.length} recette{preview.length > 1 ? "s" : ""} détectée{preview.length > 1 ? "s" : ""}
            </p>
            <div className="fl-list fl-scroll" style={{ maxHeight: 300, overflowY: "auto" }}>
              {preview.map((r, i) => (
                <div key={i} className="fl-row" style={{ minHeight: 42, padding: "8px 14px" }}>
                  <span className="num" style={{ color: "var(--muted)", fontSize: 12, width: 22 }}>
                    {i + 1}
                  </span>
                  <span className="set-tx">
                    <b>
                      <span>{r.name}</span>
                    </b>
                  </span>
                  <span className="set-count">
                    {ingredientCount(r)} ingrédient{ingredientCount(r) > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="set-foot">
            <button type="button" onClick={handleImport} disabled={loading} className="fl-btn fl-btn-primary">
              <Download size={15} />
              {loading ? "Import en cours…" : `Importer ${preview.length} recette${preview.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="set-result" data-ok={result.ok ? "true" : "false"}>
          {result.ok ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {result.ok ? (
              <span>
                <b style={{ fontWeight: 600 }}>{result.imported}</b> recette{result.imported > 1 ? "s" : ""} importée
                {result.imported > 1 ? "s" : ""}
                {result.skipped > 0 &&
                  ` · ${result.skipped} ignorée${result.skipped > 1 ? "s" : ""} (déjà existante${result.skipped > 1 ? "s" : ""})`}
              </span>
            ) : (
              <span style={{ color: "var(--danger)" }}>Import échoué</span>
            )}
            {result.errors.length > 0 && (
              <ul style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, color: "var(--danger)" }}>
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 10 && <li>et {result.errors.length - 10} autres erreurs</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

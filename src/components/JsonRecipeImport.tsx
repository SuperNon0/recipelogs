"use client";

import { useRef, useState } from "react";
import { CircleAlert, CircleCheck, ClipboardPaste, Download, Upload } from "lucide-react";
import { Help } from "@/components/ui/Help";
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
  // Texte collé (copié depuis « Exporter des recettes » d'un autre RecipeLog), au lieu d'un fichier.
  const [pasted, setPasted] = useState("");
  const [source, setSource] = useState<"file" | "text" | null>(null);

  // Lit le contenu (fichier ou texte collé) et prépare l'aperçu.
  const analyse = (text: string): boolean => {
    try {
      const parsed = JSON.parse(text);
      // Fichier de « Exporter des recettes » (un autre RecipeLog) : { recipelog_export: 1, recettes: [...] }.
      const list: JsonRecipe[] = Array.isArray(parsed?.recettes) ? parsed.recettes : Array.isArray(parsed) ? parsed : [parsed];
      if (list.length === 0 || !list[0]?.name) {
        setParseError("Format non reconnu : vérifie que c'est bien une liste de recettes.");
        setPreview(null);
        return false;
      }
      setParseError(null);
      setPreview(list);
      return true;
    } catch {
      setParseError("Texte JSON invalide : recopie tout, du premier au dernier caractère.");
      setPreview(null);
      return false;
    }
  };

  const handlePaste = (text: string) => {
    setPasted(text);
    setResult(null);
    if (!text.trim()) {
      setParseError(null);
      if (source === "text") {
        setPreview(null);
        setSource(null);
      }
      return;
    }
    // Un texte collé remplace un fichier choisi avant.
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
    setSource("text");
    analyse(text);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) handlePaste(text);
      else setParseError("Le presse-papiers est vide : copie d'abord les recettes dans l'autre RecipeLog.");
    } catch {
      setParseError("Le navigateur ne laisse pas lire le presse-papiers : appuie longuement dans la case puis « Coller ».");
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? null);
    if (!file) return;
    setResult(null);
    setParseError(null);
    setPasted("");
    setSource("file");
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!analyse(ev.target?.result as string)) setParseError("Fichier JSON invalide ou format non reconnu.");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    const file =
      source === "text"
        ? new File([pasted], "recettes-collees.json", { type: "application/json" })
        : inputRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await importRecipesFromJson(formData);
      setResult(res);
      setPreview(null);
      setFileName(null);
      setPasted("");
      setSource(null);
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="fl-label" style={{ margin: 0 }}>
            Ou colle les recettes copiées
          </span>
          <Help
            title="Coller des recettes"
            example="Dans l'autre RecipeLog : Réglages → Exporter des recettes → coche « Tarte au citron » → « Copier ». Ici : touche « Coller ici » (ou appuie longuement dans la case → Coller), puis « Importer »."
          >
            Plus simple sur téléphone qu&apos;un fichier : dans l&apos;autre RecipeLog, « Exporter des
            recettes » → « Copier » met les recettes dans le presse-papiers. Colle-les ici : la liste des
            recettes trouvées s&apos;affiche, puis touche « Importer ». Tu peux aussi coller un texte JSON
            préparé par une IA.
          </Help>
          <button type="button" className="fl-btn fl-btn-secondary" style={{ marginLeft: "auto" }} onClick={pasteFromClipboard}>
            <ClipboardPaste size={15} />
            Coller ici
          </button>
        </div>
        <textarea
          className="fl-input"
          value={pasted}
          onChange={(e) => handlePaste(e.target.value)}
          placeholder="Appuie longuement ici puis « Coller »…"
          rows={4}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Recettes copiées à coller"
          style={{ fontFamily: "var(--font-mono)", fontSize: 16, resize: "vertical", minHeight: 96 }}
        />
      </div>

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

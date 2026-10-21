"use client";

import { useState, useRef } from "react";
import { CircleAlert, CircleCheck, Download, Upload } from "lucide-react";
import {
  importRecipeKeeperCsv,
  importRecipeKeeperHtmlOrZip,
  type ImportResult,
} from "@/app/actions/import";
import { Help } from "@/components/ui/Help";

type Mode = "html-zip" | "csv";

export function RecipeKeeperImport() {
  const [mode, setMode] = useState<Mode>("html-zip");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
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
      setFileName(null);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setResult(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const accept = mode === "csv" ? ".csv,text/csv" : ".zip,.html,.htm";
  const helpText =
    mode === "csv"
      ? "Dans Recipe Keeper : Exporter, puis CSV."
      : "Dans Recipe Keeper : Sauvegarde, puis Recettes au format HTML. Tu obtiens un dossier : compresse-le en .zip et choisis-le ici (ou un seul fichier .html si tu n'as pas le zip). Les photos sont récupérées et rattachées aux recettes.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <form onSubmit={handleSubmit} className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
            Format du fichier
            <Help title="Quel format choisir ?">
              Le format ZIP / HTML est le plus complet : il garde les photos des recettes. Le
              format CSV ne contient que le texte (nom, ingrédients, étapes, notes).
            </Help>
          </span>
          <div className="fl-seg" style={{ alignSelf: "flex-start" }}>
            <button type="button" aria-pressed={mode === "html-zip"} onClick={() => switchMode("html-zip")}>
              ZIP / HTML
            </button>
            <button type="button" aria-pressed={mode === "csv"} onClick={() => switchMode("csv")}>
              CSV
            </button>
          </div>
          <p className="set-note">{helpText}</p>
        </div>

        <label className="set-file">
          <input
            key={mode}
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(e) => {
              setResult(null);
              setFileName(e.target.files?.[0]?.name ?? null);
            }}
          />
          <span className="ic" style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface)", color: "var(--accent)", flex: "none" }}>
            <Upload size={17} />
          </span>
          <span className="set-tx">
            <b>
              <span>{fileName ?? "Choisir un fichier"}</span>
            </b>
            <small>{mode === "csv" ? "Fichier .csv" : "Fichier .zip ou .html"}</small>
          </span>
        </label>

        <div className="set-foot">
          <button type="submit" disabled={loading || !fileName} className="fl-btn fl-btn-primary">
            <Download size={15} />
            {loading ? "Importation…" : "Importer"}
          </button>
        </div>
      </form>

      {result && (
        <div className="set-result" data-ok={result.ok ? "true" : "false"}>
          {result.ok ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {result.ok ? (
              <>
                <b style={{ fontWeight: 600 }}>Import terminé</b>
                <span style={{ color: "var(--soft)" }}>
                  {result.imported} recette{result.imported > 1 ? "s" : ""}{" "}
                  importée{result.imported > 1 ? "s" : ""}
                  {result.skipped > 0 &&
                    ` · ${result.skipped} ignorée${result.skipped > 1 ? "s" : ""} (déjà existante${result.skipped > 1 ? "s" : ""})`}
                  {!!result.photosRestored &&
                    ` · ${result.photosRestored} photo${result.photosRestored > 1 ? "s" : ""} rattachée${result.photosRestored > 1 ? "s" : ""}`}
                </span>
              </>
            ) : (
              <span style={{ color: "var(--danger)" }}>{result.errors[0] ?? "Erreur inconnue"}</span>
            )}
            {result.errors.length > 0 && result.ok && (
              <details className="set-details" style={{ marginTop: 4 }}>
                <summary>
                  {result.errors.length} erreur{result.errors.length > 1 ? "s" : ""} sur des recettes isolées
                </summary>
                <ul style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5, color: "var(--muted)" }}>
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

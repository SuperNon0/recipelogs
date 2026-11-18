"use client";

import { useState, useTransition } from "react";
import { Help } from "@/components/ui/Help";
import { sauverModeAnalyse } from "@/app/actions/ia";
import type { ModeAnalyse, ModesAnalyse } from "@/lib/ia/analyse";

/**
 * Réglages → Lecture des factures : comment on fait lire ce qu'on dépose
 * (factures, mercuriales). Le choix n'apparaît que si l'offre comprend les
 * deux (réglé par RecipeLog dans le panel) ; sinon on dit lequel s'applique.
 */
export function AnalyseSettings({ initial }: { initial: ModesAnalyse }) {
  const [m, setM] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();
  const deux = m.ia && m.mcp;

  function choisir(prefere: ModeAnalyse) {
    setMsg(null);
    start(async () => {
      const r = await sauverModeAnalyse(prefere);
      if (!r.ok) return setMsg({ ok: false, texte: r.error });
      setM(r.modes);
      setMsg({ ok: true, texte: "Enregistré." });
    });
  }

  return (
    <div className="acct-card sup-form">
      <fieldset className="ia-modes" disabled={pending}>
        <legend className="sup-lbl">
          Comment analyser tes factures et mercuriales ?
          <Help title="IA ou Claude (MCP) ?" example="Tu prends une facture en photo : « Garder pour Claude », puis tu dis à Claude « remplis mes factures à traiter ».">
            Quand tu déposes une facture (page Factures) ou une mercuriale (fiche d&apos;un fournisseur), deux façons de la faire lire.
            L&apos;IA : elle la lit tout de suite et tu vérifies les lignes. Claude (MCP) : elle attend dans « À traiter », puis tu demandes à
            Claude, avec le connecteur RecipeLog, de la remplir ; ça n&apos;utilise pas de lecture par IA. Les deux boutons restent proposés à
            chaque dépôt : ce réglage choisit celui mis en avant.
            {!deux && " Ton offre n'en comprend qu'un : c'est RecipeLog qui le règle."}
          </Help>
        </legend>
        {deux ? (
          <>
            <label className="ia-mode">
              <input type="radio" name="analyse" checked={m.prefere === "ia"} onChange={() => choisir("ia")} />
              <span>
                <b>Analyser par l&apos;IA</b>
                <small>L&apos;IA lit le document tout de suite, tu vérifies</small>
              </span>
            </label>
            <label className="ia-mode">
              <input type="radio" name="analyse" checked={m.prefere === "mcp"} onChange={() => choisir("mcp")} />
              <span>
                <b>Garder pour Claude (MCP)</b>
                <small>Le document attend « à traiter », Claude le remplit par le connecteur RecipeLog</small>
              </span>
            </label>
          </>
        ) : (
          <p className="sub" style={{ margin: 0 }}>
            {m.mcp
              ? "Ton offre : Claude (MCP). Tes documents attendent « à traiter » et Claude les remplit par le connecteur RecipeLog."
              : "Ton offre : analyse par l'IA. Tes documents sont lus par l'IA, puis tu vérifies les lignes."}
          </p>
        )}
      </fieldset>
      {msg && <p className={`acct-msg ${msg.ok ? "ok" : "err"}`}>{msg.texte}</p>}
    </div>
  );
}

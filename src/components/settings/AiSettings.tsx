"use client";

import { useState, useTransition } from "react";
import { Help } from "@/components/ui/Help";
import { sauverReglagesIA, testerReglagesIA } from "@/app/actions/ia";
import type { FournisseurIA, ModeIA, ReglagesIAPublic } from "@/lib/ia/reglages";

type Infos = { id: FournisseurIA; nom: string; modele: string; ouObtenir: string };

/** Réglages → Lecture des factures : d'où vient l'IA, et la clé du client s'il met la sienne. */
export function AiSettings({
  initial,
  quota,
  fournisseurs,
  iaPlateforme = true,
}: {
  /** false : l'offre ne comprend pas l'IA de RecipeLog (panel « Claude (MCP) seulement »), seule la clé du client reste. */
  iaPlateforme?: boolean;
  initial: ReglagesIAPublic;
  quota: { disponible: boolean; limite: number; utilise: number } | null;
  fournisseurs: Infos[];
}) {
  const [r, setR] = useState(initial);
  const [mode, setMode] = useState<ModeIA>(initial.mode);
  const [fournisseur, setFournisseur] = useState<FournisseurIA>(initial.fournisseur);
  const [cle, setCle] = useState("");
  const [modele, setModele] = useState(initial.modele);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();
  const infos = fournisseurs.find((f) => f.id === fournisseur)!;
  const cleGardee = fournisseur === r.fournisseur && r.cleFin;

  function enregistrer(ev: React.FormEvent) {
    ev.preventDefault();
    setMsg(null);
    start(async () => {
      const res = await sauverReglagesIA({ mode, fournisseur, cle, modele });
      if (!res.ok) return setMsg({ ok: false, texte: res.error });
      setR(res.reglages);
      setModele(res.reglages.modele);
      setCle("");
      setMsg({ ok: true, texte: "Réglages enregistrés." });
    });
  }

  function tester() {
    setMsg(null);
    start(async () => {
      const res = await testerReglagesIA();
      setMsg(res.ok ? { ok: true, texte: res.message } : { ok: false, texte: res.error });
    });
  }

  if (r.demo) return <p className="sub">La lecture par IA est coupée sur le site de démonstration.</p>;

  return (
    <form className="acct-card sup-form" onSubmit={enregistrer}>
      <fieldset className="ia-modes">
        <legend className="sup-lbl">
          D&apos;où vient l&apos;IA ?
          <Help title="D'où vient l'IA ?" example="Avec l'IA de RecipeLog et 30 lectures par mois, la 31e facture du mois se saisit à la main ou attend le 1er.">
            {r.plateforme
              ? "L'IA de RecipeLog est comprise dans ton offre, avec un nombre de lectures par mois."
              : "Avec ta propre clé, tu paies directement ton fournisseur d'IA (quelques centimes par facture) et il n'y a pas de limite."}{" "}
            Coupée : le bouton « Lire une facture avec
            l&apos;IA » ne marche plus ; l&apos;import Excel et CSV des mercuriales marche toujours.
          </Help>
        </legend>
        {r.plateforme && (iaPlateforme || mode === "plateforme") && (
          <label className="ia-mode">
            <input type="radio" name="mode" checked={mode === "plateforme"} onChange={() => setMode("plateforme")} />
            <span>
              <b>IA de RecipeLog</b>
              <small>
                {quota
                  ? quota.disponible
                    ? `${quota.utilise} lecture(s) utilisée(s) sur ${quota.limite} ce mois-ci`
                    : "Pas encore ouverte sur ton offre : demande-la à RecipeLog"
                  : "La plateforme ne répond pas pour l'instant"}
              </small>
            </span>
          </label>
        )}
        {!r.plateforme && (
        <label className="ia-mode">
          <input type="radio" name="mode" checked={mode === "cle"} onChange={() => setMode("cle")} />
          <span>
            <b>Ma propre clé</b>
            <small>Claude, ChatGPT ou Gemini : tu paies ton fournisseur d&apos;IA, sans limite</small>
          </span>
        </label>
        )}
        <label className="ia-mode">
          <input type="radio" name="mode" checked={mode === "off"} onChange={() => setMode("off")} />
          <span>
            <b>Coupée</b>
            <small>Pas de lecture par IA</small>
          </span>
        </label>
      </fieldset>

      {mode === "cle" && (
        <>
          <label>
            <span className="sup-lbl">
              Fournisseur d&apos;IA
              <Help title="Fournisseur d'IA">
                Le service chez qui tu as créé ta clé. Les trois savent lire une photo ou un PDF. Claude est celui que RecipeLog utilise et teste le plus.
              </Help>
            </span>
            <select
              className="fl-input"
              value={fournisseur}
              onChange={(e) => {
                const f = e.target.value as FournisseurIA;
                setFournisseur(f);
                setModele(fournisseurs.find((x) => x.id === f)!.modele);
              }}
            >
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>{f.nom}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sup-lbl">
              Clé d&apos;API
              <Help title="Clé d'API" example={<>Une clé Claude commence par « sk-ant- ». Elle se crée sur <a href={infos.ouObtenir} target="_blank" rel="noreferrer">{infos.ouObtenir.replace("https://", "")}</a>.</>}>
                La clé secrète donnée par ton fournisseur d&apos;IA. Elle reste sur ton serveur RecipeLog et n&apos;est jamais réaffichée : seuls ses
                4 derniers caractères le sont. Laisse vide pour garder la clé déjà enregistrée ; écris « - » pour l&apos;effacer.
              </Help>
            </span>
            <input
              className="fl-input"
              type="password"
              autoComplete="off"
              value={cle}
              placeholder={cleGardee ? `Clé enregistrée (…${r.cleFin})` : "Colle ta clé ici"}
              onChange={(e) => setCle(e.target.value)}
            />
          </label>
          <label>
            <span className="sup-lbl">
              Modèle
              <Help title="Modèle d'IA" example={`Par défaut : ${infos.modele}.`}>
                Le nom exact du modèle chez ton fournisseur. Garde celui proposé si tu ne sais pas ; « Tester » vérifie qu&apos;il existe.
              </Help>
            </span>
            <input className="fl-input" value={modele} onChange={(e) => setModele(e.target.value)} maxLength={100} />
          </label>
        </>
      )}

      {msg && <p className={`acct-msg ${msg.ok ? "ok" : "err"}`}>{msg.texte}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="fl-btn fl-btn-primary" disabled={pending}>Enregistrer</button>
        <button type="button" className="fl-btn fl-btn-secondary" disabled={pending || r.mode === "off"} onClick={tester}>
          Tester
        </button>
        <Help title="Tester">Vérifie les réglages enregistrés : la clé et le modèle (sans lire de facture, donc sans frais), ou les lectures qui restent sur l&apos;IA de RecipeLog.</Help>
      </div>
    </form>
  );
}

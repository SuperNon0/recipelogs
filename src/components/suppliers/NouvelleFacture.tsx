"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Eye, FileText, Images, Loader2, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { AiReaderModal, type FactureATraiter } from "./AiReader";
import { estPdf, preparerPhoto } from "@/lib/photoFacture";
import type { PendingInvoiceItem } from "@/lib/pendingInvoices";
import {
  ajouterFactureATraiter,
  etatNouvelleFacture,
  supprimerFactureATraiter,
  type EtatNouvelleFacture,
} from "@/app/actions/facturesATraiter";

/**
 * Bouton « Nouvelle facture » de la page Factures, pensé pour le téléphone :
 * 1. prendre la facture en photo (ou la choisir dans la galerie, ou un PDF) ;
 * 2. le site la garde ;
 * 3. « Enregistrer et analyser » (l'IA la lit tout de suite, on vérifie les
 *    lignes) ou « Enregistrer seulement » (elle reste « à traiter », pour la
 *    lire plus tard ou la faire remplir par Claude).
 */

type Page = { file: File; url: string | null };

export function NouvelleFactureButton({ fournisseurs }: { fournisseurs: string[] }) {
  const [open, setOpen] = useState(false);
  const [analyse, setAnalyse] = useState<FactureATraiter | null>(null);
  return (
    <>
      <button type="button" className="fl-btn fl-btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} /> Nouvelle facture
      </button>
      {open && (
        <NouvelleFactureModal
          onClose={() => setOpen(false)}
          onAnalyser={(f) => {
            setOpen(false);
            setAnalyse(f);
          }}
        />
      )}
      {analyse && <AiReaderModal type="facture" fournisseurs={fournisseurs} attente={analyse} onClose={() => setAnalyse(null)} />}
    </>
  );
}

function NouvelleFactureModal({ onClose, onAnalyser }: { onClose: () => void; onAnalyser: (f: FactureATraiter) => void }) {
  const router = useRouter();
  const [etat, setEtat] = useState<EtatNouvelleFacture | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<"analyser" | "garder" | null>(null);
  const [gardee, setGardee] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);

  useEffect(() => {
    etatNouvelleFacture().then(setEtat).catch(() => setEtat(null));
  }, []);

  // Libère les aperçus quand la fenêtre se ferme.
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  useEffect(() => () => pagesRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  const maxPages = etat?.limites.pages ?? 10;
  const unPdf = pages.length === 1 && estPdf(pages[0].file);
  const peutAjouter = !unPdf && pages.length < maxPages;
  const coupee = etat?.limites.attente === 0;
  const pleine = !!etat && !coupee && etat.enAttente >= etat.limites.attente;
  const iaPrete = etat?.ia.prete ?? false;

  function ajouter(liste: FileList | null) {
    setErreur(null);
    const choisis = Array.from(liste ?? []);
    if (!choisis.length) return;
    const pdfs = choisis.filter(estPdf);
    if (pdfs.length && (pages.length > 0 || choisis.length > 1)) {
      return setErreur("Un PDF s'envoie seul : il contient déjà toutes les pages de la facture.");
    }
    const place = maxPages - pages.length;
    if (choisis.length > place) setErreur(`${maxPages} pages au plus par facture : les autres photos n'ont pas été ajoutées.`);
    const nouvelles = choisis.slice(0, Math.max(0, place)).map((file) => ({ file, url: estPdf(file) ? null : URL.createObjectURL(file) }));
    setPages((p) => [...p, ...nouvelles]);
  }

  function retirer(i: number) {
    setPages((p) => {
      const q = [...p];
      const [x] = q.splice(i, 1);
      if (x?.url) URL.revokeObjectURL(x.url);
      return q;
    });
  }

  async function enregistrer(analyser: boolean) {
    setErreur(null);
    setOccupe(analyser ? "analyser" : "garder");
    try {
      const fd = new FormData();
      for (const p of pages) fd.append("pages", await preparerPhoto(p.file));
      if (note.trim()) fd.set("note", note.trim());
      const r = await ajouterFactureATraiter(fd);
      if (!r.ok) return setErreur(r.error);
      router.refresh();
      if (analyser) onAnalyser({ id: r.facture.id, pages: r.facture.pages, pdf: r.facture.pdf });
      else setGardee(true);
    } catch {
      setErreur("L'envoi n'a pas marché (connexion coupée ?). Réessaie.");
    } finally {
      setOccupe(null);
    }
  }

  if (gardee) {
    return (
      <ModalOverlay onClose={onClose} title="Nouvelle facture">
        <div className="nf-fini">
          <CheckCircle2 size={30} />
          <strong>Facture gardée dans « À traiter ».</strong>
          <span className="sub">
            Tu pourras la faire lire par l&apos;IA plus tard depuis la page Factures, ou demander à Claude de la remplir (« remplis mes factures
            à traiter »).
          </span>
          <button type="button" className="fl-btn fl-btn-primary" onClick={onClose}>Fermer</button>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay onClose={onClose} title="Nouvelle facture">
      <div style={{ display: "grid", gap: 12 }}>
        <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { ajouter(e.target.files); e.target.value = ""; }} />
        <input ref={galerie} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { ajouter(e.target.files); e.target.value = ""; }} />

        {coupee ? (
          <p className="ia-etat" data-ok="false">Les factures prises en photo ne sont pas ouvertes sur ton offre. Demande-les à RecipeLog.</p>
        ) : pleine ? (
          <p className="ia-etat" data-ok="false">
            {etat!.enAttente} factures attendent déjà dans « À traiter » ({etat!.limites.attente} au plus). Analyse ou supprime-en avant d&apos;en
            ajouter une.
          </p>
        ) : pages.length === 0 ? (
          <>
            <p className="sub" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
              Prends la facture en photo, bien à plat et éclairée, ou choisis-la dans ta galerie.
              <Help title="Nouvelle facture" example="Une facture Ribera de 2 pages : prends la page 1, touche « Ajouter une page », prends la page 2.">
                Le site garde la photo, puis te demande si l&apos;IA doit la lire tout de suite. Une facture de plusieurs pages : ajoute une photo par
                page (jusqu&apos;à {maxPages}). Un PDF reçu par e-mail marche aussi, depuis « Choisir dans la galerie ». Les photos sont réduites
                avant l&apos;envoi pour aller vite, même en 4G.
              </Help>
            </p>
            <div className="nf-choix">
              <button type="button" className="nf-tuile" onClick={() => photo.current?.click()}>
                <Camera size={26} />
                <strong>Prendre une photo</strong>
                <small>Ouvre l&apos;appareil photo</small>
              </button>
              <button type="button" className="nf-tuile" onClick={() => galerie.current?.click()}>
                <Images size={26} />
                <strong>Choisir dans la galerie</strong>
                <small>Photo ou PDF déjà sur le téléphone</small>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="nf-pages">
              {pages.map((p, i) => (
                <div key={i} className="nf-page">
                  {p.url ? <img src={p.url} alt={`Page ${i + 1}`} /> : <span className="nf-pdf"><FileText size={26} />PDF</span>}
                  <span className="nf-num">{unPdf ? p.file.name.slice(0, 24) : `Page ${i + 1}`}</span>
                  <button type="button" className="nf-retirer" aria-label={`Retirer la page ${i + 1}`} onClick={() => retirer(i)} disabled={!!occupe}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            {peutAjouter && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" className="fl-btn fl-btn-secondary" onClick={() => photo.current?.click()} disabled={!!occupe}>
                  <Camera size={15} /> Ajouter une page
                </button>
                <button type="button" className="fl-btn fl-btn-ghost" onClick={() => galerie.current?.click()} disabled={!!occupe}>
                  <Images size={15} /> Depuis la galerie
                </button>
                <Help title="Ajouter une page">
                  Pour une facture de plusieurs pages : une photo par page, dans l&apos;ordre. Elles sont lues ensemble et réunies en un seul PDF
                  joint à la facture.
                </Help>
              </div>
            )}
            <label style={{ display: "grid", gap: 4 }}>
              <span className="fl-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                Remarque (facultatif)
                <Help title="Remarque">Un mot pour la retrouver dans « À traiter » : le fournisseur, la livraison… Il est repris sur la facture enregistrée.</Help>
              </span>
              <input className="fl-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Ribera, livraison de mardi" />
            </label>

            <div className="nf-actions">
              <span className="fl-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                Que faire de cette facture ?
                <Help title="Analyser ou enregistrer seulement ?">
                  « Enregistrer et analyser » : l&apos;IA lit la facture tout de suite, puis tu vérifies chaque ligne avant qu&apos;elle soit
                  enregistrée. « Enregistrer seulement » : elle attend dans « À traiter », en haut de la page Factures. Tu pourras la faire lire
                  plus tard, ou demander à Claude (connecteur RecipeLog) de la remplir. Dans les deux cas, la photo est gardée et sera jointe à la
                  facture.
                </Help>
              </span>
              <button type="button" className="fl-btn fl-btn-primary" disabled={!!occupe || !iaPrete} onClick={() => enregistrer(true)}>
                {occupe === "analyser" ? <Loader2 size={15} className="ia-tourne" /> : <Sparkles size={15} />}
                Enregistrer et analyser
              </button>
              <button type="button" className="fl-btn fl-btn-secondary" disabled={!!occupe} onClick={() => enregistrer(false)}>
                {occupe === "garder" ? <Loader2 size={15} className="ia-tourne" /> : <Save size={15} />}
                Enregistrer seulement
              </button>
              {etat && !iaPrete && <p className="ia-etat" data-ok="false">{etat.ia.message}</p>}
              {etat && iaPrete && etat.ia.mode === "plateforme" && etat.ia.quota && (
                <p className="ia-etat" data-ok="true">
                  {Math.max(0, etat.ia.quota.limite - etat.ia.quota.utilise)} lecture(s) par IA restante(s) ce mois-ci.
                </p>
              )}
            </div>
          </>
        )}
        {erreur && <span className="ing-fact-msg" data-err="true">{erreur}</span>}
      </div>
    </ModalOverlay>
  );
}

// ─────────────────────────────────────────────
// Liste « À traiter » (haut de la page Factures)
// ─────────────────────────────────────────────

export function FacturesATraiter({ factures, fournisseurs, limite }: { factures: PendingInvoiceItem[]; fournisseurs: string[]; limite: number }) {
  const router = useRouter();
  const [analyse, setAnalyse] = useState<FactureATraiter | null>(null);
  const [voir, setVoir] = useState<PendingInvoiceItem | null>(null);
  const [supprimer, setSupprimer] = useState<PendingInvoiceItem | null>(null);
  if (!factures.length) return null;
  return (
    <section className="nf-attente">
      <div className="sect-title" style={{ marginTop: 6 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
        À traiter ({factures.length}{limite ? ` sur ${limite}` : ""})
        <Help title="Factures à traiter">
          Les factures prises en photo avec « Nouvelle facture » qui ne sont pas encore enregistrées. « Analyser » : l&apos;IA les lit et tu
          vérifies les lignes. Tu peux aussi demander à Claude (connecteur RecipeLog) : « remplis mes factures à traiter ». Une fois
          enregistrée, la facture quitte cette liste et ses photos sont jointes à la facture.
        </Help>
      </h2>
      </div>
      <div className="fl-list">
        {factures.map((f) => (
          <div key={f.id} className="fl-row nf-ligne">
            <button type="button" className="nf-mini" onClick={() => setVoir(f)} aria-label="Voir la facture">
              {f.pdf ? <FileText size={20} /> : <img src={`/api/factures/a-traiter/${f.id}/1`} alt="" loading="lazy" />}
            </button>
            <span className="set-tx">
              <b>{f.note || `Facture du ${new Date(f.createdAt).toLocaleDateString("fr-FR")}`}</b>
              <small>
                {[
                  `Ajoutée le ${new Date(f.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
                  f.pdf ? "PDF" : `${f.pages} page${f.pages > 1 ? "s" : ""}`,
                  f.addedBy,
                ].filter(Boolean).join(" · ")}
              </small>
              {f.lastError && <small className="nf-err">Dernière lecture : {f.lastError}</small>}
            </span>
            <span className="nf-btns">
              <button type="button" className="fl-btn fl-btn-primary" onClick={() => setAnalyse({ id: f.id, pages: f.pages, pdf: f.pdf })}>
                <Sparkles size={15} /> Analyser
              </button>
              <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label="Voir" onClick={() => setVoir(f)}>
                <Eye size={16} />
              </button>
              <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label="Supprimer" onClick={() => setSupprimer(f)}>
                <Trash2 size={16} />
              </button>
            </span>
          </div>
        ))}
      </div>
      {analyse && (
        <AiReaderModal
          type="facture"
          fournisseurs={fournisseurs}
          attente={analyse}
          onClose={() => {
            setAnalyse(null);
            router.refresh();
          }}
        />
      )}
      {voir && <VoirFacture facture={voir} onClose={() => setVoir(null)} />}
      {supprimer && (
        <SupprimerFacture
          facture={supprimer}
          onClose={() => setSupprimer(null)}
          onFait={() => {
            setSupprimer(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function VoirFacture({ facture, onClose }: { facture: PendingInvoiceItem; onClose: () => void }) {
  const src = (n: number) => `/api/factures/a-traiter/${facture.id}/${n}`;
  return (
    <ModalOverlay onClose={onClose} title={facture.note || "Facture à traiter"} wide>
      {facture.pdf ? (
        <a className="fl-btn fl-btn-primary" href={src(1)} target="_blank" rel="noreferrer">
          <FileText size={15} /> Ouvrir le PDF
        </a>
      ) : (
        <div className="nf-grand">
          {Array.from({ length: facture.pages }, (_, i) => (
            <a key={i} href={src(i + 1)} target="_blank" rel="noreferrer">
              <img src={src(i + 1)} alt={`Page ${i + 1}`} />
            </a>
          ))}
        </div>
      )}
    </ModalOverlay>
  );
}

function SupprimerFacture({ facture, onClose, onFait }: { facture: PendingInvoiceItem; onClose: () => void; onFait: () => void }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <ModalOverlay onClose={onClose} title="Supprimer cette facture ?">
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0 }}>
          {facture.pdf ? "Le PDF de cette facture sera supprimé" : facture.pages > 1 ? `Les ${facture.pages} photos de cette facture seront supprimées` : "La photo de cette facture sera supprimée"}{" "}
          du site{facture.note ? ` (« ${facture.note} »)` : ""}. Rien d&apos;autre ne change.
        </p>
        {erreur && <span className="ing-fact-msg" data-err="true">{erreur}</span>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose}>Garder</button>
          <button
            type="button"
            className="fl-btn fl-btn-danger"
            disabled={occupe}
            onClick={async () => {
              setOccupe(true);
              const r = await supprimerFactureATraiter(facture.id);
              setOccupe(false);
              if (!r.ok) return setErreur(r.error);
              onFait();
            }}
          >
            {occupe ? <Loader2 size={15} className="ia-tourne" /> : <Trash2 size={15} />} Supprimer
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

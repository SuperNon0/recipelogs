"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, FileUp, Loader2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { PRICE_UNITS, type PriceUnit } from "@/lib/cost";
import { montantLigne, prixALUnite, type DocumentLu, type LigneLue, type TypeLecture } from "@/lib/ia/document";
import { NOMS_ROLES, ROLES, lignesDepuisTableau, type Colonnes, type Role } from "@/lib/mercuriale";
import type { PurchaseOrderSummary } from "@/lib/purchaseOrders";
import { articleKey } from "@/lib/suppliers";
import {
  articlesConnus,
  enregistrerFactureLue,
  enregistrerMercuriale,
  etatLectureIA,
  lancerLecture,
  lireTableurMercuriale,
  produitsConnus,
  suivreLecture,
  type EtatIA,
} from "@/app/actions/ia";

/**
 * « Lire une facture avec l'IA » (page Factures) et « Importer une mercuriale »
 * (fiche d'un fournisseur). Étapes : choisir le fichier → lecture (IA, ou
 * colonnes d'un tableau Excel / CSV) → vérifier et corriger chaque ligne →
 * enregistrer. Rien n'est écrit dans RecipeLog avant « Enregistrer ».
 */

type Fournisseur = { id: number; name: string };
type Connu = Awaited<ReturnType<typeof produitsConnus>>[number];
type Etape =
  | { e: "choisir" }
  | { e: "attente" }
  | { e: "lecture"; debut: number }
  | { e: "colonnes"; lignes: string[][]; entete: number; colonnes: Colonnes }
  | { e: "verifier"; doc: DocumentLu; modele: string | null; secours: boolean }
  | { e: "fini"; resume: PurchaseOrderSummary; fichierJoint: boolean | null };

// Le jour d'ici (pas celui de Londres : entre minuit et 2 h du matin, ce n'est pas le même).
const jour = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Ligne à l'écran : `articleChoisi` quand la personne a touché au champ Article. */
/** uid : repère stable de la ligne à l'écran (pas envoyé au serveur). */
type LigneEcran = LigneLue & { articleChoisi?: boolean; uid?: number };
let uidSuivant = 1;
const avecUid = <T extends LigneLue>(l: T): T & { uid: number } => ({ ...l, uid: uidSuivant++ });
/** Lignes affichées d'un coup : une mercuriale de 1 000 lignes reste fluide, même sur un téléphone. */
const PAR_PAGE = 150;
type Filtre = "toutes" | "doute" | "nouveau" | "change";
const euro = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const prixTxt = (n: number, u: string) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} €/${u}`;
// Même règle que le serveur pour reconnaître un produit déjà connu (sans accents ni majuscules).
const cleProduit = articleKey;

const ligneVide = (): LigneLue => ({
  produit: "", reference: null, article: null, famille: null, quantite: null, contenance: null,
  unite: "kg", prixUnitaire: null, prixColis: null, montant: null, aVerifier: null,
});

export function AiReaderButton({ type, fournisseur, fournisseurs = [] }: { type: TypeLecture; fournisseur?: Fournisseur; fournisseurs?: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setOpen(true)}>
        {type === "facture" ? <Sparkles size={15} /> : <FileUp size={15} />}
        {type === "facture" ? "Lire une facture avec l'IA" : "Importer une mercuriale"}
      </button>
      {open && <AiReaderModal type={type} fournisseur={fournisseur} fournisseurs={fournisseurs} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Facture « à traiter » déjà gardée sur le site : la lecture part toute seule, sur ses pages. */
export type FactureATraiter = { id: number; pages: number; pdf: boolean };

export function AiReaderModal({
  type, fournisseur, fournisseurs, onClose, attente,
}: { type: TypeLecture; fournisseur?: Fournisseur; fournisseurs: string[]; onClose: () => void; attente?: FactureATraiter }) {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>({ e: attente ? "attente" : "choisir" });
  const depart = attente ? ({ e: "attente" } as const) : ({ e: "choisir" } as const);
  const [etat, setEtat] = useState<EtatIA | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const annule = useRef(false);

  useEffect(() => {
    annule.current = false;
    etatLectureIA().then(setEtat).catch(() => setEtat(null));
    return () => {
      annule.current = true;
    };
  }, []);

  // Facture à traiter : on lance la lecture dès l'ouverture.
  const lancee = useRef(false);
  useEffect(() => {
    if (attente && !lancee.current) {
      lancee.current = true;
      void lire();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tableur = (f: File) => /\.(xlsx|csv|txt|tsv|xls)$/i.test(f.name);

  async function lire() {
    if (!fichier && !attente) return;
    setErreur(null);
    if (fichier && type === "mercuriale" && tableur(fichier)) {
      setOccupe(true);
      const fd = new FormData();
      fd.set("fichier", fichier);
      const r = await lireTableurMercuriale(fd);
      setOccupe(false);
      if (!r.ok) return setErreur(r.error);
      return setEtape({ e: "colonnes", lignes: r.lignes, entete: r.entete, colonnes: r.colonnes });
    }
    const fd = new FormData();
    if (attente) fd.set("attenteId", String(attente.id));
    else if (fichier) fd.set("fichier", fichier);
    fd.set("type", type);
    if (fournisseur) fd.set("fournisseurId", String(fournisseur.id));
    setOccupe(true);
    const r = await lancerLecture(fd);
    setOccupe(false);
    if (!r.ok) {
      setEtape(depart);
      return setErreur(r.error);
    }
    setEtape({ e: "lecture", debut: Date.now() });
    // La lecture tourne sur le serveur : on demande où elle en est toutes les 2 secondes.
    while (!annule.current) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const s = await suivreLecture(r.id).catch(() => ({ etat: "en_cours" as const }));
      if (s.etat === "en_cours") continue;
      if (s.etat === "perdu") {
        setEtape(depart);
        return setErreur("La lecture a été interrompue (le site a peut-être redémarré). Relance-la.");
      }
      if (!s.resultat.ok) {
        setEtape(depart);
        return setErreur(s.resultat.message);
      }
      const doc = { ...s.resultat.document };
      if (type === "mercuriale" && fournisseur) doc.fournisseur = fournisseur.name;
      if (type === "mercuriale" && !doc.date) doc.date = jour();
      return setEtape({ e: "verifier", doc, modele: s.resultat.modele, secours: s.resultat.secours });
    }
  }

  const titre = attente
    ? "Analyser la facture"
    : type === "facture" ? "Lire une facture avec l'IA" : `Importer une mercuriale${fournisseur ? ` · ${fournisseur.name}` : ""}`;

  return (
    <ModalOverlay onClose={onClose} title={titre} wide={etape.e === "verifier" || etape.e === "colonnes"}>
      {etape.e === "choisir" && (
        <Choisir
          type={type}
          etat={etat}
          fichier={fichier}
          setFichier={(f) => {
            setFichier(f);
            setErreur(null);
          }}
          erreur={erreur}
          occupe={occupe}
          onLire={lire}
          estTableur={fichier ? tableur(fichier) : false}
        />
      )}
      {etape.e === "attente" && attente && <AttenteRelancer etat={etat} erreur={erreur} occupe={occupe} onLire={lire} onClose={onClose} />}
      {etape.e === "lecture" && <Lecture debut={etape.debut} attente={!!attente} />}
      {etape.e === "verifier" && attente && <PagesFacture facture={attente} />}
      {etape.e === "colonnes" && (
        <ChoixColonnes
          lignes={etape.lignes}
          entete={etape.entete}
          colonnes={etape.colonnes}
          onRetour={() => setEtape({ e: "choisir" })}
          onSuite={(lignes) =>
            setEtape({ e: "verifier", doc: { fournisseur: fournisseur?.name ?? null, date: jour(), numero: null, total: null, remarque: null, lignes }, modele: null, secours: false })
          }
        />
      )}
      {etape.e === "verifier" && (
        <Verifier
          type={type}
          initial={etape.doc}
          modele={etape.modele}
          secours={etape.secours}
          fournisseurFixe={fournisseur}
          fournisseurs={fournisseurs}
          onRetour={() => setEtape(depart)}
          onEnregistrer={async (doc, remplacer, note, nouveauFournisseur) => {
            if (type === "mercuriale") {
              if (!fournisseur) return "Fournisseur inconnu.";
              const r = await enregistrerMercuriale({ fournisseurId: fournisseur.id, date: doc.date ?? jour(), nomFichier: fichier?.name ?? "", lignes: doc.lignes });
              if (!r.ok) return r.error;
              setEtape({ e: "fini", resume: r.resume, fichierJoint: null });
            } else {
              const fd = new FormData();
              fd.set("document", JSON.stringify(doc));
              if (remplacer) fd.set("remplacer", "1");
              if (nouveauFournisseur) fd.set("nouveauFournisseur", "1");
              if (note) fd.set("note", note);
              if (attente) fd.set("attenteId", String(attente.id));
              else if (fichier && !tableur(fichier)) fd.set("fichier", fichier);
              const r = await enregistrerFactureLue(fd);
              if (!r.ok) return r.error;
              setEtape({ e: "fini", resume: r.resume, fichierJoint: r.fichierJoint });
            }
            router.refresh();
            return null;
          }}
        />
      )}
      {etape.e === "fini" && <Fini type={type} resume={etape.resume} fichierJoint={etape.fichierJoint} onClose={onClose} />}
    </ModalOverlay>
  );
}

// ─────────────────────────────────────────────
// 1. Choisir le fichier
// ─────────────────────────────────────────────

function Choisir({
  type, etat, fichier, setFichier, erreur, occupe, onLire, estTableur,
}: {
  type: TypeLecture; etat: EtatIA | null; fichier: File | null; setFichier: (f: File | null) => void;
  erreur: string | null; occupe: boolean; onLire: () => void; estTableur: boolean;
}) {
  const iaPrete = etat?.prete ?? false;
  const bloque = !fichier || occupe || (!estTableur && !iaPrete);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="sub" style={{ margin: 0 }}>
        {type === "facture"
          ? "Prends la facture en photo ou choisis son PDF. L'IA recopie chaque ligne ; tu vérifies tout avant d'enregistrer."
          : "Choisis le fichier de prix du fournisseur : Excel ou CSV (lu directement), PDF ou photo (lu par l'IA). Tu vérifies les prix avant de les enregistrer."}
      </p>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="fl-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Fichier
          <Help title={type === "facture" ? "Quel fichier envoyer ?" : "Quels fichiers sont lus ?"} example={type === "facture" ? "Le PDF reçu par e-mail de Ribera, ou une photo bien droite de la facture papier." : "Le tableau Excel « tarifs-novembre.xlsx » envoyé par Choframa."}>
            {type === "facture"
              ? "Un PDF ou une photo (JPG, PNG, WebP), 10 Mo au plus. Une photo nette, à plat et bien éclairée se lit mieux. Le fichier est joint à la facture une fois enregistrée."
              : "Excel (.xlsx) et CSV : le site lit les colonnes lui-même, sans IA. PDF et photo : lus par l'IA, comme une facture. Un vieux fichier .xls doit d'abord être réenregistré en .xlsx."}
          </Help>
        </span>
        <input
          className="fl-input"
          type="file"
          accept={type === "facture" ? "application/pdf,image/jpeg,image/png,image/webp" : "application/pdf,image/jpeg,image/png,image/webp,.xlsx,.csv,.txt,.tsv"}
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
        />
      </label>
      {etat && !estTableur && (
        <p className="ia-etat" data-ok={iaPrete}>
          {iaPrete
            ? etat.mode === "plateforme" && etat.quota
              ? `IA de RecipeLog : ${Math.max(0, etat.quota.limite - etat.quota.utilise)} lecture(s) restante(s) ce mois-ci.`
              : "IA prête (ta propre clé)."
            : etat.message}
          <Help title="D'où vient l'IA ?">
            Soit l'IA fournie avec ton offre RecipeLog (un nombre de lectures par mois), soit ta propre clé Claude, ChatGPT ou Gemini (tu paies
            directement ton fournisseur d&apos;IA, sans limite). Un administrateur choisit dans Réglages → Lecture des factures par IA.
          </Help>
        </p>
      )}
      {erreur && <span className="ing-fact-msg" data-err="true">{erreur}</span>}
      <button type="button" className="fl-btn fl-btn-primary" disabled={bloque} onClick={onLire}>
        {occupe ? <Loader2 size={15} className="ia-tourne" /> : estTableur ? <FileUp size={15} /> : <Sparkles size={15} />}
        {estTableur ? "Lire le tableau" : "Lire avec l'IA"}
      </button>
    </div>
  );
}

function Lecture({ debut, attente }: { debut: number; attente?: boolean }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS(Math.round((Date.now() - debut) / 1000)), 1000);
    return () => clearInterval(t);
  }, [debut]);
  return (
    <div className="ia-lecture">
      <Loader2 size={30} className="ia-tourne" />
      <strong>L&apos;IA lit le document…</strong>
      <span className="sub">
        {s} s. Compte 20 secondes à 2 minutes selon le nombre de lignes.{" "}
        {attente
          ? "Tu peux fermer cette fenêtre : la lecture sera perdue, mais la facture reste dans « À traiter »."
          : "Tu peux fermer cette fenêtre : la lecture sera perdue, mais rien n'est enregistré."}
      </span>
    </div>
  );
}

/** Facture à traiter dont la lecture n'a pas marché (ou après « Recommencer ») : on peut relancer. */
function AttenteRelancer({ etat, erreur, occupe, onLire, onClose }: { etat: EtatIA | null; erreur: string | null; occupe: boolean; onLire: () => void; onClose: () => void }) {
  const iaPrete = etat?.prete ?? false;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {erreur ? <span className="ing-fact-msg" data-err="true">{erreur}</span> : occupe ? <Loader2 size={20} className="ia-tourne" /> : null}
      <p className="sub" style={{ margin: 0 }}>
        La facture reste dans « À traiter » : rien n&apos;est perdu. Tu peux relancer la lecture, ou la laisser pour la faire remplir plus tard par
        Claude.
      </p>
      {etat && !iaPrete && <p className="ia-etat" data-ok="false">{etat.message}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose}>Laisser à traiter</button>
        <button type="button" className="fl-btn fl-btn-primary" disabled={occupe || !iaPrete} onClick={onLire}>
          {occupe ? <Loader2 size={15} className="ia-tourne" /> : <Sparkles size={15} />}
          Relancer la lecture
        </button>
      </div>
    </div>
  );
}

/** Liens vers les pages de la facture à traiter, pour comparer pendant la vérification. */
function PagesFacture({ facture }: { facture: FactureATraiter }) {
  return (
    <p className="sub" style={{ margin: "0 0 10px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      Comparer avec {facture.pdf ? "le PDF" : facture.pages > 1 ? "les photos" : "la photo"} :
      {Array.from({ length: facture.pages }, (_, i) => (
        <a key={i} className="fl-btn fl-btn-ghost" href={`/api/factures/a-traiter/${facture.id}/${i + 1}`} target="_blank" rel="noreferrer">
          {facture.pdf ? "Ouvrir le PDF" : `Page ${i + 1}`}
        </a>
      ))}
    </p>
  );
}

// ─────────────────────────────────────────────
// 2 bis. Colonnes d'un tableau Excel / CSV
// ─────────────────────────────────────────────

function ChoixColonnes({
  lignes, entete: entete0, colonnes: colonnes0, onRetour, onSuite,
}: { lignes: string[][]; entete: number; colonnes: Colonnes; onRetour: () => void; onSuite: (l: LigneLue[]) => void }) {
  const [entete, setEntete] = useState(entete0);
  const [col, setCol] = useState<Colonnes>(colonnes0);
  const [unite, setUnite] = useState<PriceUnit>("kg");
  const largeur = Math.max(...lignes.slice(0, 50).map((l) => l.length));
  const titres = Array.from({ length: largeur }, (_, i) => lignes[entete]?.[i] || `Colonne ${i + 1}`);
  const resultat = useMemo(() => lignesDepuisTableau(lignes, entete, col, unite), [lignes, entete, col, unite]);
  const regler = (r: Role, v: string) => setCol((c) => ({ ...c, [r]: v === "" ? undefined : Number(v) }));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="sub" style={{ margin: 0 }}>
        Dis au site quelle colonne contient quoi. Il a deviné d&apos;après les titres : vérifie, puis continue.
      </p>
      <div className="ia-colonnes">
        <label>
          <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Ligne des titres
            <Help title="Ligne des titres">La ligne du tableau qui contient les noms des colonnes (« Désignation », « Prix HT »…). Les lignes au-dessus sont ignorées.</Help>
          </span>
          <select className="fl-input" value={entete} onChange={(e) => setEntete(Number(e.target.value))}>
            {lignes.slice(0, 30).map((l, i) => (
              <option key={i} value={i}>
                Ligne {i + 1} : {l.filter(Boolean).slice(0, 3).join(" · ").slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
        {ROLES.map((r) => (
          <label key={r}>
            <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {NOMS_ROLES[r]}
              <Help title={NOMS_ROLES[r]}>{AIDE_ROLES[r]}</Help>
            </span>
            <select className="fl-input" value={col[r] ?? ""} onChange={(e) => regler(r, e.target.value)}>
              <option value="">{r === "produit" ? "Choisir…" : "Aucune"}</option>
              {titres.map((t, i) => (
                <option key={i} value={i}>{t.slice(0, 50)}</option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Unité si rien n&apos;est écrit
            <Help title="Unité par défaut">Quand le tableau n&apos;a pas de colonne Unité et que la contenance ne dit pas « kg », « L » ou « x 50 », les prix sont compris dans cette unité.</Help>
          </span>
          <select className="fl-input" value={unite} onChange={(e) => setUnite(e.target.value as PriceUnit)}>
            {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      <div className="ia-apercu fl-scroll">
        <table>
          <thead>
            <tr>{titres.map((t, i) => <th key={i}>{t}</th>)}</tr>
          </thead>
          <tbody>
            {lignes.slice(entete + 1, entete + 6).map((l, i) => (
              <tr key={i}>{titres.map((_, j) => <td key={j}>{l[j] ?? ""}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ margin: 0 }}>
        {resultat.length} produit{resultat.length > 1 ? "s" : ""} avec un prix sur {Math.max(0, lignes.length - entete - 1)} ligne(s).
        {col.produit == null ? " Choisis la colonne Produit." : col.prix == null && col.prixColis == null ? " Choisis une colonne de prix." : ""}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={onRetour}>Autre fichier</button>
        <button type="button" className="fl-btn fl-btn-primary" disabled={!resultat.length} onClick={() => onSuite(resultat)}>
          Vérifier les {resultat.length} prix
        </button>
      </div>
    </div>
  );
}

const AIDE_ROLES: Record<Role, string> = {
  produit: "Le nom du produit tel que le fournisseur l'écrit (« Chocolat Guanaja 70 % 3 kg »). Obligatoire.",
  reference: "Le code article du fournisseur. Il sert à reconnaître le même produit d'une fois sur l'autre, même si son nom change un peu.",
  prix: "Le prix HT ramené au kg, au litre ou à la pièce. Si le tableau ne donne que le prix du colis, choisis plutôt « Prix du colis ».",
  prixColis: "Le prix HT d'un colis (sac, carton, bidon). Le site le divise par la contenance pour trouver le prix au kg, au L ou à la pièce.",
  contenance: "Ce que contient un colis : « 25 kg », « 500 g », « 75 cl », « x 50 ». Le site comprend l'unité écrite.",
  unite: "L'unité du prix : kg, L ou pièce (« PCE », « U », « colis » comptent comme pièce).",
  famille: "Le rayon du fournisseur (Chocolat, Crèmerie…), pour ranger le tableau comparatif.",
};

// ─────────────────────────────────────────────
// 3. Vérifier
// ─────────────────────────────────────────────

function NumInput({ value, onChange, label, placeholder, negatif }: { value: number | null; onChange: (v: number | null) => void; label: string; placeholder?: string; negatif?: boolean }) {
  const [txt, setTxt] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => {
    const n = txt.trim() === "" ? null : Number(txt.replace(/\s/g, "").replace(",", "."));
    if (n !== value && !(n != null && Number.isNaN(n))) setTxt(value == null ? "" : String(value).replace(".", ","));
  }, [value]);
  const lu = Number(txt.replace(/\s/g, "").replace(",", "."));
  const bad = txt.trim() !== "" && !(negatif ? Number.isFinite(lu) : lu >= 0);
  return (
    <input
      className="fl-input"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      data-err={bad || undefined}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        const t = e.target.value.trim();
        const n = t === "" ? null : Number(t.replace(/\s/g, "").replace(",", "."));
        if (n === null || n >= 0 || (negatif && Number.isFinite(n))) onChange(n);
      }}
    />
  );
}

/** Une ligne à relire. memo : taper dans une ligne ne redessine pas les centaines d'autres. */
const LigneVerif = memo(function LigneVerif({
  l, connu, article, nouvelArticle, facture, onChange, onRetirer,
}: {
  l: LigneEcran; connu: Connu | undefined; article: string; nouvelArticle: boolean; facture: boolean;
  onChange: (uid: number, p: Partial<LigneEcran>) => void; onRetirer: (uid: number) => void;
}) {
  const uid = l.uid!;
  const ligne = (p: Partial<LigneEcran>) => onChange(uid, p);
  const pu = prixALUnite(l);
  const uniteChange = connu && connu.prix != null && connu.unite !== l.unite;
  const change = connu && connu.prix != null && pu != null && connu.unite === l.unite ? Math.round(((pu - connu.prix) / connu.prix) * 100) : null;
  return (
    <div className="ia-ligne" data-doute={!!l.aVerifier || (l.produit.trim() !== "" && pu == null) || undefined}>
      <div className="ia-ligne-haut">
        <input className="fl-input ia-produit" aria-label="Produit" value={l.produit} placeholder="Produit" onChange={(e) => ligne({ produit: e.target.value })} />
        <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label="Retirer la ligne" onClick={() => onRetirer(uid)}>
          <Trash2 size={15} />
        </button>
      </div>
      <div className="ia-ligne-champs">
        <label className="ia-champ-article">
          <span>Article</span>
          <input className="fl-input" aria-label="Article" list="ia-articles" value={article} placeholder="comme le produit" onChange={(e) => ligne({ article: e.target.value || null, articleChoisi: true })} />
        </label>
        <label><span>Réf.</span><input className="fl-input" aria-label="Référence" value={l.reference ?? ""} onChange={(e) => ligne({ reference: e.target.value || null })} /></label>
        {facture && <label><span>Quantité</span><NumInput label="Quantité" negatif value={l.quantite} onChange={(v) => ligne({ quantite: v })} /></label>}
        <label><span>Contenance</span><NumInput label="Contenance" value={l.contenance} placeholder="1" onChange={(v) => ligne({ contenance: v })} /></label>
        <label>
          <span>Unité</span>
          <select className="fl-input" aria-label="Unité" value={l.unite} onChange={(e) => ligne({ unite: e.target.value as PriceUnit })}>
            {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label><span>Prix colis</span><NumInput label="Prix du colis" value={l.prixColis} onChange={(v) => ligne({ prixColis: v })} /></label>
        <label><span>Prix /{l.unite}</span><NumInput label="Prix à l'unité" value={l.prixUnitaire} onChange={(v) => ligne({ prixUnitaire: v })} /></label>
        {facture && <label><span>Montant</span><NumInput label="Montant de la ligne" negatif value={l.montant} onChange={(v) => ligne({ montant: v })} /></label>}
      </div>
      <div className="ia-ligne-bas">
        <span className="ia-pu">{pu != null ? `= ${prixTxt(pu, l.unite)}` : "Prix manquant : la ligne sera ignorée"}</span>
        {!connu && l.produit.trim() && <span className="ia-badge">Nouveau</span>}
        {nouvelArticle && <span className="ia-badge" data-sens="hausse">Nouvel article</span>}
        {uniteChange && (
          <span className="ia-doute"><AlertTriangle size={13} /> Ce produit était suivi en « {connu!.unite} » : enregistrer change son unité, et le coût des recettes qui l&apos;utilisent.</span>
        )}
        {change != null && change !== 0 && (
          <span className="ia-badge" data-sens={change > 0 ? "hausse" : "baisse"}>
            {change > 0 ? "+" : ""}{change} % (avant {prixTxt(connu!.prix!, connu!.unite)})
          </span>
        )}
        {l.aVerifier && <span className="ia-doute"><AlertTriangle size={13} /> {l.aVerifier}</span>}
      </div>
    </div>
  );
});

function Verifier({
  type, initial, modele, secours, fournisseurFixe, fournisseurs, onRetour, onEnregistrer,
}: {
  type: TypeLecture; initial: DocumentLu; modele: string | null; secours: boolean; fournisseurFixe?: Fournisseur; fournisseurs: string[];
  onRetour: () => void; onEnregistrer: (doc: DocumentLu, remplacer: boolean, note: string, nouveauFournisseur: boolean) => Promise<string | null>;
}) {
  const [doc, setDoc] = useState<Omit<DocumentLu, "lignes"> & { lignes: LigneEcran[] }>(() => ({ ...initial, lignes: initial.lignes.map(avecUid) }));
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [cherche, setCherche] = useState("");
  const [limite, setLimite] = useState(PAR_PAGE);
  const [connus, setConnus] = useState<Connu[]>([]);
  const [articles, setArticles] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [remplacer, setRemplacer] = useState(false);
  const [nouveauFournisseur, setNouveauFournisseur] = useState(false);
  const [note, setNote] = useState(initial.remarque ?? "");
  const [occupe, setOccupe] = useState(false);
  const facture = type === "facture";

  useEffect(() => {
    const nom = doc.fournisseur ?? "";
    const t = setTimeout(() => produitsConnus(nom).then(setConnus).catch(() => setConnus([])), 400);
    return () => clearTimeout(t);
  }, [doc.fournisseur]);

  useEffect(() => {
    articlesConnus().then(setArticles).catch(() => setArticles([]));
  }, []);

  const clesArticles = useMemo(() => new Set(articles.map(articleKey)), [articles]);
  const parNom = useMemo(() => new Map(connus.map((c) => [cleProduit(c.nom), c])), [connus]);
  const parRef = useMemo(() => new Map(connus.filter((c) => c.reference).map((c) => [c.reference!.trim(), c])), [connus]);
  const trouver = (l: LigneLue) => (l.reference && parRef.get(l.reference.trim())) || parNom.get(cleProduit(l.produit));
  /**
   * L'article qui sera enregistré : celui que la personne a écrit ; sinon celui que le produit
   * a déjà dans RecipeLog (jamais remplacé par la proposition de l'IA) ; sinon la proposition.
   */
  const articleDe = (l: LigneEcran) => (l.articleChoisi ? l.article : (trouver(l)?.article ?? l.article));
  const ligne = useCallback(
    (uid: number, p: Partial<LigneEcran>) => setDoc((d) => ({ ...d, lignes: d.lignes.map((l) => (l.uid === uid ? { ...l, ...p } : l)) })),
    [],
  );
  const retirer = useCallback((uid: number) => setDoc((d) => ({ ...d, lignes: d.lignes.filter((l) => l.uid !== uid) })), []);

  // État de chaque ligne (pour les filtres et l'affichage), calculé une fois par rendu.
  const infos = doc.lignes.map((l) => {
    const connu = trouver(l);
    const pu = prixALUnite(l);
    const article = articleDe(l) ?? "";
    const uniteChange = !!(connu && connu.prix != null && connu.unite !== l.unite);
    const change = connu && connu.prix != null && pu != null && connu.unite === l.unite ? Math.round(((pu - connu.prix) / connu.prix) * 100) : null;
    const doute = !!l.aVerifier || (l.produit.trim() !== "" && pu == null) || uniteChange;
    return { l, connu, article, nouvelArticle: article.trim() !== "" && !clesArticles.has(articleKey(article)), doute, nouveau: !connu && l.produit.trim() !== "", change: change != null && change !== 0 };
  });
  const compte = { toutes: infos.length, doute: infos.filter((x) => x.doute).length, nouveau: infos.filter((x) => x.nouveau).length, change: infos.filter((x) => x.change).length };
  const cle = cherche.trim() ? articleKey(cherche) : "";
  const filtrees = infos.filter(
    (x) =>
      (filtre === "toutes" || x[filtre]) &&
      (!cle || articleKey(x.l.produit).includes(cle) || articleKey(x.article).includes(cle) || (x.l.reference ?? "").toLowerCase().includes(cherche.trim().toLowerCase())),
  );
  const visibles = filtrees.slice(0, limite);
  const somme = doc.lignes.reduce((s, l) => s + (montantLigne(l) ?? 0), 0);
  const ecart = facture && doc.total != null && somme > 0 && Math.abs(somme - doc.total) > Math.max(0.05, doc.total * 0.005);
  const sansPrix = doc.lignes.filter((l) => l.produit.trim() && prixALUnite(l) == null).length;
  const doute = erreur?.includes("déjà enregistrée");
  const ressemble = erreur?.includes("ressemble à");

  async function enregistrer() {
    setErreur(null);
    setOccupe(true);
    const lignes = doc.lignes.filter((l) => l.produit.trim()).map(({ uid: _uid, ...l }) => ({ ...l, article: articleDe(l)?.trim() || null }));
    const e = await onEnregistrer({ ...doc, lignes }, remplacer, note, nouveauFournisseur);
    setOccupe(false);
    if (e) setErreur(e);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="sub" style={{ margin: 0 }}>
        {modele ? "Relis chaque ligne et corrige ce qui ne va pas : l'IA peut se tromper. " : "Relis les prix avant de les enregistrer. "}
        Rien n&apos;est enregistré avant le bouton en bas.
        {modele && <span className="ia-modele"> Lu par {modele}{secours ? " (modèle de secours)" : ""}.</span>}
      </p>
      {doc.remarque && modele && (
        <p className="ia-alerte"><AlertTriangle size={15} /> {doc.remarque}</p>
      )}
      <div className="ia-entete">
        <label>
          <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Fournisseur
            <Help title="Fournisseur">Le nom écrit en haut de la facture. S&apos;il existe déjà dans RecipeLog (même nom), la facture lui est ajoutée ; sinon il est créé.</Help>
          </span>
          <input
            className="fl-input"
            list="ia-fournisseurs"
            value={doc.fournisseur ?? ""}
            disabled={!!fournisseurFixe}
            onChange={(e) => setDoc({ ...doc, fournisseur: e.target.value })}
          />
          <datalist id="ia-fournisseurs">
            {fournisseurs.map((f) => <option key={f} value={f} />)}
          </datalist>
        </label>
        <label>
          <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {facture ? "Date de la facture" : "Date des prix"}
            <Help title={facture ? "Date de la facture" : "Date des prix"}>
              {facture ? "Tous les prix de cette facture sont rangés à cette date dans l'historique." : "La date à partir de laquelle ces prix valent. Ils sont rangés à cette date dans l'historique de chaque produit."}
            </Help>
          </span>
          <input className="fl-input" type="date" value={doc.date ?? ""} onChange={(e) => setDoc({ ...doc, date: e.target.value || null })} />
        </label>
        {facture && (
          <>
            <label>
              <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                Numéro
                <Help title="Numéro de facture">Le numéro écrit sur la facture. Il évite d&apos;enregistrer deux fois la même facture.</Help>
              </span>
              <input className="fl-input" value={doc.numero ?? ""} onChange={(e) => setDoc({ ...doc, numero: e.target.value || null })} />
            </label>
            <label>
              <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                Total HT (€)
                <Help title="Total HT">Le total hors taxe écrit sur la facture. Le site le compare à la somme des lignes pour repérer un oubli.</Help>
              </span>
              <NumInput label="Total HT" negatif value={doc.total} onChange={(v) => setDoc({ ...doc, total: v })} />
            </label>
          </>
        )}
      </div>

      {ecart && (
        <p className="ia-alerte">
          <AlertTriangle size={15} /> Les lignes font {euro(somme)} HT, la facture dit {euro(doc.total!)}. Vérifie qu&apos;il ne manque pas une ligne (frais, remise, page 2…).
        </p>
      )}

      <div className="ia-lignes-titre">
        <strong>{doc.lignes.length} ligne{doc.lignes.length > 1 ? "s" : ""}</strong>
        <Help title="Lire une ligne" example="« Sac farine T45 25 kg » à 23 € : contenance 25, unité kg, prix du colis 23 → 0,92 €/kg.">
          Pour chaque produit, donne le prix au kg / L / pièce, ou le prix du colis avec sa contenance (25 pour un sac de 25 kg, 50 pour un carton
          de 50). Le prix ramené à l&apos;unité s&apos;affiche à droite. « Nouveau » : produit jamais acheté chez ce fournisseur. Une ligne en
          orange est un doute de l&apos;IA à vérifier.
        </Help>
        <Help title="Article" example="« Fraise France cat. I » et « Fraise Espagne » ont le même article : « Fraise ».">
          L&apos;article est le nom commun qui regroupe les produits semblables, pour suivre un seul prix et comparer les fournisseurs. Choisis
          un article déjà dans la liste quand c&apos;est le même produit. « Nouvel article » prévient que ce nom n&apos;existe pas encore : vérifie
          que ce n&apos;est pas un presque-doublon (« Fraises » au lieu de « Fraise »). L&apos;article d&apos;un produit déjà connu n&apos;est jamais
          changé tout seul. Vide : le produit reste seul sous son propre nom.
        </Help>
      </div>
      <datalist id="ia-articles">
        {articles.map((a) => <option key={a} value={a} />)}
      </datalist>
      {(infos.length > 20 || compte.doute > 0) && (
        <div className="ia-filtres">
          <div className="ia-filtres-boutons" role="group" aria-label="Lignes à afficher">
            {(
              [
                ["toutes", "Toutes"],
                ["doute", "À vérifier"],
                ["nouveau", "Nouveaux"],
                ["change", "Prix changés"],
              ] as const
            ).map(([f, nom]) =>
              f === "toutes" || compte[f] > 0 ? (
                <button
                  key={f}
                  type="button"
                  className="fl-btn fl-btn-ghost ia-filtre"
                  aria-pressed={filtre === f}
                  onClick={() => {
                    setFiltre(f);
                    setLimite(PAR_PAGE);
                  }}
                >
                  {nom} <b>{compte[f]}</b>
                </button>
              ) : null,
            )}
            <Help title="Trier les lignes">
              Pour relire une longue mercuriale sans rien oublier : « À vérifier » montre les lignes où l&apos;IA a un doute, où le prix manque ou
              où l&apos;unité change ; « Nouveaux » les produits jamais achetés chez ce fournisseur ; « Prix changés » ceux dont le prix a bougé. Le
              filtre ne retire rien : toutes les lignes sont enregistrées.
            </Help>
          </div>
          {infos.length > 20 && (
            <div className="ia-cherche">
              <Search size={15} aria-hidden />
              <input
                className="fl-input"
                aria-label="Chercher une ligne"
                placeholder="Chercher un produit, un article, une réf."
                value={cherche}
                onChange={(e) => {
                  setCherche(e.target.value);
                  setLimite(PAR_PAGE);
                }}
              />
              <Help title="Chercher une ligne">Tape une partie du nom du produit, de l&apos;article ou de la référence : seules les lignes qui correspondent restent affichées.</Help>
            </div>
          )}
        </div>
      )}
      <div className="ia-lignes">
        {visibles.map((x) => (
          <LigneVerif
            key={x.l.uid}
            l={x.l}
            connu={x.connu}
            article={x.article}
            nouvelArticle={x.nouvelArticle}
            facture={facture}
            onChange={ligne}
            onRetirer={retirer}
          />
        ))}
        {filtrees.length === 0 && <p className="sub" style={{ margin: 0 }}>Aucune ligne ne correspond.</p>}
      </div>
      {filtrees.length > visibles.length && (
        <button type="button" className="fl-btn fl-btn-secondary" style={{ justifySelf: "start" }} onClick={() => setLimite((n) => n + PAR_PAGE)}>
          Afficher {Math.min(PAR_PAGE, filtrees.length - visibles.length)} lignes de plus ({filtrees.length - visibles.length} restantes)
        </button>
      )}
      <button type="button" className="fl-btn fl-btn-ghost" style={{ justifySelf: "start" }} onClick={() => setDoc((d) => ({ ...d, lignes: [...d.lignes, avecUid(ligneVide())] }))}>
        <Plus size={15} /> Ajouter une ligne
      </button>

      {facture && (
        <label style={{ display: "grid", gap: 4 }}>
          <span className="fl-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Remarque
            <Help title="Remarque">Ce que tu veux retenir sur cette facture. L&apos;IA y met ce qui l&apos;a gênée (page illisible, frais de port…).</Help>
          </span>
          <textarea className="fl-input" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {sansPrix > 0 && <span className="ing-fact-msg">{sansPrix} ligne(s) sans prix seront ignorées.</span>}
      {erreur && <span className="ing-fact-msg" data-err="true">{erreur}</span>}
      {(ressemble || nouveauFournisseur) && (
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={nouveauFournisseur} onChange={(e) => setNouveauFournisseur(e.target.checked)} />
          C&apos;est bien un nouveau fournisseur : le créer
        </label>
      )}
      {doute && (
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} />
          Remplacer la facture déjà enregistrée par celle-ci
        </label>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={onRetour} disabled={occupe}>Recommencer</button>
        <button type="button" className="fl-btn fl-btn-primary" onClick={enregistrer} disabled={occupe || !doc.lignes.length}>
          {occupe && <Loader2 size={15} className="ia-tourne" />}
          {facture ? "Enregistrer la facture" : "Enregistrer les prix"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 4. Fini
// ─────────────────────────────────────────────

function Fini({ type, resume, fichierJoint, onClose }: { type: TypeLecture; resume: PurchaseOrderSummary; fichierJoint: boolean | null; onClose: () => void }) {
  const r = resume as PurchaseOrderSummary & { a_verifier?: string[] };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0 }}>
        <strong>
          {type === "facture" ? `Facture enregistrée chez ${r.fournisseur}` : `Prix enregistrés chez ${r.fournisseur}`} : {r.lignes} ligne{r.lignes > 1 ? "s" : ""}
          {r.total != null && type === "facture" ? `, ${euro(r.total)} HT` : ""}.
        </strong>
        {fichierJoint === true && " Le fichier est joint à la facture."}
        {fichierJoint === false && " Le fichier n'a pas pu être joint : ajoute-le depuis la facture."}
      </p>
      {r.nouveaux_produits.length > 0 && <p className="sub" style={{ margin: 0 }}>Nouveaux produits : {r.nouveaux_produits.join(", ")}.</p>}
      {r.prix_changes.length > 0 && (
        <div className="fl-card" style={{ padding: 10 }}>
          <strong>Prix qui ont changé</strong>
          {r.prix_changes.map((c) => (
            <div key={c.produit} className="sub">{c.produit} : {c.avant} → {c.apres} ({c.evolution})</div>
          ))}
        </div>
      )}
      {r.ingredients_mis_a_jour.length > 0 && (
        <p className="sub" style={{ margin: 0 }}>
          Ingrédients des recettes mis à jour : {r.ingredients_mis_a_jour.map((x) => `${x.ingredient} (${x.prix})`).join(", ")}.
        </p>
      )}
      {(r.a_verifier?.length ?? 0) > 0 && (
        <div className="ia-alerte" style={{ display: "block" }}>
          <strong>À vérifier :</strong>
          {r.a_verifier!.map((a) => <div key={a}>{a}</div>)}
        </div>
      )}
      {(r.lignes_ignorees?.length ?? 0) > 0 && <p className="sub" style={{ margin: 0 }}>Lignes ignorées : {r.lignes_ignorees!.join(" ; ")}.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {type === "facture" && <Link className="fl-btn fl-btn-primary" href={`/factures/${r.facture_id}`}>Voir la facture</Link>}
        <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

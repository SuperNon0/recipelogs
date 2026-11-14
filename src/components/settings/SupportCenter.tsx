"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Help } from "@/components/ui/Help";
import { envoyerDemande, repondreDemande, voirDemande } from "@/app/actions/support";
import type { Demande } from "@/lib/auth/passerelle";

const TYPES: Record<string, string> = { bug: "Problème", question: "Question", idee: "Idée" };
const STATUTS: Record<string, string> = { ouvert: "Envoyée", repondu: "Réponse reçue", ferme: "Réglée" };

const quand = (iso: string) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

/** « Signaler un problème » : formulaire + les demandes déjà envoyées par ce compte, avec les réponses. */
export function SupportCenter({ demandes, erreur, email, page }: { demandes: Demande[]; erreur: string | null; email: string; page: string }) {
  const router = useRouter();
  const [type, setType] = useState("bug");
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Réponses du support affichées : on les marque comme vues (une fois).
  useEffect(() => {
    for (const d of demandes) if (!d.luClient) void voirDemande(d.id);
  }, [demandes]);

  function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const r = await envoyerDemande({
        type,
        message,
        page: page || undefined,
        navigateur: navigator.userAgent,
        ecran: `${window.screen.width}×${window.screen.height} (fenêtre ${window.innerWidth}×${window.innerHeight})`,
      });
      if (r.ok) {
        setMessage("");
        setMsg({ ok: true, texte: "Merci, c'est envoyé. Tu recevras la réponse par e-mail et ici." });
        router.refresh();
      } else setMsg({ ok: false, texte: r.error });
    });
  }

  return (
    <>
      <form className="acct-card sup-form" onSubmit={envoyer}>
        <label>
          <span className="sup-lbl">
            C'est…
            <Help title="Type de demande">
              Problème : quelque chose ne marche pas comme prévu. Question : tu ne trouves pas comment faire. Idée : une amélioration que tu
              aimerais voir dans RecipeLog.
            </Help>
          </span>
          <select className="fl-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="bug">Un problème</option>
            <option value="question">Une question</option>
            <option value="idee">Une idée</option>
          </select>
        </label>
        <label>
          <span className="sup-lbl">
            Ton message
            <Help
              title="Ton message"
              example="« Sur la fiche Paris-Brest, le coût de revient affiche 0 € alors que tous les prix sont remplis. »"
            >
              Dis ce que tu faisais, ce qui s'est passé et ce que tu attendais. On joint tout seul la page d'où tu viens, ton navigateur, la taille
              de ton écran, la version de RecipeLog et ton rôle : pas besoin de les écrire.
            </Help>
          </span>
          <textarea className="fl-input" rows={5} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} required />
        </label>
        <p className="set-note">
          Envoyé de la part de <b>{email}</b>
          {page ? (
            <>
              {" "}
              · depuis la page <code>{page}</code>
            </>
          ) : null}
        </p>
        {msg && <p className={`acct-msg ${msg.ok ? "ok" : "err"}`}>{msg.texte}</p>}
        <div>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={pending || message.trim().length < 3}>
            <Send size={15} /> {pending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </form>

      <div className="sect-title">
        <h2>Mes demandes</h2>
      </div>
      {erreur ? (
        <p className="acct-msg err">{erreur}</p>
      ) : demandes.length === 0 ? (
        <p className="set-note">Tu n'as encore rien envoyé.</p>
      ) : (
        <div className="sup-list">
          {demandes.map((d) => (
            <DemandeCarte key={d.id} d={d} />
          ))}
        </div>
      )}
    </>
  );
}

function DemandeCarte({ d }: { d: Demande }) {
  const router = useRouter();
  const [reponse, setReponse] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await repondreDemande(d.id, reponse);
      if (r.ok) {
        setReponse("");
        setOuvert(false);
        router.refresh();
      } else setErr(r.error);
    });
  }

  return (
    <article className={`acct-card sup-item${d.luClient ? "" : " sup-new"}`}>
      <div className="sup-head">
        <b>{TYPES[d.type] ?? d.type}</b>
        <span className={`sup-pill sup-${d.statut}`}>{d.luClient ? STATUTS[d.statut] : "Nouvelle réponse"}</span>
        <small>{quand(d.date)}</small>
      </div>
      <div className="sup-thread">
        {d.messages.map((m, i) => (
          <div key={i} className={`sup-msg${m.de === "support" ? " sup-them" : ""}`}>
            <small>
              {m.de === "support" ? "Équipe RecipeLog" : "Toi"} · {quand(m.date)}
            </small>
            <p>{m.texte}</p>
          </div>
        ))}
      </div>
      {ouvert ? (
        <form onSubmit={envoyer} className="sup-reply">
          <textarea className="fl-input" rows={3} maxLength={5000} value={reponse} onChange={(e) => setReponse(e.target.value)} autoFocus />
          {err && <p className="acct-msg err">{err}</p>}
          <div className="acct-actions">
            <button type="submit" className="fl-btn fl-btn-primary" disabled={pending || !reponse.trim()}>
              {pending ? "Envoi…" : "Envoyer"}
            </button>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setOuvert(true)}>
            {d.statut === "ferme" ? "Ce n'est pas réglé : répondre" : "Ajouter un message"}
          </button>
        </div>
      )}
    </article>
  );
}

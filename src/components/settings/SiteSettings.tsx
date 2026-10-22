"use client";

import { useState, useTransition } from "react";
import { Check, ChevronRight, Link2, RefreshCw, Sparkles, Wrench } from "lucide-react";
import { saveSiteUrl } from "@/app/actions/settings";
import { CHANGELOG } from "@/lib/changelog";
import { getMergedPrs } from "@/lib/pr-log";
import { DeployButton } from "@/components/DeployButton";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";

/** Section « Site » des réglages : lien du logo, mise à jour, version. */
export function SiteSettings({ siteUrl }: { siteUrl: string | null }) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const current = CHANGELOG[0];

  return (
    <>
      <div className="fl-list">
        <div className="fl-row">
          <span className="ic">
            <Link2 size={17} />
          </span>
          <span className="set-tx">
            <b>
              <span>Lien du logo</span>
              <Help title="Lien du logo">
                Sur l&apos;accueil, un clic sur le logo RecipeLog ouvre cette adresse dans un nouvel
                onglet (ton site, ton blog…). Ailleurs dans l&apos;application, le logo ramène
                toujours à l&apos;accueil. Laisse vide pour désactiver.
              </Help>
            </b>
            <small>{siteUrl ?? "Aucun lien · le logo ramène à l'accueil"}</small>
          </span>
          <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setEditingUrl(true)}>
            Modifier
          </button>
        </div>

        <div className="fl-row">
          <span className="ic">
            <RefreshCw size={17} />
          </span>
          <span className="set-tx">
            <b>
              <span>Mise à jour du site</span>
              <Help title="Mise à jour du site">
                Récupère la dernière version de RecipeLog sur GitHub, la prépare sur le serveur puis
                redémarre le site. Compte quelques minutes ; le site reste utilisable pendant la
                préparation, puis est coupé une dizaine de secondes au redémarrage. En cas de
                problème, l&apos;ancienne version est conservée.
              </Help>
            </b>
            <small>Installe les dernières évolutions</small>
          </span>
          <DeployButton />
        </div>

        <button type="button" className="fl-row set-row" onClick={() => setShowLog(true)}>
          <span className="ic">
            <Sparkles size={17} />
          </span>
          <span className="set-tx">
            <b>
              <span>Version et nouveautés</span>
            </b>
            <small>{current ? current.title : "Journal des versions"}</small>
          </span>
          {current && <span className="fl-kbd">{current.version}</span>}
          <ChevronRight size={16} className="set-chev" />
        </button>
      </div>

      {editingUrl && <SiteUrlModal initial={siteUrl} onClose={() => setEditingUrl(false)} />}
      {showLog && <ChangelogModal onClose={() => setShowLog(false)} />}
    </>
  );
}

function SiteUrlModal({ initial, onClose }: { initial: string | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <ModalOverlay title="Lien du logo" onClose={onClose}>
      <form
        action={(fd) =>
          startTransition(async () => {
            await saveSiteUrl(fd);
            onClose();
          })
        }
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Adresse ouverte depuis l&apos;accueil</span>
          <input
            name="siteUrl"
            type="url"
            defaultValue={initial ?? ""}
            placeholder="https://mon-site.com"
            className="fl-input"
            autoFocus
          />
        </label>
        <p className="set-note">Laisse vide pour que le logo ramène simplement à l&apos;accueil.</p>
        <div className="set-foot">
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose} disabled={pending}>
            Annuler
          </button>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

function ChangelogModal({ onClose }: { onClose: () => void }) {
  const prs = getMergedPrs();
  return (
    <ModalOverlay title="Nouveautés" onClose={onClose}>
      <div className="set-log">
        {prs.length > 0 && (
          <section>
            <h4>
              <span className="fl-tag" style={{ color: "var(--accent)" }}>
                PR
              </span>
              Dernières mises à jour installées
            </h4>
            <ul>
              {prs.map((pr) => (
                <li key={pr.number}>
                  <span className="fl-kbd" style={{ flex: "none" }}>#{pr.number}</span>
                  {pr.title}
                  <small style={{ marginLeft: "auto", flex: "none", color: "var(--muted)" }}>
                    {formatDate(pr.date)}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}
        {CHANGELOG.map((v) => (
          <section key={v.version}>
            <h4>
              <span className="fl-tag" style={{ color: "var(--accent)" }}>
                {v.version}
              </span>
              {v.title}
              <small>{formatDate(v.date)}</small>
            </h4>
            {!!(v.features?.length || v.fixes?.length) && (
              <ul>
                {v.features?.map((f, i) => (
                  <li key={`f${i}`}>
                    <Check size={14} style={{ color: "var(--accent-2)" }} aria-label="Nouveauté" />
                    {f}
                  </li>
                ))}
                {v.fixes?.map((f, i) => (
                  <li key={`c${i}`}>
                    <Wrench size={14} style={{ color: "var(--muted)" }} aria-label="Correction" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </ModalOverlay>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

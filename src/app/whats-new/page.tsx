import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CHANGELOG } from "@/lib/changelog";

export const dynamic = "force-dynamic";

type MigrationDesc = {
  name: string;
  appliedAt: string | null;
  description: { version?: string; title?: string; changes?: string[] } | null;
};

type DeployReport = {
  deployedAt: string;
  gitCommit: string;
  gitMessage: string;
  gitAuthor: string;
  migrations: MigrationDesc[];
  stats: { recipeCount: number; ingredientCount: number; folderCount: number };
};

export default async function WhatsNewPage() {
  const setting = await prisma.setting.findUnique({ where: { key: "deploy_report" } });
  const report = setting?.value as DeployReport | null;

  const deployDate = report?.deployedAt
    ? new Date(report.deployedAt).toLocaleString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="fl-label hover:text-[color:var(--text)]">
          ← Paramètres
        </Link>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-2">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Nouveautés & mises à jour
        </h1>
        {deployDate && (
          <span className="fl-label" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            Dernière mise à jour : {deployDate}
          </span>
        )}
      </div>

      {/* ── Dernier déploiement ─────────────────────────────────────────── */}
      {report && (
        <section
          className="fl-card flex flex-col gap-4"
          style={{ background: "rgba(100,200,100,0.04)", borderColor: "rgba(100,200,100,0.25)" }}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="fl-title-serif" style={{ fontSize: "1.1rem", color: "var(--accent-2)" }}>
                ✅ Dernier déploiement
              </h2>
              <p className="fl-label mt-1" style={{ fontSize: "0.82rem" }}>
                {deployDate}
                {report.gitCommit && (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}· commit <code style={{ fontSize: "0.78rem" }}>{report.gitCommit}</code>
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-4">
              <Stat label="Recettes" value={report.stats.recipeCount} />
              <Stat label="Dossiers" value={report.stats.folderCount} />
            </div>
          </div>

          {report.gitMessage && (
            <p style={{ fontSize: "0.88rem", fontStyle: "italic", color: "var(--muted)" }}>
              « {report.gitMessage} »
            </p>
          )}

          {report.migrations.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="fl-label" style={{ fontSize: "0.82rem" }}>
                {report.migrations.length} migration{report.migrations.length > 1 ? "s" : ""} appliquée{report.migrations.length > 1 ? "s" : ""} :
              </p>
              {report.migrations.map((m) => (
                <div
                  key={m.name}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "0.7rem 1rem",
                  }}
                >
                  {m.description ? (
                    <>
                      <p style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 6 }}>
                        {m.description.version && (
                          <span style={{ color: "var(--accent)", marginRight: 6 }}>
                            {m.description.version}
                          </span>
                        )}
                        {m.description.title}
                      </p>
                      {m.description.changes && m.description.changes.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {m.description.changes.map((c, i) => (
                            <li key={i} style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                              · {c}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p style={{ fontSize: "0.82rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      {m.name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {report.migrations.length === 0 && (
            <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Aucune migration de base de données lors de cette mise à jour.
            </p>
          )}
        </section>
      )}

      {!report && (
        <section className="fl-card">
          <p className="fl-label" style={{ color: "var(--muted)" }}>
            Aucun déploiement enregistré. Le rapport est généré automatiquement lors de la prochaine mise à jour via le bouton « Mettre à jour le site ».
          </p>
        </section>
      )}

      {/* ── Changelog complet ───────────────────────────────────────────── */}
      <h2 className="fl-title-serif" style={{ fontSize: "1.2rem", marginTop: "0.5rem" }}>
        Historique des versions
      </h2>

      {CHANGELOG.map((entry) => (
        <section key={entry.version} className="fl-card flex flex-col gap-3">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div className="flex items-baseline gap-3">
              <span
                className="fl-tag"
                style={{ background: "rgba(232,197,71,0.12)", color: "var(--accent)", borderColor: "rgba(232,197,71,0.3)", fontSize: "0.8rem" }}
              >
                {entry.version}
              </span>
              <h3 className="fl-title-serif" style={{ fontSize: "1rem" }}>
                {entry.title}
              </h3>
            </div>
            <span className="fl-label" style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              {new Date(entry.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          </div>

          {entry.features && entry.features.length > 0 && (
            <div>
              <p className="fl-label" style={{ fontSize: "0.78rem", marginBottom: 4 }}>Nouvelles fonctionnalités</p>
              <ul className="flex flex-col gap-1">
                {entry.features.map((f, i) => (
                  <li key={i} style={{ fontSize: "0.85rem", color: "var(--text)" }}>
                    ✦ {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.fixes && entry.fixes.length > 0 && (
            <div>
              <p className="fl-label" style={{ fontSize: "0.78rem", marginBottom: 4 }}>Corrections</p>
              <ul className="flex flex-col gap-1">
                {entry.fixes.map((f, i) => (
                  <li key={i} style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    🔧 {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.migrations && entry.migrations.length > 0 && (
            <div>
              <p className="fl-label" style={{ fontSize: "0.78rem", marginBottom: 4 }}>Modifications base de données</p>
              <ul className="flex flex-col gap-1">
                {entry.migrations.map((m, i) => (
                  <li key={i} style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                    🗄 {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="fl-value-serif" style={{ fontSize: "1.5rem", lineHeight: 1 }}>{value}</div>
      <div className="fl-label" style={{ fontSize: "0.72rem" }}>{label}</div>
    </div>
  );
}

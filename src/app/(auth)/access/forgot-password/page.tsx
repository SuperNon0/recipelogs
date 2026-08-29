import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="fl-card flex flex-col gap-4">
      <h1 className="fl-title-serif" style={{ fontSize: "1.5rem" }}>
        Mot de passe oublié
      </h1>
      <p className="fl-label" style={{ color: "var(--text)" }}>
        Pour réinitialiser le mot de passe administrateur, connecte-toi
        au serveur en SSH et lance la commande suivante :
      </p>
      <pre
        className="text-xs p-3 rounded"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          overflow: "auto",
          fontFamily: "var(--font-mono)",
        }}
      >
        {"sudo -u recipelog bash -c \"cd /opt/recipelog && pnpm exec tsx scripts/reset-admin.ts\""}
      </pre>
      <p className="fl-label" style={{ color: "var(--muted)" }}>
        Le script te demandera un nouveau mot de passe et mettra le
        compte administrateur à jour.
      </p>
      <Link href="/login" className="fl-btn fl-btn-secondary text-center">
        ← Retour au login
      </Link>
    </div>
  );
}

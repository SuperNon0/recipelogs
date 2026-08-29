import { LogoutButton } from "@/components/LogoutButton";
import { getCurrentAccountInfo } from "@/app/actions/accounts";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super-administrateur",
  member: "Membre",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export async function CurrentAccountCard() {
  const info = await getCurrentAccountInfo();
  if (!info) return null;
  return (
    <section className="fl-card flex flex-col gap-3">
      <div>
        <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
          Mon compte
        </h2>
        <p className="fl-label mt-1">
          {info.isBaseAdmin
            ? "Compte administrateur de base (accès local + email)."
            : "Compte authentifié via Cloudflare."}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className="fl-label">E-mail</span>
          <div style={{ color: "var(--text)" }}>{info.email ?? "—"}</div>
        </div>
        <div>
          <span className="fl-label">Rôle</span>
          <div style={{ color: "var(--text)" }}>
            {ROLE_LABEL[info.role] ?? info.role}
          </div>
        </div>
        <div>
          <span className="fl-label">Dernière connexion</span>
          <div style={{ color: "var(--text)" }}>{fmtDate(info.lastLoginAt)}</div>
        </div>
      </div>
      <div>
        <LogoutButton />
      </div>
    </section>
  );
}

import { Ban, ChefHat, Clock, ShieldAlert, UserPlus, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Viewer } from "@/lib/auth/viewer";
import { PERMISSIONS, type Access } from "@/lib/auth/permissions";
import { RefreshButton, RequestAccessButton } from "./AccessButtons";

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

/**
 * Pages d'accès (maquettes 2 à 5 de Site-base) : demande, attente, refus,
 * blocage, et accès direct sans Cloudflare. Affichée à la place du site.
 */
export function AccessGate({ viewer, need, logout }: { viewer: Viewer; need?: Access; logout?: boolean }) {
  if (viewer.kind === "anonymous") {
    return (
      <Card logout={logout} icon={ShieldAlert} tone="var(--danger)" title="Connexion impossible">
        <p className="access-text">
          RecipeLog n&apos;a pas pu vérifier qui tu es. Ouvre le site par son adresse habituelle,
          celle qui demande ton e-mail et un code.
        </p>
        <p className="access-note">{viewer.error}</p>
      </Card>
    );
  }
  if (viewer.kind === "unknown") {
    return (
      <Card logout={logout} icon={UserPlus} tone="var(--accent)" title="Bienvenue" email={viewer.email}>
        <p className="access-text">
          Ton adresse est reconnue, mais tu n&apos;as pas encore de compte sur RecipeLog.
        </p>
        <RequestAccessButton />
        <p className="access-note">Un administrateur devra valider ta demande.</p>
      </Card>
    );
  }
  if (viewer.kind === "account") {
    const { account } = viewer;
    if (account.status === "pending") {
      return (
        <Card logout={logout} icon={Clock} tone="var(--pending)" title="Demande en attente" email={account.email}>
          <p className="access-text">
            Ta demande a bien été envoyée. Un administrateur doit la valider : tu auras accès dès
            qu&apos;elle est approuvée.
          </p>
          <RefreshButton />
          <p className="access-note">Envoyée le {DATE.format(account.createdAt)}</p>
        </Card>
      );
    }
    if (account.status === "refused") {
      return (
        <Card logout={logout} icon={XCircle} tone="var(--danger)" title="Demande refusée" email={account.email}>
          <p className="access-text">Un administrateur a refusé ta demande d&apos;accès à RecipeLog.</p>
        </Card>
      );
    }
    if (account.status === "blocked") {
      return (
        <Card logout={logout} icon={Ban} tone="var(--accent-3)" title="Accès suspendu" email={account.email}>
          <p className="access-text">Ton accès à RecipeLog a été suspendu par un administrateur.</p>
        </Card>
      );
    }
    if (!account.role) {
      return (
        <Card logout={logout} icon={Clock} tone="var(--pending)" title="Compte sans rôle" email={account.email}>
          <p className="access-text">Ton compte n&apos;a pas encore de rôle. Un administrateur doit t&apos;en donner un.</p>
          <RefreshButton />
        </Card>
      );
    }
    // Compte actif, mais son rôle n'a pas la permission demandée par la page.
    const perm = PERMISSIONS.find((p) => p.key === need);
    return (
      <Card logout={logout} icon={ShieldAlert} tone="var(--pending)" title="Page non disponible" email={account.email}>
        <p className="access-text">
          Ton rôle ({account.role.name}) n&apos;a pas la permission
          {perm ? ` « ${perm.label} »` : ""} : cette page ne t&apos;est pas ouverte.
        </p>
        <a href="/" className="fl-btn fl-btn-secondary access-full">
          Retour aux recettes
        </a>
      </Card>
    );
  }
  return null;
}

function Card({
  icon: Icon,
  tone,
  title,
  email,
  logout,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  email?: string;
  /** Connexion par Authentik : lien « Se déconnecter » (changer de compte). */
  logout?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="access-page">
      <div className="access-card">
        <div className="access-logo">
          <span className="mk">
            <ChefHat size={18} />
          </span>
          RecipeLog
        </div>
        <div className="access-icon" style={{ color: tone }}>
          <Icon size={28} strokeWidth={1.6} />
        </div>
        <h1>{title}</h1>
        {email && <span className="mail-chip">{email}</span>}
        {children}
        {logout && (
          <a href="/auth/deconnexion" className="access-note" style={{ textDecoration: "underline" }}>
            Se déconnecter
          </a>
        )}
      </div>
    </div>
  );
}

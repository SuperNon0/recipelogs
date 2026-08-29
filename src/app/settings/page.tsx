import { listAllCategories, listAllFolders } from "@/lib/recipes";
import { CategoryManager } from "@/components/CategoryManager";
import { FolderManager } from "@/components/FolderManager";
import { RecipeKeeperImport } from "@/components/RecipeKeeperImport";
import { DeployButton } from "@/components/DeployButton";
import { RecipePdfSettingsForm } from "@/components/RecipePdfSettingsForm";
import { getRecipePdfSettings } from "@/app/actions/settings";

import { getCurrentAccount } from "@/lib/auth/session";
import { findBaseAdmin } from "@/lib/auth/account";
import { listAllAccounts } from "@/lib/auth/queries";
import { getCfConfig } from "@/lib/auth/cloudflare";
import { hasCapability } from "@/lib/auth/capabilities";

import { CurrentAccountCard } from "@/components/settings/CurrentAccountCard";
import { AccountsList } from "@/components/settings/AccountsList";
import { SuperAdminsSection } from "@/components/settings/SuperAdminsSection";
import { AdminPasswordForm } from "@/components/settings/AdminPasswordForm";
import { CfConfigForm } from "@/components/settings/CfConfigForm";
import { DiagnosticPanel } from "@/components/settings/DiagnosticPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [account, base, accounts, cfConfig, categories, folders, recipePdfSettings] =
    await Promise.all([
      getCurrentAccount(),
      findBaseAdmin(),
      listAllAccounts(),
      getCfConfig(),
      listAllCategories(),
      listAllFolders(),
      getRecipePdfSettings(),
    ]);

  const isSuperAdmin = account?.role === "super_admin";
  const isBaseAdmin = !!account && !!base && account.id === base.id;

  const canManageAccounts =
    !!account && hasCapability("account_management", account.role);
  const canChangeAdminPwd =
    isBaseAdmin && hasCapability("admin_password", account.role);
  const canUpdateSite =
    !!account && hasCapability("site_update", account.role);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
        Paramètres
      </h1>

      {/* Mon compte */}
      <CurrentAccountCard />

      {/* Comptes (super_admin + capability) */}
      {isSuperAdmin && canManageAccounts && (
        <section className="fl-card flex flex-col gap-4">
          <div>
            <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
              Comptes
            </h2>
            <p className="fl-label mt-1">
              Demandes en attente et membres actifs / bloqués.
            </p>
          </div>
          <AccountsList accounts={accounts} />
        </section>
      )}

      {/* Super-admins (base admin uniquement) */}
      {isBaseAdmin && (
        <section className="fl-card flex flex-col gap-4">
          <div>
            <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
              Super-administrateurs
            </h2>
            <p className="fl-label mt-1">
              Réservé au compte administrateur de base. Un super-admin « email »
              (venu via Cloudflare) ne peut ni créer, ni retirer d'autres super-admins.
            </p>
          </div>
          <SuperAdminsSection accounts={accounts} />
        </section>
      )}

      {/* Mot de passe administrateur (base admin uniquement + cap) */}
      {isBaseAdmin && canChangeAdminPwd && (
        <section className="fl-card flex flex-col gap-4">
          <div>
            <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
              Mot de passe administrateur
            </h2>
            <p className="fl-label mt-1">
              Change le mot de passe utilisé pour la connexion en local (LAN).
            </p>
          </div>
          <AdminPasswordForm />
        </section>
      )}

      {/* Cloudflare / Accès (super_admin) */}
      {isSuperAdmin && (
        <section className="fl-card flex flex-col gap-4">
          <div>
            <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
              Cloudflare / Accès
            </h2>
            <p className="fl-label mt-1">
              Réglages Cloudflare Zero Trust. Prioritaires sur les variables
              d&apos;environnement.
            </p>
          </div>
          <CfConfigForm initial={cfConfig} />
        </section>
      )}

      {/* Diagnostic (super_admin) */}
      {isSuperAdmin && (
        <section className="fl-card flex flex-col gap-4">
          <div>
            <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
              Diagnostic
            </h2>
            <p className="fl-label mt-1">
              Vérifications rapides : base de données, Cloudflare, session.
            </p>
          </div>
          <DiagnosticPanel />
        </section>
      )}

      {/* Mise à jour (avec capability) */}
      {canUpdateSite && (
        <section className="fl-card flex flex-col gap-4">
          <div>
            <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
              Mise à jour du site
            </h2>
            <p className="fl-label mt-1">
              Récupère les dernières évolutions depuis GitHub
            </p>
          </div>
          <DeployButton />
        </section>
      )}

      {/* Dossiers */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            Dossiers
          </h2>
          <p className="fl-label mt-1">
            {folders.length} dossier{folders.length > 1 ? "s" : ""} · une recette
            peut être rangée dans 0 ou 1 dossier
          </p>
        </div>
        <FolderManager folders={folders} />
      </section>

      {/* Catégories */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            Catégories
          </h2>
          <p className="fl-label mt-1">
            {categories.length} catégorie{categories.length > 1 ? "s" : ""} ·
            tags secondaires libres pour décrire la recette
          </p>
        </div>
        <CategoryManager categories={categories} />
      </section>

      {/* PDF d'une recette seule */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            PDF d&apos;une recette
          </h2>
          <p className="fl-label mt-1">
            Style appliqué quand tu télécharges le PDF d&apos;une recette individuelle
          </p>
        </div>
        <RecipePdfSettingsForm initial={recipePdfSettings} />
      </section>

      {/* Import Recipe Keeper */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            Import Recipe Keeper
          </h2>
          <p className="fl-label mt-1">Importer un export CSV de Recipe Keeper</p>
        </div>
        <RecipeKeeperImport />
      </section>
    </div>
  );
}

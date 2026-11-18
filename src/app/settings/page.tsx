import Link from "next/link";
import { ChevronRight, Clapperboard, KeyRound, LifeBuoy, LogOut, Scale, Users, Euro, Receipt, ShoppingCart, BadgeEuro, Sparkles, Store, FileArchive, FileJson, FolderOpen, Palette, Plug, Tag, Wheat } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { listPdfThemes } from "@/lib/pdfThemes";
import { getSiteUrl } from "@/app/actions/settings";
import { getMcpToken } from "@/lib/mcp/token";
import { mcpAllowed, mcpKeyAllowed } from "@/lib/mcp/allowed";
import { oauthSetup } from "@/lib/mcp/oauth";
import { SiteSettings } from "@/components/settings/SiteSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { requirePage } from "@/lib/auth/guard";
import { viewerCan } from "@/lib/auth/viewer";
import type { Permission } from "@/lib/auth/permissions";
import { authMode, getAuthSettings } from "@/lib/auth/config";
import { realAccountOf } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requirePage("read");
  const can = (p: Permission) => viewerCan(viewer, p);
  const [folderCount, categoryCount, ingredientBaseCount, pricedCount, themes, siteUrl, mcpToken, supplierCount, invoiceCount] = await Promise.all([
    prisma.folder.count(),
    prisma.category.count(),
    prisma.ingredientBase.count(),
    prisma.ingredientBase.count({ where: { price: { not: null } } }),
    listPdfThemes(),
    getSiteUrl(),
    getMcpToken(),
    prisma.supplier.count(),
    prisma.purchaseOrder.count({ where: { manual: false } }),
  ]);
  const auth = can("accounts.manage") ? await getAuthSettings() : null;
  const accountsWaiting = auth?.enabled ? await prisma.account.count({ where: { status: "pending" } }) : 0;

  // Plateforme (connexion par Authentik) : « Se déconnecter ».
  const oidc = authMode() === "oidc";
  const email = realAccountOf(viewer)?.email ?? null;
  // Page « Mon compte » d'Authentik : mot de passe et double authentification.
  let compteAuthentik: string | null = null;
  try {
    if (oidc && process.env.OIDC_ISSUER) compteAuthentik = `${new URL(process.env.OIDC_ISSUER).origin}/if/user/#/settings`;
  } catch {
    compteAuthentik = null;
  }
  // Textes légaux de la plateforme (lot 8) : sur le site vitrine, ex. https://recipelog.cc/cgv.
  let siteLegal: string | null = null;
  try {
    if (oidc && process.env.RECIPELOG_URL) siteLegal = `https://${new URL(process.env.RECIPELOG_URL).hostname.split(".").slice(1).join(".")}`;
  } catch {
    siteLegal = null;
  }

  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

  return (
    <div className="set-page">
      <div className="page-head">
        <h1>Réglages</h1>
        <p className="sub">Apparence, rangement des recettes, PDF, imports et site</p>
      </div>

      <div className="sect-title">
        <h2>Apparence</h2>
      </div>
      <AppearanceSettings />

      {can("accounts.manage") && auth && (
        <>
          <div className="sect-title">
            <h2>Comptes</h2>
          </div>
          <div className="fl-list">
            <Row
              href="/settings/comptes"
              icon={Users}
              title="Comptes et rôles"
              sub={
                auth.enabled
                  ? accountsWaiting > 0
                    ? `${accountsWaiting} demande${accountsWaiting > 1 ? "s" : ""} en attente`
                    : "Activés · demandes d'accès, rôles et permissions"
                  : "Désactivés · toute personne autorisée par Cloudflare a tous les droits"
              }
            />
          </div>
        </>
      )}

      {(can("organize.edit") || can("costs.view")) && (
        <>
          <div className="sect-title">
            <h2>Recettes</h2>
          </div>
          <div className="fl-list">
            {can("organize.edit") && (
              <>
                <Row
                  href="/settings/folders"
                  icon={FolderOpen}
                  title="Dossiers"
                  sub={`${plural(folderCount, "dossier")} · une recette dans un dossier au plus`}
                />
                <Row
                  href="/settings/categories"
                  icon={Tag}
                  title="Catégories"
                  sub={`${plural(categoryCount, "catégorie")} · étiquettes libres pour décrire les recettes`}
                />
                <Row
                  href="/settings/ingredients"
                  icon={Wheat}
                  title="Ingrédients"
                  sub={`${plural(ingredientBaseCount, "ingrédient")} · proposés à la saisie des recettes`}
                />
              </>
            )}
            {can("costs.view") && (
              <Row
                href="/settings/ingredients/prix"
                icon={Euro}
                title="Prix des ingrédients"
                sub={`${pricedCount} sur ${ingredientBaseCount} renseignés · pour le coût de revient`}
              />
            )}
            {can("costs.view") && (
              <>
                <Row
                  href="/fournisseurs"
                  icon={Store}
                  title="Comparer les prix des fournisseurs"
                  sub={`${plural(supplierCount, "fournisseur")} · tableau des prix payés, article par article`}
                />
                <Row
                  href="/fournisseurs/liste"
                  icon={Users}
                  title="Mes fournisseurs"
                  sub="créer, renommer, supprimer · ajouter ou corriger des produits et des prix"
                />
                <Row
                  href="/factures"
                  icon={Receipt}
                  title="Factures"
                  sub={`${plural(invoiceCount, "facture")} · envoyées à Claude, avec tout l'historique des prix`}
                />
                <Row
                  href="/fournisseurs/commandes"
                  icon={ShoppingCart}
                  title="Commandes fournisseurs"
                  sub="passer une commande en quelques touches · texte pour le commercial et PDF gardés"
                />
                <Row
                  href="/produits-vendus"
                  icon={BadgeEuro}
                  title="Produits vendus"
                  sub="la marge de chaque produit coché « Produit vendu »"
                />
              </>
            )}
            {can("site.update") && (
              <Row
                href="/settings/ia"
                icon={Sparkles}
                title="Lecture des factures"
                sub="Par l'IA ou par Claude (MCP) · factures et mercuriales lues en lignes de prix"
              />
            )}
          </div>
        </>
      )}

      {can("organize.edit") && (
        <>
          <div className="sect-title">
            <h2>PDF</h2>
          </div>
          <div className="fl-list">
            <Row
              href="/settings/themes"
              icon={Palette}
              title="Thèmes PDF"
              sub={`${plural(themes.length, "thème")} · couleurs, polices et mise en page des PDF`}
            />
          </div>
        </>
      )}

      {can("import.run") && (
        <>
          <div className="sect-title">
            <h2>Importer</h2>
          </div>
          <div className="fl-list">
            <Row
              href="/settings/import-json"
              icon={FileJson}
              title="Import JSON"
              sub="Recettes depuis un fichier JSON, ou un livre converti par une IA"
            />
            <Row
              href="/settings/import-recipekeeper"
              icon={FileArchive}
              title="Import Recipe Keeper"
              sub="Sauvegarde ZIP / HTML ou export CSV de l'application Recipe Keeper"
            />
          </div>
        </>
      )}

      {(can("mcp.manage") || can("recipes.edit")) && (
        <>
          <div className="sect-title">
            <h2>Claude</h2>
          </div>
          <div className="fl-list">
            {can("mcp.manage") && mcpAllowed() && (
              <Row
                href="/settings/mcp"
                icon={Plug}
                title="Accès MCP"
                sub={(mcpToken && mcpKeyAllowed()) || oauthSetup() ? "Activé · Claude peut se connecter à RecipeLog" : "Coupé · permet à Claude de consulter et gérer RecipeLog"}
              />
            )}
            {can("recipes.edit") && (
              <Row
                href="/settings/import-video"
                icon={Clapperboard}
                title="Recettes depuis TikTok"
                sub="Partager une vidéo TikTok, Instagram ou un lien à Claude, qui l'ajoute dans RecipeLog"
              />
            )}
          </div>
        </>
      )}

      <div className="sect-title">
        <h2>Site</h2>
      </div>
      <SiteSettings siteUrl={siteUrl} canUpdate={can("site.update")} />

      {oidc && (
        <>
          <div className="sect-title">
            <h2>Mon compte</h2>
          </div>
          <div className="fl-list">
            {compteAuthentik && (
              <a href={compteAuthentik} className="fl-row" target="_blank" rel="noopener noreferrer">
                <span className="ic">
                  <KeyRound size={17} />
                </span>
                <span className="set-tx">
                  <b>
                    <span>Mot de passe et sécurité</span>
                  </b>
                  <small>Changer ton mot de passe, activer la double authentification (code sur ton téléphone)</small>
                </span>
                <ChevronRight size={16} className="set-chev" />
              </a>
            )}
            <Link href="/settings/support" className="fl-row">
              <span className="ic">
                <LifeBuoy size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Signaler un problème</span>
                </b>
                <small>Un souci, une question ou une idée : l'équipe RecipeLog te répond ici et par e-mail</small>
              </span>
              <ChevronRight size={16} className="set-chev" />
            </Link>
            {siteLegal && (
              <a href={`${siteLegal}/cgv`} className="fl-row" target="_blank" rel="noopener noreferrer">
                <span className="ic">
                  <Scale size={17} />
                </span>
                <span className="set-tx">
                  <b>
                    <span>Conditions et données personnelles</span>
                  </b>
                  <small>Conditions générales, confidentialité, sous-traitance des données et mentions légales de RecipeLog</small>
                </span>
                <ChevronRight size={16} className="set-chev" />
              </a>
            )}
            {/* Simple lien (pas next/link) : un préchargement ne doit jamais déconnecter. */}
            <a href="/auth/deconnexion" className="fl-row">
              <span className="ic">
                <LogOut size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Se déconnecter</span>
                </b>
                <small>{email ? `Connecté avec ${email}` : "Quitter RecipeLog sur cet appareil"}</small>
              </span>
              <ChevronRight size={16} className="set-chev" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ href, icon: Icon, title, sub }: { href: string; icon: LucideIcon; title: string; sub: string }) {
  return (
    <Link href={href} className="fl-row">
      <span className="ic">
        <Icon size={17} />
      </span>
      <span className="set-tx">
        <b>
          <span>{title}</span>
        </b>
        <small>{sub}</small>
      </span>
      <ChevronRight size={16} className="set-chev" />
    </Link>
  );
}

import { describe, expect, it } from "vitest";
import { lireLimites, moduleDeLaPage, moduleDeLOutil, modulesEffectifs, permissionsSansModules } from "@/lib/modules";
import { MEMBRE_PERMISSIONS } from "@/lib/auth/roleMembre";

describe("modules en option", () => {
  it("couper un parent coupe ses sous-modules", () => {
    const off = modulesEffectifs(["fournisseurs"]);
    expect([...off].sort()).toEqual(["commandes", "factures", "fournisseurs", "mercuriales", "ventes"]);
  });
  it("un sous-module seul ne coupe pas son parent", () => {
    expect([...modulesEffectifs(["mercuriales"])]).toEqual(["mercuriales"]);
  });
  it("les trois imports coupés coupent « Imports »", () => {
    expect(modulesEffectifs(["import-json", "import-video", "import-recipekeeper"]).has("imports")).toBe(true);
    expect(modulesEffectifs(["import-json"]).has("imports")).toBe(false);
  });
  it("ignore les clés inconnues", () => {
    expect(modulesEffectifs(["truc", "courses"]).size).toBe(1);
  });
  it("retrouve le module d'une page", () => {
    expect(moduleDeLaPage("/fournisseurs/12/commande")).toBe("commandes");
    expect(moduleDeLaPage("/fournisseurs/commandes/3")).toBe("commandes");
    expect(moduleDeLaPage("/fournisseurs/12")).toBe("fournisseurs");
    expect(moduleDeLaPage("/factures/4")).toBe("factures");
    expect(moduleDeLaPage("/cookbooks")).toBe("cahiers");
    expect(moduleDeLaPage("/settings/export")).toBe("import-json");
    expect(moduleDeLaPage("/settings/ingredients")).toBeNull();
    expect(moduleDeLaPage("/recipes/3")).toBeNull();
  });
  it("retrouve le module d'un outil MCP", () => {
    expect(moduleDeLOutil("passer_commande")).toBe("commandes");
    expect(moduleDeLOutil("lire_recette")).toBeNull();
  });
  it("retire les permissions des modules coupés", () => {
    expect(permissionsSansModules(["read" as never, "costs.view", "cookbooks.edit"], modulesEffectifs(["fournisseurs"]))).toEqual(["read", "cookbooks.edit"]);
  });
});

import { MCP_TOOLS } from "@/lib/mcp/tools";
describe("outils MCP des modules", () => {
  it("chaque outil rangé dans un module existe", async () => {
    const src = (await import("node:fs")).readFileSync("src/lib/modules.ts", "utf8");
    const noms = [...src.slice(src.indexOf("const OUTILS")).matchAll(/^  ([a-z_]+): "[a-z-]+",$/gm)].map((m) => m[1]);
    const existants = new Set(MCP_TOOLS.map((t) => t.name));
    expect(noms.length).toBeGreaterThan(40);
    expect(noms.filter((n) => !existants.has(n))).toEqual([]);
  });
});

describe("utilisateurs, rôles et limites", () => {
  it("couper Utilisateurs coupe Rôles et retire la gestion des comptes", () => {
    const off = modulesEffectifs(["utilisateurs"]);
    expect(off.has("roles")).toBe(true);
    expect(permissionsSansModules(["accounts.manage", "recipes.edit"], off)).toEqual(["recipes.edit"]);
    expect(moduleDeLaPage("/settings/comptes")).toBe("utilisateurs");
  });

  it("ne garde que les limites valables", () => {
    expect(lireLimites({ recettes: 200, fichiersMo: 0, roles: -1, cahiers: 2.5, marquePdf: true, videosMois: "3", x: 1 })).toEqual({ recettes: 200, marquePdf: true });
    expect(lireLimites(null)).toEqual({});
  });

  it("le rôle Membre a tout sauf comptes, clé Claude et mise à jour", () => {
    expect(MEMBRE_PERMISSIONS).toContain("recipes.edit");
    expect(MEMBRE_PERMISSIONS).not.toContain("accounts.manage");
    expect(MEMBRE_PERMISSIONS).not.toContain("mcp.manage");
    expect(MEMBRE_PERMISSIONS).not.toContain("site.update");
  });
});

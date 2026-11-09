import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALL_PERMISSIONS, cleanPermissions, rolePermissions } from "@/lib/auth/permissions";

/**
 * Chaque Server Action, page et route d'API doit vérifier les droits du
 * visiteur : une action peut être appelée directement, sans passer par la page.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Corps de chaque fonction exportée (jusqu'à la fonction exportée suivante). */
function exportedBodies(src: string, re: RegExp): { name: string; body: string }[] {
  const matches = [...src.matchAll(re)];
  return matches.map((m, i) => ({
    name: m[1],
    body: src.slice(m.index!, i + 1 < matches.length ? matches[i + 1].index : undefined),
  }));
}

const APP = join(__dirname, "..", "src", "app");

describe("gardes des droits", () => {
  it("chaque Server Action commence par une vérification", () => {
    const files = readdirSync(join(APP, "actions")).map((f) => join(APP, "actions", f));
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const { name, body } of exportedBodies(src, /^export async function (\w+)/gm)) {
        // requestAccess / stopViewAs vérifient le visiteur eux-mêmes (getViewer).
        if (!/requireAccess\(|getViewer\(\)/.test(body)) missing.push(`${f}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("chaque page vérifie le visiteur (sauf /acces et le partage public)", () => {
    const pages = walk(APP).filter((f) => f.endsWith("page.tsx") && !f.includes(`${join("app", "acces")}`) && !f.includes(join("app", "share")));
    const missing = pages.filter((f) => !readFileSync(f, "utf8").includes("await requirePage("));
    expect(missing).toEqual([]);
  });

  it("chaque route vérifie le visiteur (sauf MCP, protégé par sa clé, et l'état de santé)", () => {
    const routes = walk(APP).filter((f) => f.endsWith("route.ts") && !f.includes(join("api", "mcp")) && !f.includes(join("api", "health")));
    const missing: string[] = [];
    for (const f of routes) {
      for (const { name, body } of exportedBodies(readFileSync(f, "utf8"), /^export async function (GET|POST|PUT|PATCH|DELETE)/gm)) {
        if (!body.includes("await apiDenied(")) missing.push(`${f}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("les permissions demandées existent toutes", () => {
    const used = new Set<string>();
    for (const f of walk(join(__dirname, "..", "src"))) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/(?:requireAccess|requirePage|apiDenied|viewerCan\(\w+,|can)\("([a-z.]+)"\)/g)) {
        used.add(m[1]);
      }
      for (const m of readFileSync(f, "utf8").matchAll(/data-needs="([a-z.]+)"/g)) used.add(m[1]);
    }
    const unknown = [...used].filter((p) => p !== "read" && !(ALL_PERMISSIONS as string[]).includes(p));
    expect(unknown).toEqual([]);
  });

  it("chaque permission a sa règle CSS pour masquer ses boutons", () => {
    const css = readFileSync(join(__dirname, "..", "src", "styles", "auth.css"), "utf8");
    for (const p of ALL_PERMISSIONS) expect(css).toContain(`[data-no~="${p}"] [data-needs~="${p}"]`);
  });
});

describe("permissions des rôles", () => {
  it("le rôle Administrateur a tout, même sans rien de coché", () => {
    expect(rolePermissions({ isAdmin: true, permissions: [] })).toEqual(ALL_PERMISSIONS);
  });

  it("un rôle a seulement ce qui est coché, et les clés inconnues disparaissent", () => {
    expect(rolePermissions({ isAdmin: false, permissions: ["costs.view", "inconnue"] })).toEqual(["costs.view"]);
    expect(rolePermissions(null)).toEqual([]);
    expect(cleanPermissions(["pdf.export", "recipes.edit"])).toEqual(["recipes.edit", "pdf.export"]);
  });
});

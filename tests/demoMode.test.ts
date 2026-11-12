import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { viewerCan, viewerPermissions } from "@/lib/auth/viewer";

afterEach(() => {
  delete process.env.RECIPELOG_DEMO;
});

describe("mode démo", () => {
  it("sans démo, comptes désactivés : tous les droits", () => {
    expect(viewerCan({ kind: "open" }, "site.update")).toBe(true);
    expect(viewerPermissions({ kind: "open" })).toContain("mcp.manage");
  });

  it("en démo : comptes, MCP et mise à jour fermés, le reste ouvert", () => {
    process.env.RECIPELOG_DEMO = "1";
    const open = { kind: "open" } as const;
    expect(viewerCan(open, "site.update")).toBe(false);
    expect(viewerCan(open, "mcp.manage")).toBe(false);
    expect(viewerCan(open, "accounts.manage")).toBe(false);
    expect(viewerCan(open, "recipes.edit")).toBe(true);
    expect(viewerCan(open, "read")).toBe(true);
    const perms = viewerPermissions(open);
    expect(perms).not.toContain("site.update");
    expect(perms).toContain("costs.view");
  });
});

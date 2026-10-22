import { describe, expect, it } from "vitest";
import { handleMcpBody, type McpTool } from "@/lib/mcp/protocol";

const tools: McpTool[] = [
  {
    name: "echo",
    description: "Renvoie le texte",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
    run: async (args) => ({ content: [{ type: "text", text: String(args.text) }] }),
  },
  {
    name: "boom",
    description: "Échoue",
    inputSchema: { type: "object" },
    run: async () => {
      throw new Error("raté");
    },
  },
];

const call = (msg: unknown) => handleMcpBody(JSON.stringify(msg), tools);

describe("serveur MCP", () => {
  it("répond à initialize avec la version demandée si connue", async () => {
    const res = (await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })) as any;
    expect(res.result.protocolVersion).toBe("2025-03-26");
    expect(res.result.capabilities.tools).toBeDefined();
    expect(res.result.serverInfo.name).toBe("recipelog");
  });

  it("propose sa version la plus récente sinon", async () => {
    const res = (await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } })) as any;
    expect(res.result.protocolVersion).toBe("2025-06-18");
  });

  it("ne répond pas aux notifications", async () => {
    expect(await call({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });

  it("liste les outils sans leur code", async () => {
    const res = (await call({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as any;
    expect(res.result.tools.map((t: any) => t.name)).toEqual(["echo", "boom"]);
    expect(res.result.tools[0].run).toBeUndefined();
  });

  it("appelle un outil", async () => {
    const res = (await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { text: "salut" } } })) as any;
    expect(res.result.content[0].text).toBe("salut");
  });

  it("renvoie l'erreur d'un outil comme résultat isError", async () => {
    const res = (await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "boom" } })) as any;
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("raté");
  });

  it("signale un outil ou une méthode inconnus", async () => {
    const a = (await call({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } })) as any;
    expect(a.error.code).toBe(-32602);
    const b = (await call({ jsonrpc: "2.0", id: 6, method: "resources/list" })) as any;
    expect(b.error.code).toBe(-32601);
  });

  it("gère un lot et un JSON illisible", async () => {
    const res = (await call([
      { jsonrpc: "2.0", id: 7, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ])) as any[];
    expect(res).toEqual([{ jsonrpc: "2.0", id: 7, result: {} }]);
    const bad = (await handleMcpBody("{", tools)) as any;
    expect(bad.error.code).toBe(-32700);
  });
});

describe("repérage des doublons d'ingrédients", () => {
  it("ignore la casse, les accents et le pluriel", async () => {
    const { duplicateKey } = await import("@/lib/mcp/duplicates");
    expect(duplicateKey("Œufs")).toBe(duplicateKey("oeuf"));
    expect(duplicateKey("Crème fraîche")).toBe(duplicateKey("creme fraiche"));
    expect(duplicateKey("Amandes")).toBe(duplicateKey("amande"));
    expect(duplicateKey("Noix")).toBe(duplicateKey("noix"));
    expect(duplicateKey("Gros sel")).toBe(duplicateKey("gros sel"));
  });
});

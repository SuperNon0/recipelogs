/**
 * Serveur MCP minimal (Model Context Protocol), sans dépendance :
 * JSON-RPC 2.0 sur HTTP, transport « Streamable HTTP » en mode sans état
 * (une requête POST = une réponse JSON, pas de flux SSE).
 * Suffit pour Claude (connecteur personnalisé) et Claude Code.
 */

export const SERVER_INFO = { name: "recipelog", title: "RecipeLog", version: "1.0.0" };

/** Versions du protocole acceptées, la plus récente en premier. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type McpToolResult = {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
};

export type McpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run: (args: Record<string, unknown>) => Promise<McpToolResult>;
};

type JsonRpcId = string | number | null;
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Traite un message JSON-RPC. Renvoie null pour une notification ou une
 * réponse du client (rien à répondre).
 */
export async function handleMcpMessage(msg: unknown, tools: McpTool[]): Promise<JsonRpcResponse | null> {
  if (!isObject(msg) || msg.jsonrpc !== "2.0") return fail(null, INVALID_REQUEST, "Requête JSON-RPC invalide");
  const hasId = "id" in msg && (typeof msg.id === "string" || typeof msg.id === "number");
  if (typeof msg.method !== "string") {
    // Réponse du client à une requête du serveur : on n'en envoie jamais, on ignore.
    return hasId || "result" in msg || "error" in msg ? null : fail(null, INVALID_REQUEST, "Méthode manquante");
  }
  if (!hasId) return null; // notification (ex. notifications/initialized)
  const id = msg.id as string | number;
  const params = isObject(msg.params) ? msg.params : {};

  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Accès à RecipeLog, l'application de recettes de pâtisserie de Noë. Réponds en français. " +
          "Les quantités sont en grammes sauf unité contraire. Avant de modifier une recette, relis-la avec lire_recette. " +
          "Demande toujours confirmation avant une suppression ou une mise à jour du site. " +
          "Quand on te partage un lien TikTok, Instagram, YouTube ou une page de recette, lis-le avec lire_video, " +
          "puis crée la recette avec creer_recette dans le dossier indiqué, avec l'étiquette « à vérifier » et le lien en source.",
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: tools.map(({ run: _run, ...t }) => t),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return fail(id, INVALID_PARAMS, `Outil inconnu : ${String(params.name)}`);
      const args = isObject(params.arguments) ? params.arguments : {};
      try {
        return ok(id, await tool.run(args));
      } catch (e) {
        return ok(id, { content: [{ type: "text", text: `Erreur : ${toolErrorMessage(e)}` }], isError: true });
      }
    }
    default:
      return fail(id, METHOD_NOT_FOUND, `Méthode non prise en charge : ${msg.method}`);
  }
}

/**
 * Message lisible pour une erreur d'outil : les erreurs de la base (ligne
 * inexistante, recette encore utilisée…) sont traduites au lieu d'être
 * renvoyées brutes.
 */
export function toolErrorMessage(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  if (code === "P2025") return "élément introuvable (vérifie l'id : il a peut-être été supprimé).";
  if (code === "P2003") return "lien impossible : un des éléments n'existe pas, ou il est encore utilisé ailleurs.";
  if (code === "P2002") return "cet élément existe déjà.";
  return e instanceof Error ? e.message : String(e);
}

/**
 * Traite le corps d'une requête POST (message seul ou lot).
 * Renvoie null quand il n'y a rien à répondre (HTTP 202).
 */
export async function handleMcpBody(raw: string, tools: McpTool[]): Promise<unknown | null> {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(null, PARSE_ERROR, "JSON illisible");
  }
  if (Array.isArray(body)) {
    if (body.length === 0) return fail(null, INVALID_REQUEST, "Lot vide");
    const out = (await Promise.all(body.map((m) => handleMcpMessage(m, tools)))).filter((r) => r !== null);
    return out.length ? out : null;
  }
  return handleMcpMessage(body, tools);
}

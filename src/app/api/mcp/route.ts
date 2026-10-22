import { mcpResponse } from "@/lib/mcp/http";

/**
 * Point d'accès MCP avec la clé dans l'en-tête :
 * POST https://<site>/api/mcp + « Authorization: Bearer <clé> ».
 * La clé se crée et se change dans Réglages → Accès MCP.
 */
export const dynamic = "force-dynamic";

export const POST = (req: Request) => mcpResponse(req);
export const GET = (req: Request) => mcpResponse(req);
export const DELETE = (req: Request) => mcpResponse(req);

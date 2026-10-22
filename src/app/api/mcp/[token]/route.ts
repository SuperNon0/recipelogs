import { mcpResponse } from "@/lib/mcp/http";

/**
 * Point d'accès MCP avec la clé dans l'adresse : https://<site>/api/mcp/<clé>.
 * Pour les clients qui ne savent envoyer qu'une URL. Si un en-tête
 * « Authorization » ou « X-API-Key » est présent, c'est lui qui compte.
 */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const handler = async (req: Request, ctx: Ctx) => mcpResponse(req, (await ctx.params).token);

export const POST = handler;
export const GET = handler;
export const DELETE = handler;

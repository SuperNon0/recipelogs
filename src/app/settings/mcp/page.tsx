import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMcpToken } from "@/lib/mcp/token";
import { MCP_TOOLS } from "@/lib/mcp/tools";
import { McpAccess } from "@/components/settings/McpAccess";

export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
  const token = await getMcpToken();
  const tools = MCP_TOOLS.map((t) => ({ name: t.title ?? t.name, description: t.description }));

  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Accès MCP</h1>
        <p className="sub">Laisser Claude consulter et gérer RecipeLog</p>
      </div>
      <McpAccess token={token} tools={tools} />
    </div>
  );
}

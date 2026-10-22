import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMcpToken } from "@/lib/mcp/token";
import { MCP_TOOL_GROUPS } from "@/lib/mcp/tools";
import { McpAccess, type ToolGroupInfo } from "@/components/settings/McpAccess";

export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
  const token = await getMcpToken();
  const groups: ToolGroupInfo[] = MCP_TOOL_GROUPS.map((g) => ({
    title: g.title,
    tools: g.tools.map((t) => ({
      name: t.title ?? t.name,
      description: t.description,
      kind: t.annotations?.readOnlyHint ? "read" : t.annotations?.destructiveHint ? "delete" : "write",
    })),
  }));

  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Accès MCP</h1>
        <p className="sub">Laisser Claude consulter et gérer RecipeLog</p>
      </div>
      <McpAccess token={token} groups={groups} />
    </div>
  );
}

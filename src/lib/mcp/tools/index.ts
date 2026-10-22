import type { McpTool } from "../protocol";
import { COOKBOOK_TOOLS } from "./cookbooks";
import { INGREDIENT_TOOLS } from "./ingredients";
import { ORGANISATION_TOOLS } from "./organisation";
import { RECIPE_TOOLS } from "./recipes";
import { SHOPPING_TOOLS } from "./shopping";
import { SITE_TOOLS } from "./site";

/** Groupes d'outils proposés à Claude, dans l'ordre affiché dans Réglages → Accès MCP. */
export const MCP_TOOL_GROUPS: { title: string; tools: McpTool[] }[] = [
  { title: "Ingrédients", tools: INGREDIENT_TOOLS },
  { title: "Recettes", tools: RECIPE_TOOLS },
  { title: "Dossiers et catégories", tools: ORGANISATION_TOOLS },
  { title: "Listes de courses", tools: SHOPPING_TOOLS },
  { title: "Cahiers", tools: COOKBOOK_TOOLS },
  { title: "Site", tools: SITE_TOOLS },
];

export const MCP_TOOLS: McpTool[] = MCP_TOOL_GROUPS.flatMap((g) => g.tools);

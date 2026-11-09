import { existsSync, readFileSync } from "node:fs";
import { apiDenied } from "@/lib/auth/guard";

const LOG_FILE = "/tmp/recipelog-deploy.log";
const LOCK_FILE = "/tmp/recipelog-deploy.lock";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await apiDenied("site.update");
  if (denied) return denied;
  let log = "";
  if (existsSync(LOG_FILE)) {
    try {
      const content = readFileSync(LOG_FILE, "utf8");
      log = content.split("\n").slice(-100).join("\n");
    } catch {
      // ignore
    }
  }
  return Response.json({
    log,
    inProgress: existsSync(LOCK_FILE),
  });
}

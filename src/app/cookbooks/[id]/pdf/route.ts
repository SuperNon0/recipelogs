import { NextResponse } from "next/server";
import { getCookbookDetail } from "@/lib/cookbooks";
import { loadCookbookEntries, renderCookbookPdf } from "@/lib/pdf/cookbookPdf";
import { parseTheme } from "@/lib/pdf/theme";
import { apiDenied } from "@/lib/auth/guard";
import { requireVisibleCookbook } from "@/lib/auth/visibility";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await apiDenied("pdf.export");
  if (denied) return denied;
  const { id } = await params;
  const cookbookId = Number(id);
  await requireVisibleCookbook(cookbookId);
  if (isNaN(cookbookId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cookbook = await getCookbookDetail(cookbookId);
  if (!cookbook) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderCookbookPdf({
    name: cookbook.name,
    description: cookbook.description,
    hasCover: cookbook.hasCover,
    hasToc: cookbook.hasToc,
    format: cookbook.format as "A4" | "A5",
    theme: parseTheme(cookbook.coverConfig),
    footer: cookbook.footer,
    entries: await loadCookbookEntries(cookbook),
  });
  if (!pdf) {
    return new NextResponse(
      "Ce cahier est vide : ajoutez une recette ou activez la couverture.",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const filename = `${cookbook.name.replace(/[^a-z0-9\-]/gi, "_")}.pdf`;
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

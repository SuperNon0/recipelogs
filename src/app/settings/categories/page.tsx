import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { CategoryManager } from "@/components/CategoryManager";

export const dynamic = "force-dynamic";

export default async function CategoriesSettingsPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { recipes: true } } },
  });

  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <CategoryManager
        categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color, count: c._count.recipes }))}
      />
    </div>
  );
}

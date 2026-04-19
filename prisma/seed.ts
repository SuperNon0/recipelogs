import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Templates PDF (phase 4 — placeholders à ce stade)
  const templates = [
    { slug: "classique", name: "Classique", description: "Éditorial, professionnel, 2-3 colonnes" },
    { slug: "moderne", name: "Moderne", description: "Minimaliste, épuré, blanc sur noir" },
    { slug: "fiche-technique", name: "Fiche technique", description: "Dense, tableau multi-colonnes" },
    { slug: "magazine", name: "Magazine", description: "Photo pleine page, magazine-style" },
  ];

  for (const t of templates) {
    await prisma.pdfTemplate.upsert({
      where: { slug: t.slug },
      update: { name: t.name, description: t.description },
      create: t,
    });
  }

  // Catégories par défaut orientées pâtisserie
  const categories = [
    { name: "Entremets", color: "#a78bfa" },
    { name: "Tartes", color: "#e87c47" },
    { name: "Viennoiseries", color: "#e8c547" },
    { name: "Biscuits", color: "#4fc3a1" },
    { name: "Glaces & sorbets", color: "#4fc3a1" },
    { name: "Chocolat", color: "#e87c47" },
    { name: "Bases", color: "#6b6f7a" },
    { name: "Décoration", color: "#a78bfa" },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: { color: c.color },
      create: c,
    });
  }

  // Paramètres initiaux
  await prisma.setting.upsert({
    where: { key: "ingredient_mode" },
    update: {},
    create: { key: "ingredient_mode", value: "A" },
  });
  await prisma.setting.upsert({
    where: { key: "logo_enabled" },
    update: {},
    create: { key: "logo_enabled", value: false },
  });

  console.log("Seed terminé : templates, catégories, paramètres initiaux.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.recipe.findFirst({
    where: { name: "Tarte citron meringuée" },
  });
  if (existing) {
    console.log("Recette de démo déjà présente :", existing.id);
    return;
  }

  const cat = await prisma.category.findUnique({ where: { name: "Tartes" } });

  const r = await prisma.recipe.create({
    data: {
      name: "Tarte citron meringuée",
      source: "Inspiration Cédric Grolet",
      favorite: true,
      rating: 5,
      notesTips: "Bien tempérer les blancs avant de serrer la meringue.",
      tags: {
        create: [
          { name: "citron" },
          { name: "meringue" },
          { name: "classique" },
        ],
      },
      categories: cat ? { create: [{ categoryId: cat.id }] } : undefined,
      ingredients: {
        create: [
          { name: "Farine T55", quantityG: 250, position: 0 },
          { name: "Beurre doux", quantityG: 125, position: 1 },
          { name: "Sucre glace", quantityG: 90, position: 2 },
          { name: "Jaunes d'œufs", quantityG: 40, position: 3 },
          { name: "Jus de citron", quantityG: 120, position: 4 },
          { name: "Œufs entiers", quantityG: 150, position: 5 },
          { name: "Sucre semoule", quantityG: 150, position: 6 },
          { name: "Beurre (crème)", quantityG: 180, position: 7 },
          { name: "Blancs d'œufs", quantityG: 120, position: 8 },
          { name: "Sucre (meringue)", quantityG: 240, position: 9 },
        ],
      },
      stepsBlock: {
        create: {
          content:
            "1. Pâte sucrée\n   Sabler farine + beurre + sucre glace\n   Ajouter jaunes, fraser, reposer 2h.\n\n2. Crème de citron\n   Cuire œufs + sucre + jus à 85°C.\n   Ajouter beurre hors du feu, mixer.\n\n3. Meringue italienne\n   Cuire sucre à 118°C, verser sur blancs montés.\n   Serrer 5 min au chalumeau.",
        },
      },
    },
  });
  console.log("Recette de démo créée :", r.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

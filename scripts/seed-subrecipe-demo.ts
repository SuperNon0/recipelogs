import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const biscuit = await prisma.recipe.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: "Biscuit financier",
      ingredients: {
        create: [
          { name: "Poudre d'amandes", quantityG: 80, position: 0 },
          { name: "Sucre glace", quantityG: 120, position: 1 },
          { name: "Farine T55", quantityG: 40, position: 2 },
          { name: "Blancs d'œufs", quantityG: 120, position: 3 },
          { name: "Beurre noisette", quantityG: 100, position: 4 },
        ],
      },
      stepsBlock: {
        create: {
          content: "Mélanger les poudres. Ajouter les blancs non montés, puis le beurre noisette tiède. Cuire à 180°C, 12 min.",
        },
      },
    },
  });

  const entremets = await prisma.recipe.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: "Entremets framboise (montage)",
      favorite: false,
      ingredients: {
        create: [
          { name: "Fruits rouges surgelés", quantityG: 200, position: 0 },
          { name: "Gélatine", quantityG: 6, position: 1 },
          { name: "Sucre", quantityG: 60, position: 2 },
        ],
      },
    },
  });

  const existingLink = await prisma.subRecipe.findFirst({
    where: { parentId: entremets.id, childId: biscuit.id },
  });
  if (!existingLink) {
    await prisma.subRecipe.create({
      data: {
        parentId: entremets.id,
        childId: biscuit.id,
        label: "Biscuit",
        calcMode: "mass_target",
        calcValue: 300,
        position: 0,
      },
    });
  }

  console.log("Seed sous-recette démo OK :", {
    biscuit: biscuit.id,
    entremets: entremets.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

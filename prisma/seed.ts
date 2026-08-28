import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  // Dossiers par défaut (1 dossier max par recette ; sert à classer par grand type)
  const folders = [
    { name: "Tartes", color: "#e87c47" },
    { name: "Entremets", color: "#a78bfa" },
    { name: "Glaces & sorbets", color: "#5cd4b0" },
    { name: "Viennoiserie", color: "#e6c83a" },
    { name: "Pains", color: "#bf8a4f" },
    { name: "Confiserie", color: "#e85c8c" },
    { name: "Crèmes & garnitures", color: "#4fc3a1" },
    { name: "Pâtes de base", color: "#6b6f7a" },
  ];
  for (const f of folders) {
    await prisma.folder.upsert({
      where: { name: f.name },
      update: { color: f.color },
      create: f,
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

  // ─── Super-admin amorcé depuis l'environnement ─────────────────
  // Modèle « login local + email super-admin en UN SEUL compte » :
  // un compte unique qui matche l'email CF ET possède un mot de passe local.
  const adminEmail = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminPassword = process.env.SUPERADMIN_PASSWORD ?? "";
  const forcePassword = String(process.env.SEED_FORCE_ADMIN_PASSWORD ?? "").toLowerCase() === "true";

  if (adminEmail && adminPassword) {
    const existing = await prisma.account.findUnique({ where: { email: adminEmail } });
    const hash = await bcrypt.hash(adminPassword, 12);

    if (!existing) {
      await prisma.account.create({
        data: {
          email: adminEmail,
          role: "super_admin",
          state: "active",
          passwordHash: hash,
          validatedAt: new Date(),
        },
      });
      console.log(`Seed auth : super-admin créé (${adminEmail}).`);
    } else {
      const patch: {
        role: "super_admin";
        state: "active";
        validatedAt: Date | null;
        passwordHash?: string;
      } = {
        role: "super_admin",
        state: "active",
        validatedAt: existing.validatedAt ?? new Date(),
      };
      // Idempotence : on ne réécrit pas le hash sauf demande explicite.
      if (!existing.passwordHash || forcePassword) {
        patch.passwordHash = hash;
      }
      await prisma.account.update({ where: { id: existing.id }, data: patch });
      console.log(
        forcePassword
          ? `Seed auth : super-admin ${adminEmail} MAJ (mot de passe réécrit).`
          : `Seed auth : super-admin ${adminEmail} déjà présent (mot de passe préservé).`,
      );
    }
  } else {
    console.log(
      "Seed auth : SUPERADMIN_EMAIL et/ou SUPERADMIN_PASSWORD non définis, super-admin non amorcé.",
    );
  }

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

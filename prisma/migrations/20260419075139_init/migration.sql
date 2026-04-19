-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "CalcMode" AS ENUM ('coefficient', 'mass_target', 'pivot_ingredient');

-- CreateEnum
CREATE TYPE "PaperFormat" AS ENUM ('A4', 'A5');

-- CreateEnum
CREATE TYPE "LinkMode" AS ENUM ('linked', 'snapshot');

-- CreateEnum
CREATE TYPE "SubRecipeRenderMode" AS ENUM ('single', 'separate');

-- CreateEnum
CREATE TYPE "ShoppingListType" AS ENUM ('recipes', 'free', 'mixed');

-- CreateEnum
CREATE TYPE "ShareEntityType" AS ENUM ('recipe', 'cookbook');

-- CreateTable
CREATE TABLE "recipes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "photo_path" TEXT,
    "source" TEXT,
    "notes_tips" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steps_block" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "steps_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients_base" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "default_unit" TEXT NOT NULL DEFAULT 'g',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredients_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "name" TEXT,
    "ingredient_base_id" INTEGER,
    "quantity_g" DECIMAL(10,3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_recipes" (
    "id" SERIAL NOT NULL,
    "parent_id" INTEGER NOT NULL,
    "child_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "calc_mode" "CalcMode" NOT NULL DEFAULT 'coefficient',
    "calc_value" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "pivot_ingredient_id" INTEGER,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sub_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" SERIAL NOT NULL,
    "source_recipe_id" INTEGER NOT NULL,
    "variant_recipe_id" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#e8c547',
    "icon" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes_categories" (
    "recipe_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "recipes_categories_pkey" PRIMARY KEY ("recipe_id","category_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "preview_path" TEXT,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pdf_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookbooks" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "PaperFormat" NOT NULL DEFAULT 'A4',
    "template_id" INTEGER,
    "has_toc" BOOLEAN NOT NULL DEFAULT true,
    "has_cover" BOOLEAN NOT NULL DEFAULT true,
    "cover_config" JSONB NOT NULL DEFAULT '{}',
    "has_logo" BOOLEAN NOT NULL DEFAULT true,
    "page_numbering_config" JSONB NOT NULL DEFAULT '{}',
    "footer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cookbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookbooks_recipes" (
    "id" SERIAL NOT NULL,
    "cookbook_id" INTEGER NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "link_mode" "LinkMode" NOT NULL DEFAULT 'linked',
    "snapshot_data" JSONB,
    "snapshot_date" TIMESTAMP(3),
    "subrecipe_mode" "SubRecipeRenderMode" NOT NULL DEFAULT 'single',

    CONSTRAINT "cookbooks_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShoppingListType" NOT NULL DEFAULT 'mixed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" SERIAL NOT NULL,
    "shopping_list_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity_g" DECIMAL(10,3),
    "recipe_id" INTEGER,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_recipes" (
    "id" SERIAL NOT NULL,
    "shopping_list_id" INTEGER NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "coefficient" DECIMAL(12,4) NOT NULL DEFAULT 1,

    CONSTRAINT "shopping_list_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_tokens" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "entity_type" "ShareEntityType" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "share_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "recipes_updated_at_idx" ON "recipes"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "recipes_favorite_idx" ON "recipes"("favorite");

-- CreateIndex
CREATE UNIQUE INDEX "steps_block_recipe_id_key" ON "steps_block"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_base_name_key" ON "ingredients_base"("name");

-- CreateIndex
CREATE INDEX "ingredients_recipe_id_idx" ON "ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "sub_recipes_parent_id_idx" ON "sub_recipes"("parent_id");

-- CreateIndex
CREATE INDEX "sub_recipes_child_id_idx" ON "sub_recipes"("child_id");

-- CreateIndex
CREATE UNIQUE INDEX "variants_source_recipe_id_variant_recipe_id_key" ON "variants"("source_recipe_id", "variant_recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "tags_name_idx" ON "tags"("name");

-- CreateIndex
CREATE INDEX "tags_recipe_id_idx" ON "tags"("recipe_id");

-- CreateIndex
CREATE INDEX "comments_recipe_id_idx" ON "comments"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "pdf_templates_slug_key" ON "pdf_templates"("slug");

-- CreateIndex
CREATE INDEX "cookbooks_updated_at_idx" ON "cookbooks"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "cookbooks_recipes_cookbook_id_position_idx" ON "cookbooks_recipes"("cookbook_id", "position");

-- CreateIndex
CREATE INDEX "cookbooks_recipes_recipe_id_idx" ON "cookbooks_recipes"("recipe_id");

-- CreateIndex
CREATE INDEX "shopping_lists_updated_at_idx" ON "shopping_lists"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "shopping_list_items_shopping_list_id_idx" ON "shopping_list_items"("shopping_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_list_recipes_shopping_list_id_recipe_id_key" ON "shopping_list_recipes"("shopping_list_id", "recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_tokens_token_key" ON "share_tokens"("token");

-- CreateIndex
CREATE INDEX "share_tokens_entity_type_entity_id_idx" ON "share_tokens"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "steps_block" ADD CONSTRAINT "steps_block_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_ingredient_base_id_fkey" FOREIGN KEY ("ingredient_base_id") REFERENCES "ingredients_base"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_recipes" ADD CONSTRAINT "sub_recipes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_recipes" ADD CONSTRAINT "sub_recipes_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_source_recipe_id_fkey" FOREIGN KEY ("source_recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_variant_recipe_id_fkey" FOREIGN KEY ("variant_recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes_categories" ADD CONSTRAINT "recipes_categories_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes_categories" ADD CONSTRAINT "recipes_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cookbooks" ADD CONSTRAINT "cookbooks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "pdf_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cookbooks_recipes" ADD CONSTRAINT "cookbooks_recipes_cookbook_id_fkey" FOREIGN KEY ("cookbook_id") REFERENCES "cookbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cookbooks_recipes" ADD CONSTRAINT "cookbooks_recipes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_shopping_list_id_fkey" FOREIGN KEY ("shopping_list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_recipes" ADD CONSTRAINT "shopping_list_recipes_shopping_list_id_fkey" FOREIGN KEY ("shopping_list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_recipes" ADD CONSTRAINT "shopping_list_recipes_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

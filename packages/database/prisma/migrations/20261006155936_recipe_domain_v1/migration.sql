/*
  Warnings:

  - Added the required column `updated_at` to the `recipes` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "recipe_versions" DROP CONSTRAINT "recipe_versions_recipe_id_fkey";

-- AlterTable
ALTER TABLE "recipe_versions" ADD COLUMN     "cook_time_minutes" INTEGER,
ADD COLUMN     "prep_time_minutes" INTEGER,
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "cuisine" VARCHAR(64) NOT NULL DEFAULT 'vietnamese',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "canonical_name" VARCHAR(180) NOT NULL,
    "category" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" UUID NOT NULL,
    "recipe_version_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "preparation" VARCHAR(255),
    "note" VARCHAR(255),
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_steps" (
    "id" UUID NOT NULL,
    "recipe_version_id" UUID NOT NULL,
    "step_no" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "heat_level" VARCHAR(32),
    "tip" TEXT,

    CONSTRAINT "recipe_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_slug_key" ON "ingredients"("slug");

-- CreateIndex
CREATE INDEX "ingredients_canonical_name_idx" ON "ingredients"("canonical_name");

-- CreateIndex
CREATE INDEX "recipe_ingredients_ingredient_id_idx" ON "recipe_ingredients"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_recipe_version_id_sort_order_key" ON "recipe_ingredients"("recipe_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_steps_recipe_version_id_step_no_key" ON "recipe_steps"("recipe_version_id", "step_no");

-- CreateIndex
CREATE INDEX "recipe_versions_recipe_id_published_at_idx" ON "recipe_versions"("recipe_id", "published_at");

-- CreateIndex
CREATE INDEX "recipes_status_canonical_title_idx" ON "recipes"("status", "canonical_title");

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

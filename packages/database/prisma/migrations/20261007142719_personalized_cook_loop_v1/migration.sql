-- AlterTable
ALTER TABLE "cook_sessions" ADD COLUMN     "personalized_recipe_version_id" UUID;

-- CreateIndex
CREATE INDEX "cook_sessions_personalized_recipe_version_id_idx" ON "cook_sessions"("personalized_recipe_version_id");

-- AddForeignKey
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_personalized_recipe_version_id_fkey" FOREIGN KEY ("personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

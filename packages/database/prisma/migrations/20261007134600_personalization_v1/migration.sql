-- CreateTable
CREATE TABLE "recipe_adjustment_rules" (
    "id" UUID NOT NULL,
    "recipe_version_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "dimension_key" VARCHAR(64) NOT NULL,
    "sensitivity" DECIMAL(6,5) NOT NULL,
    "min_factor" DECIMAL(6,5) NOT NULL DEFAULT 0.75,
    "max_factor" DECIMAL(6,5) NOT NULL DEFAULT 1.25,

    CONSTRAINT "recipe_adjustment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personalized_recipe_versions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "base_recipe_version_id" UUID NOT NULL,
    "taste_profile_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "algorithm_version" VARCHAR(32) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "adjustment_json" JSONB NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personalized_recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_adjustment_rules_recipe_version_id_idx" ON "recipe_adjustment_rules"("recipe_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_adjustment_rules_recipe_version_id_ingredient_id_dim_key" ON "recipe_adjustment_rules"("recipe_version_id", "ingredient_id", "dimension_key");

-- CreateIndex
CREATE INDEX "personalized_recipe_versions_user_id_recipe_id_created_at_idx" ON "personalized_recipe_versions"("user_id", "recipe_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "personalized_recipe_versions_user_id_recipe_id_version_no_key" ON "personalized_recipe_versions"("user_id", "recipe_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "personalized_recipe_versions_user_id_recipe_id_content_hash_key" ON "personalized_recipe_versions"("user_id", "recipe_id", "content_hash");

-- AddForeignKey
ALTER TABLE "recipe_adjustment_rules" ADD CONSTRAINT "recipe_adjustment_rules_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_adjustment_rules" ADD CONSTRAINT "recipe_adjustment_rules_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalized_recipe_versions" ADD CONSTRAINT "personalized_recipe_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalized_recipe_versions" ADD CONSTRAINT "personalized_recipe_versions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalized_recipe_versions" ADD CONSTRAINT "personalized_recipe_versions_base_recipe_version_id_fkey" FOREIGN KEY ("base_recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalized_recipe_versions" ADD CONSTRAINT "personalized_recipe_versions_taste_profile_id_fkey" FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

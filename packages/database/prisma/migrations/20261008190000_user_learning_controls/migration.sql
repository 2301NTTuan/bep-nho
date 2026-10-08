-- Phase 8 is additive. These audits must return no rows before applying the
-- existing uniqueness-backed ownership relationships below:
-- SELECT user_id, algorithm_version, COUNT(*) FROM taste_profiles
-- GROUP BY user_id, algorithm_version HAVING COUNT(*) > 1;
-- SELECT user_id, recipe_id, version_no, COUNT(*) FROM personalized_recipe_versions
-- GROUP BY user_id, recipe_id, version_no HAVING COUNT(*) > 1;
-- SELECT user_id, recipe_id, content_hash, COUNT(*) FROM personalized_recipe_versions
-- GROUP BY user_id, recipe_id, content_hash HAVING COUNT(*) > 1;

CREATE TABLE "taste_control_events" (
    "id" UUID NOT NULL,
    "taste_profile_id" UUID NOT NULL,
    "dimension_key" VARCHAR(64) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "value" DECIMAL(6,5),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taste_control_events_pkey" PRIMARY KEY ("id")
);

-- PostgreSQL's fast constant-default path adds this provenance marker without
-- rewriting the three existing personalized version rows.
ALTER TABLE "personalized_recipe_versions"
ADD COLUMN "origin_type" VARCHAR(24) NOT NULL DEFAULT 'taste_engine',
ADD COLUMN "parent_personalized_recipe_version_id" UUID;

CREATE TABLE "personalized_adjustment_decisions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "source_personalized_recipe_version_id" UUID NOT NULL,
    "result_personalized_recipe_version_id" UUID,
    "ingredient_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "edited_quantity" DECIMAL(10,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personalized_adjustment_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_recipe_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "best_personalized_recipe_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_recipe_preferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "taste_control_events_taste_profile_id_dimension_key_created_at_idx"
ON "taste_control_events"("taste_profile_id", "dimension_key", "created_at");

CREATE INDEX "personalized_recipe_versions_parent_personalized_recipe_version_id_idx"
ON "personalized_recipe_versions"("parent_personalized_recipe_version_id");

CREATE INDEX "personalized_adjustment_decisions_user_id_recipe_id_created_at_idx"
ON "personalized_adjustment_decisions"("user_id", "recipe_id", "created_at");

CREATE INDEX "personalized_adjustment_decisions_source_version_ingredient_created_at_idx"
ON "personalized_adjustment_decisions"("source_personalized_recipe_version_id", "ingredient_id", "created_at");

CREATE UNIQUE INDEX "user_recipe_preferences_user_id_recipe_id_key"
ON "user_recipe_preferences"("user_id", "recipe_id");

CREATE INDEX "user_recipe_preferences_best_personalized_recipe_version_id_idx"
ON "user_recipe_preferences"("best_personalized_recipe_version_id");

ALTER TABLE "taste_control_events"
ADD CONSTRAINT "taste_control_events_taste_profile_id_fkey"
FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "personalized_recipe_versions"
ADD CONSTRAINT "personalized_recipe_versions_parent_version_id_fkey"
FOREIGN KEY ("parent_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "personalized_adjustment_decisions"
ADD CONSTRAINT "personalized_adjustment_decisions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personalized_adjustment_decisions"
ADD CONSTRAINT "personalized_adjustment_decisions_recipe_id_fkey"
FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personalized_adjustment_decisions"
ADD CONSTRAINT "personalized_adjustment_decisions_source_version_id_fkey"
FOREIGN KEY ("source_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "personalized_adjustment_decisions"
ADD CONSTRAINT "personalized_adjustment_decisions_result_version_id_fkey"
FOREIGN KEY ("result_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "personalized_adjustment_decisions"
ADD CONSTRAINT "personalized_adjustment_decisions_ingredient_id_fkey"
FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_recipe_preferences"
ADD CONSTRAINT "user_recipe_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_recipe_preferences"
ADD CONSTRAINT "user_recipe_preferences_recipe_id_fkey"
FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_recipe_preferences"
ADD CONSTRAINT "user_recipe_preferences_best_version_id_fkey"
FOREIGN KEY ("best_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

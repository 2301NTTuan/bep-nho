CREATE TABLE "household_meal_plans" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "household_meal_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "household_meal_plans_monday_check" CHECK (EXTRACT(ISODOW FROM "week_start") = 1)
);

CREATE TABLE "household_meal_plan_entries" (
    "id" UUID NOT NULL,
    "meal_plan_id" UUID NOT NULL,
    "planned_date" DATE NOT NULL,
    "meal_type" VARCHAR(16) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "recipe_id" UUID NOT NULL,
    "recipe_version_id" UUID,
    "household_personalized_recipe_version_id" UUID,
    "servings" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "household_meal_plan_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "household_meal_plan_entries_meal_type_check" CHECK ("meal_type" IN ('breakfast', 'lunch', 'dinner', 'other')),
    CONSTRAINT "household_meal_plan_entries_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "household_meal_plan_entries_servings_check" CHECK ("servings" BETWEEN 1 AND 8),
    CONSTRAINT "household_meal_plan_entries_source_check" CHECK (
      ("recipe_version_id" IS NOT NULL AND "household_personalized_recipe_version_id" IS NULL)
      OR
      ("recipe_version_id" IS NULL AND "household_personalized_recipe_version_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "household_meal_plans_household_id_week_start_key" ON "household_meal_plans"("household_id", "week_start");
CREATE INDEX "household_meal_plans_created_by_user_id_idx" ON "household_meal_plans"("created_by_user_id");
CREATE INDEX "household_meal_plan_entries_plan_date_type_sort_idx" ON "household_meal_plan_entries"("meal_plan_id", "planned_date", "meal_type", "sort_order");
CREATE UNIQUE INDEX "household_meal_plan_entries_single_slot_key" ON "household_meal_plan_entries"("meal_plan_id", "planned_date", "meal_type") WHERE "meal_type" <> 'other';
CREATE INDEX "household_meal_plan_entries_recipe_id_idx" ON "household_meal_plan_entries"("recipe_id");
CREATE INDEX "household_meal_plan_entries_recipe_version_id_idx" ON "household_meal_plan_entries"("recipe_version_id");
CREATE INDEX "household_meal_plan_entries_household_version_id_idx" ON "household_meal_plan_entries"("household_personalized_recipe_version_id");
CREATE INDEX "household_meal_plan_entries_created_by_user_id_idx" ON "household_meal_plan_entries"("created_by_user_id");

ALTER TABLE "household_meal_plans" ADD CONSTRAINT "household_meal_plans_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_meal_plans" ADD CONSTRAINT "household_meal_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "household_meal_plan_entries" ADD CONSTRAINT "household_meal_plan_entries_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "household_meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_meal_plan_entries" ADD CONSTRAINT "household_meal_plan_entries_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_meal_plan_entries" ADD CONSTRAINT "household_meal_plan_entries_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_meal_plan_entries" ADD CONSTRAINT "household_meal_plan_entries_household_version_id_fkey" FOREIGN KEY ("household_personalized_recipe_version_id") REFERENCES "household_personalized_recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_meal_plan_entries" ADD CONSTRAINT "household_meal_plan_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "validate_household_meal_plan_entry"() RETURNS trigger AS $$
DECLARE
  plan_week DATE;
  plan_household UUID;
  source_recipe UUID;
  source_household UUID;
  canonical_published_at TIMESTAMPTZ;
BEGIN
  SELECT "week_start", "household_id" INTO plan_week, plan_household
  FROM "household_meal_plans" WHERE "id" = NEW."meal_plan_id";

  IF NEW."planned_date" < plan_week OR NEW."planned_date" > plan_week + 6 THEN
    RAISE EXCEPTION 'planned_date must fall inside meal plan week' USING ERRCODE = '23514';
  END IF;

  IF NEW."recipe_version_id" IS NOT NULL THEN
    SELECT "recipe_id", "published_at" INTO source_recipe, canonical_published_at
    FROM "recipe_versions" WHERE "id" = NEW."recipe_version_id";
    IF source_recipe IS DISTINCT FROM NEW."recipe_id" OR canonical_published_at IS NULL THEN
      RAISE EXCEPTION 'canonical recipe source is inconsistent' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT "recipe_id", "household_id" INTO source_recipe, source_household
    FROM "household_personalized_recipe_versions"
    WHERE "id" = NEW."household_personalized_recipe_version_id";
    IF source_recipe IS DISTINCT FROM NEW."recipe_id" OR source_household IS DISTINCT FROM plan_household THEN
      RAISE EXCEPTION 'household recipe source is inconsistent' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "household_meal_plan_entry_integrity"
BEFORE INSERT OR UPDATE OF "meal_plan_id", "planned_date", "recipe_id", "recipe_version_id", "household_personalized_recipe_version_id"
ON "household_meal_plan_entries"
FOR EACH ROW EXECUTE FUNCTION "validate_household_meal_plan_entry"();

CREATE TABLE "household_shopping_lists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "household_id" UUID NOT NULL,
  "meal_plan_id" UUID NOT NULL,
  "week_start" DATE NOT NULL,
  "version_no" INTEGER NOT NULL,
  "algorithm_version" VARCHAR(32) NOT NULL,
  "input_hash" CHAR(64) NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "summary_json" JSONB NOT NULL,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "household_shopping_lists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "household_shopping_lists_week_monday_check" CHECK (EXTRACT(ISODOW FROM "week_start") = 1),
  CONSTRAINT "household_shopping_lists_version_check" CHECK ("version_no" >= 1),
  CONSTRAINT "household_shopping_lists_algorithm_check" CHECK ("algorithm_version" = 'shopping-requirements-v1')
);

CREATE TABLE "household_shopping_list_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shopping_list_id" UUID NOT NULL,
  "ingredient_id" UUID NOT NULL,
  "unit" VARCHAR(32) NOT NULL,
  "required_quantity" DECIMAL(12,3) NOT NULL,
  "pantry_quantity_applied" DECIMAL(12,3) NOT NULL,
  "missing_quantity" DECIMAL(12,3) NOT NULL,
  "pantry_unit" VARCHAR(32),
  "unit_matches" BOOLEAN NOT NULL,
  "source_entry_count" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "household_shopping_list_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "household_shopping_list_items_unit_check" CHECK (length(btrim("unit")) > 0),
  CONSTRAINT "household_shopping_list_items_quantity_check" CHECK (
    "required_quantity" > 0 AND
    "pantry_quantity_applied" >= 0 AND
    "missing_quantity" > 0 AND
    "pantry_quantity_applied" <= "required_quantity" AND
    "missing_quantity" = "required_quantity" - "pantry_quantity_applied"
  ),
  CONSTRAINT "household_shopping_list_items_source_count_check" CHECK ("source_entry_count" >= 1),
  CONSTRAINT "household_shopping_list_items_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX "household_shopping_lists_household_week_version_key"
ON "household_shopping_lists"("household_id", "week_start", "version_no");
CREATE UNIQUE INDEX "household_shopping_lists_household_week_content_key"
ON "household_shopping_lists"("household_id", "week_start", "content_hash");
CREATE INDEX "household_shopping_lists_meal_plan_id_idx" ON "household_shopping_lists"("meal_plan_id");
CREATE INDEX "household_shopping_lists_created_by_user_id_idx" ON "household_shopping_lists"("created_by_user_id");
CREATE UNIQUE INDEX "household_shopping_list_items_list_sort_key"
ON "household_shopping_list_items"("shopping_list_id", "sort_order");
CREATE INDEX "household_shopping_list_items_ingredient_id_idx" ON "household_shopping_list_items"("ingredient_id");

ALTER TABLE "household_shopping_lists"
ADD CONSTRAINT "household_shopping_lists_household_id_fkey"
FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_shopping_lists"
ADD CONSTRAINT "household_shopping_lists_meal_plan_id_fkey"
FOREIGN KEY ("meal_plan_id") REFERENCES "household_meal_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_shopping_lists"
ADD CONSTRAINT "household_shopping_lists_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "household_shopping_list_items"
ADD CONSTRAINT "household_shopping_list_items_shopping_list_id_fkey"
FOREIGN KEY ("shopping_list_id") REFERENCES "household_shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_shopping_list_items"
ADD CONSTRAINT "household_shopping_list_items_ingredient_id_fkey"
FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

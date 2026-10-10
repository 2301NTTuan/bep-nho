CREATE TABLE "household_pantry_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "household_id" UUID NOT NULL,
  "ingredient_id" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit" VARCHAR(32) NOT NULL,
  "best_before_date" DATE,
  "note" VARCHAR(500),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_by_user_id" UUID,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "household_pantry_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "household_pantry_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "household_pantry_items_unit_check" CHECK (length(btrim("unit")) > 0),
  CONSTRAINT "household_pantry_items_revision_check" CHECK ("revision" >= 1)
);

CREATE UNIQUE INDEX "household_pantry_items_household_id_ingredient_id_key"
ON "household_pantry_items"("household_id", "ingredient_id");
CREATE INDEX "household_pantry_items_created_by_user_id_idx"
ON "household_pantry_items"("created_by_user_id");
CREATE INDEX "household_pantry_items_updated_by_user_id_idx"
ON "household_pantry_items"("updated_by_user_id");

ALTER TABLE "household_pantry_items"
ADD CONSTRAINT "household_pantry_items_household_id_fkey"
FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_pantry_items"
ADD CONSTRAINT "household_pantry_items_ingredient_id_fkey"
FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_pantry_items"
ADD CONSTRAINT "household_pantry_items_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "household_pantry_items"
ADD CONSTRAINT "household_pantry_items_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Additive serving-scaling metadata. Defaults preserve the behavior of all
-- existing recipe ingredients without rewriting historical recipe versions.
ALTER TABLE "recipe_ingredients"
ADD COLUMN "scaling_mode" VARCHAR(16) NOT NULL DEFAULT 'LINEAR',
ADD COLUMN "scaling_exponent" DECIMAL(4,3) NOT NULL DEFAULT 1,
ADD COLUMN "rounding_increment" DECIMAL(10,3);

-- Nullable by design: existing CookSessions remain untouched and are served
-- through the temporary exact-version legacy fallback.
ALTER TABLE "cook_sessions"
ADD COLUMN "snapshot_json" JSONB;

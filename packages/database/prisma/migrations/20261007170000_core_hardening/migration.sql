-- The pre-migration audit must return no rows:
-- SELECT user_id, algorithm_version, COUNT(*)
-- FROM taste_profiles
-- GROUP BY user_id, algorithm_version
-- HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX "taste_profiles_user_id_algorithm_version_key"
ON "taste_profiles"("user_id", "algorithm_version");

ALTER TABLE "taste_signals"
ADD COLUMN "cook_feedback_id" UUID;

CREATE INDEX "taste_signals_cook_feedback_id_idx"
ON "taste_signals"("cook_feedback_id");

ALTER TABLE "taste_signals"
ADD CONSTRAINT "taste_signals_cook_feedback_id_fkey"
FOREIGN KEY ("cook_feedback_id")
REFERENCES "cook_feedback"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

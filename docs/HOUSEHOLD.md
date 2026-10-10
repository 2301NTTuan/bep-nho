# Household and Family Taste V1

Phase 12 supports exactly one active household membership per user and at most eight members per household. PostgreSQL enforces a unique `user_id`, a unique household/user pair, and at most one owner row per household. Application transactions preserve the required owner for every active household.

Owners can rename the household, create invitations, and remove another member. Members can read the household and Family Taste, create household recipe versions, start CookSessions from them, and leave. Owners cannot remove themselves or leave; Phase 12 has no public owner-transfer endpoint.

Invitations use 32 random bytes encoded as base64url. Only the SHA-256 hash is stored. The raw token is returned once, expires after seven days, and is conditionally consumed in the same household-locked transaction that creates membership. The lock also caps the household at eight members and makes concurrent token use single-winner.

For each supported dimension and member, a manual override supplies its value at confidence 1; otherwise the learned score and confidence are used. Missing evidence has confidence 0. Family score is `sum(score * confidence) / sum(confidence)`, or zero if the denominator is zero. Family confidence is `sum(confidence) / active member count`. Scores and confidences are clamped to their existing domains. The API returns only aggregate values and counts, never another member's signals, feedback, notes, or history.

`family-personalize-v1` applies the existing rule threshold, sensitivity, and factor clamps to the latest published canonical version. It stores immutable `HouseholdPersonalizedRecipeVersion` rows. The hash contains effective cooking output and excludes member IDs, evidence counters, timestamps, and raw Taste data, so unchanged cooking output reuses the existing row.

CookSessions retain canonical and household-version provenance plus an immutable effective snapshot. New family sessions require current membership and a currently published recipe. Leaving or removal blocks new family operations but does not invalidate an existing session. Feedback belongs to the individual cook and updates only that user's personal `taste-v1` profile; Family Taste changes on its next computation.

Lock order is narrow and consistent:

1. Recipe publication/status lock.
2. Household lock for family generation or membership validation.

Account deletion uses account-lifecycle lock followed by household lock. Deleting a normal member removes only that membership. Deleting an owner promotes the oldest remaining `joinedAt`, with stable member ID as tie-break; a last-owner household is closed. Household recipe history remains.

Migration `20261010150000_household_family_taste_v1` is additive migration 11. Never rewrite it or earlier migrations, and never use `prisma migrate reset` on shared data.

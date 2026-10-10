# Household shopping requirements

Phase 14C1 provides the deterministic backend core for a household weekly shopping list. It does not include the shopping web UI, checked/purchased state, pantry consumption, or unit conversion.

## Calculation pipeline

For an existing Monday-based household meal plan, `shopping-requirements-v1` follows one fixed pipeline:

1. Read each meal-plan entry and its exact immutable source: the referenced canonical `RecipeVersion` or `HouseholdPersonalizedRecipeVersion`.
2. Scale every exact source ingredient to `HouseholdMealPlanEntry.servings` with the shared Cook Mode rules: LINEAR, CONSERVATIVE, FIXED, personalization factor, then the configured or unit-default rounding increment.
3. Aggregate only rows with the same canonical Ingredient ID and exact trimmed unit string.
4. Subtract the household pantry quantity once from an aggregate only when both Ingredient ID and unit match exactly.
5. Clamp missing quantity at zero and return only positive-missing lines by default. Summary counts still include fully covered lines.

There is **no unit conversion**. A pantry row of `1 kg` does not reduce a requirement of `500 g`; the result keeps `500 g` missing, applies zero pantry quantity, and reports the `kg` mismatch. Units are never lowercased, translated, alias-mapped, or inferred.

## Exact provenance and archive behavior

Canonical entries use the exact referenced `RecipeVersion`, including its ingredient quantities and scaling metadata. Household entries use the exact referenced household snapshot over its exact base version. Shopping never switches to the latest canonical or Family Taste version and never creates a recipe version. A recipe archived after being placed on a plan remains calculable from its historical exact source.

Malformed immutable household snapshots produce a controlled server error; calculation never silently falls back to newer canonical content or repairs history.

## Preview, hashes, and generation

`GET /v1/me/household/meal-plans/:weekStart/shopping-requirements` is read-only and returns the algorithm version, week, deterministic `inputHash`, summary, and positive-missing items. A missing plan returns 404. An empty plan returns a deterministic empty preview.

`inputHash` represents material calculation assumptions: algorithm, household/plan/week, canonical entry tuples, exact source IDs, servings/effective scaling inputs, and relevant pantry quantity/unit/revision. It excludes timestamps, notes, creator/updater IDs, requests, sessions, and natural database order.

`POST /v1/me/household/meal-plans/:weekStart/shopping-list` accepts only `expectedInputHash`. Under the household lock it rechecks current active membership, rereads plan and pantry, recomputes, and returns 409 when the preview is stale. It trusts no client quantities. Empty requirements are a deliberate non-persisted no-op.

`contentHash` represents canonical effective requirement lines. Equal content reuses one immutable snapshot for the household/week; changed content creates the next `versionNo`. `GET .../:weekStart/shopping-list/latest` and `GET /v1/me/household/shopping-lists/:shoppingListId` read immutable snapshots using current membership authorization.

## Locking, privacy, and lifecycle

Generation lock order is household advisory lock, membership recheck, exact plan reread, pantry reread, calculation, then snapshot create/reuse. It does not acquire recipe publication locks because referenced recipe data is immutable, and no path adds a household-lock-to-recipe-lock edge.

Removed members immediately lose preview, generation, and read access. Historical creator IDs never grant access. User deletion sets shopping-list creator provenance to null and preserves shared lists. API output omits user IDs, pantry notes, Taste evidence, feedback, and internal lock identifiers.

Generation is read-only with respect to meal plans, pantry, Taste, CookSessions, Family Taste, and recipe versions. Later Phase 14C2 work may add the shopping web experience; it must retain these exact calculation and stale-preview boundaries.

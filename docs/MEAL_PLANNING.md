# Household meal planning

Phase 13 adds a household-scoped weekly planner. It intentionally stops before pantry and shopping-list features.

## Calendar and storage

`HouseholdMealPlan.weekStart` and `HouseholdMealPlanEntry.plannedDate` use PostgreSQL `DATE` values and canonical API strings in `YYYY-MM-DD` form. Weeks begin on Monday. A database check requires Monday `weekStart`, and an entry trigger requires every planned date to fall from `weekStart` through `weekStart + 6 days`.

Each household has at most one plan per week. Breakfast, lunch, and dinner each allow one entry per date; `other` allows multiple entries ordered by `sortOrder`. Servings are limited to 1–8. Each entry references exactly one published canonical `RecipeVersion` or an immutable `HouseholdPersonalizedRecipeVersion` owned by the same household. Creator links use `ON DELETE SET NULL`, so account deletion preserves shared plans and entries.

## Authorization and archive behavior

Every read, manual mutation, preview, and apply derives the household from the authenticated user's current membership. A historical creator ID never grants access. Removed members and foreign household/week identifiers receive the existing owner-scoped 404 behavior. Mutations also require an active household.

New or replacement recipe sources require the recipe to be published under the recipe publication lock. Archiving never removes historical plan entries, their recipe provenance, CookSessions, feedback, or Taste data. An archived historical entry remains readable and may retain its source while its date, slot, servings, or note is edited; it cannot be selected as a new source.

## Deterministic family suggestions

`family-meal-plan-v1` operates only on explicitly requested empty lunch and dinner slots of an existing plan. It never suggests breakfast or `other`, never creates a plan, uses no randomness or LLM, and never accepts client-selected recipe, household, user, Taste, or algorithm identifiers.

Recipe selection uses this lexicographic order:

1. prefer recipes not already used in the current week or earlier generated slots;
2. prefer a lower occurrence count in the previous four calendar meal-plan weeks, excluding the current week;
3. avoid the same recipe on an adjacent calendar day when the higher-priority criteria are equal;
4. compare SHA-256 of `family-meal-plan-v1|householdId|weekStart|plannedDate|mealType|recipeId`.

Requested slots are canonicalized by date, then lunch before dinner. A recipe is not repeated until every eligible published candidate has been used once. Taste DNA does not rank dish preference: the repository has no reliable preference score for that claim. After diversity/history selects a dish, `family-personalize-v1` creates or reuses the exact immutable Family Taste cooking version for that recipe.

## Preview, hash, and apply

Preview does not write meal-plan entries. It may create or reuse immutable household recipe versions. Its SHA-256 `suggestionHash` covers the algorithm, household, week, canonical slot set, material current plan tuples, every published candidate and latest canonical base, four-week counts, selected recipe IDs, and selected exact household-version IDs. It excludes timestamps, request/session data, database ordering, and unrelated `other` note or `sortOrder` values.

Apply trusts only the slot set and expected hash. It recomputes all assumptions and either inserts every suggested entry in one PostgreSQL transaction or inserts none. A changed relevant slot, recipe publication/latest base, effective Family Taste version, membership, or wrong hash returns 409. The web discards the stale hash, reloads server state, preserves only still-empty selected slots, and asks the user to preview again; it never retries or overwrites automatically.

## Lock order and concurrency

Any operation involving recipes follows one global order:

1. unique recipe publication/status locks, sorted lexicographically for multi-recipe apply;
2. household lock;
3. meal-plan mutation.

Plan creation and member/account lifecycle operations that do not need recipe state take only the household lock. Database uniqueness protects one plan per week and the three single-entry slots. Deterministic barrier tests cover archive versus manual entry, archive between preview/apply, concurrent identical apply, and membership removal; concurrent manual writes to one slot resolve as one success and one controlled 409.

## Web experience

`/household/meal-plan` defaults to the current Monday-based week, supports previous/current/next navigation, and renders seven responsive day cards with Sáng, Trưa, Tối, and Khác sections. Manual mutations reload authoritative server state. The published recipe picker submits the exact latest published `RecipeVersion.id`. Existing Family Taste and historical canonical sources remain unchanged unless the user explicitly chooses another canonical recipe.

Suggestions are selected only from empty lunch/dinner checkboxes. Preview copy states that diversity and history choose dishes while Family Taste adjusts the selected recipes. The suggestion hash stays only in component memory. Navigation/reload discards preview state, stale asynchronous week loads are ignored, and membership loss directs the user back to the household page.

## Remaining scope

Pantry inventory, shopping lists, nutrition/calorie scoring, breakfast recommendation, automatic substitution, recurring/copy-week planning, drag-and-drop, and realtime collaboration are not implemented. They require a separately approved later phase.

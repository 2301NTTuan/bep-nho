import { createHash } from 'node:crypto';
import {
  FAMILY_MEAL_PLAN_ALGORITHM_VERSION,
  canonicalizeFamilyMealPlanSlots,
  selectFamilyMealPlanRecipes,
  type FamilyMealPlanSlot,
} from '@bep-nho/domain';

const householdId = '00000000-0000-4000-8000-000000000001';
const weekStart = '2026-10-12';
const tieBreak = (slot: FamilyMealPlanSlot, recipeId: string) => createHash('sha256').update([
  FAMILY_MEAL_PLAN_ALGORITHM_VERSION, householdId, weekStart,
  slot.plannedDate, slot.mealType, recipeId,
].join('|')).digest('hex');

describe('family-meal-plan-v1 deterministic selection', () => {
  const slots: FamilyMealPlanSlot[] = [
    { plannedDate: '2026-10-13', mealType: 'dinner' },
    { plannedDate: '2026-10-12', mealType: 'lunch' },
    { plannedDate: '2026-10-13', mealType: 'lunch' },
  ];
  const candidates = [
    { recipeId: '00000000-0000-4000-8000-00000000000a', recentUseCount: 0 },
    { recipeId: '00000000-0000-4000-8000-00000000000b', recentUseCount: 0 },
    { recipeId: '00000000-0000-4000-8000-00000000000c', recentUseCount: 0 },
  ];

  const select = (requestedSlots = slots, existing: Array<{ plannedDate: string; recipeId: string }> = []) =>
    selectFamilyMealPlanRecipes({
      householdId, weekStart, slots: requestedSlots, candidates,
      currentWeekEntries: existing, tieBreak,
    });

  it('canonicalizes slot order and produces the exact same output for the same effective input', () => {
    expect(canonicalizeFamilyMealPlanSlots(slots)).toEqual([
      { plannedDate: '2026-10-12', mealType: 'lunch' },
      { plannedDate: '2026-10-13', mealType: 'lunch' },
      { plannedDate: '2026-10-13', mealType: 'dinner' },
    ]);
    expect(select(slots)).toEqual(select([...slots].reverse()));
    expect(select(slots)).toEqual(select(slots));
  });

  it('does not repeat a recipe until every eligible candidate has been selected', () => {
    const four = select([...slots, { plannedDate: '2026-10-14', mealType: 'lunch' }]);
    expect(new Set(four.slice(0, 3).map((selection) => selection.recipeId)).size).toBe(3);
    expect(new Set(four.map((selection) => selection.recipeId)).size).toBe(3);

    const thirteen = Array.from({ length: 13 }, (_, index) => ({
      recipeId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      recentUseCount: 0,
    }));
    const fourteenSlots = Array.from({ length: 14 }, (_, index) => ({
      plannedDate: `2026-10-${String(12 + Math.floor(index / 2)).padStart(2, '0')}`,
      mealType: index % 2 === 0 ? 'lunch' as const : 'dinner' as const,
    }));
    const fourteen = selectFamilyMealPlanRecipes({
      householdId, weekStart, slots: fourteenSlots, candidates: thirteen,
      currentWeekEntries: [], tieBreak,
    });
    expect(new Set(fourteen.slice(0, 13).map((selection) => selection.recipeId)).size).toBe(13);
    expect(new Set(fourteen.map((selection) => selection.recipeId)).size).toBe(13);
  });

  it('deprioritizes a recipe already present this week', () => {
    const firstWithoutManual = select([slots[0]])[0];
    const changed = select([slots[0]], [{ plannedDate: '2026-10-12', recipeId: firstWithoutManual.recipeId }])[0];
    expect(changed.recipeId).not.toBe(firstWithoutManual.recipeId);
    expect(changed.alreadyUsedThisWeek).toBe(false);
  });

  it('uses lower recent occurrence count before adjacency and the SHA-256 tie-break last', () => {
    const slot = { plannedDate: '2026-10-13', mealType: 'dinner' } as const;
    const result = selectFamilyMealPlanRecipes({
      householdId, weekStart, slots: [slot], tieBreak,
      currentWeekEntries: [],
      candidates: [
        { recipeId: candidates[0].recipeId, recentUseCount: 2 },
        { recipeId: candidates[1].recipeId, recentUseCount: 0 },
      ],
    });
    expect(result[0].recipeId).toBe(candidates[1].recipeId);
    const equal = select([slot])[0];
    expect(equal.deterministicTieBreak).toBe(tieBreak(slot, equal.recipeId));
    expect(equal.recipeId).toBe([...candidates]
      .sort((left, right) => tieBreak(slot, left.recipeId).localeCompare(tieBreak(slot, right.recipeId)))[0].recipeId);
  });

  it('avoids an adjacent-day repeat when an otherwise equal alternative exists', () => {
    const slot = { plannedDate: '2026-10-13', mealType: 'lunch' } as const;
    const adjacentRecipe = candidates[0].recipeId;
    const result = selectFamilyMealPlanRecipes({
      householdId, weekStart, slots: [slot], tieBreak,
      currentWeekEntries: [
        { plannedDate: '2026-10-12', recipeId: adjacentRecipe },
        { plannedDate: '2026-10-15', recipeId: candidates[1].recipeId },
      ],
      candidates: candidates.slice(0, 2),
    });
    expect(result[0].recipeId).toBe(candidates[1].recipeId);
  });
});

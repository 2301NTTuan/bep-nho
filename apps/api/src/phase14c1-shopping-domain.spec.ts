import { scaleEffectiveIngredient, scaleIngredientQuantity } from '@bep-nho/domain';

describe('Phase 14C1 shared Cook Mode ingredient scaling', () => {
  const base = {
    ingredientId: 'ingredient-a', slug: 'ingredient-a', name: 'Ingredient A', category: null,
    quantity: 10, unit: 'ml', sortOrder: 0, scalingMode: 'CONSERVATIVE',
    scalingExponent: 0.75, roundingIncrement: 1,
  };

  it('preserves LINEAR, CONSERVATIVE, FIXED, personalization, and rounding behavior', () => {
    expect(scaleEffectiveIngredient({ ...base, scalingMode: 'LINEAR' }, null, 2, 4).quantity).toBe(20);
    expect(scaleEffectiveIngredient(base, null, 2, 4).quantity).toBe(17);
    expect(scaleEffectiveIngredient({ ...base, scalingMode: 'FIXED' }, null, 2, 8).quantity).toBe(10);
    expect(scaleEffectiveIngredient(base, {
      baseQuantity: 10, quantity: 12, personalizationFactor: 1.2,
      unit: 'ml', roundingIncrement: 1,
    }, 2, 4).quantity).toBe(20);
    expect(scaleEffectiveIngredient({ ...base, quantity: 3, unit: 'quả', scalingMode: 'LINEAR', roundingIncrement: 0.5 }, null, 2, 1).quantity).toBe(1.5);
  });

  it('is an exact regression wrapper around Cook Mode scaling order', () => {
    const effective = scaleEffectiveIngredient(base, {
      baseQuantity: 10,
      quantity: 9,
      personalizationFactor: 0.9,
      unit: 'ml',
      scalingMode: 'CONSERVATIVE',
      scalingExponent: 0.75,
      roundingIncrement: 1,
    }, 2, 5);
    expect(effective).toMatchObject(scaleIngredientQuantity(base, 2, 5, 0.9));
    expect(effective.unit).toBe('ml');
  });
});

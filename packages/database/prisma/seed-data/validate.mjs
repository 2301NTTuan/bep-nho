export const SUPPORTED_UNITS = new Set([
  'g', 'ml', 'quả', 'củ', 'tép', 'nhánh', 'muỗng canh',
  'muỗng cà phê', 'trái', 'miếng', 'bó',
]);

const SCALING_MODES = new Set(['LINEAR', 'CONSERVATIVE', 'FIXED']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateRecipes(recipes) {
  const errors = [];
  const slugs = new Set();

  for (const recipe of recipes) {
    if (!SLUG_PATTERN.test(recipe.slug)) errors.push(`${recipe.slug}: invalid slug`);
    if (slugs.has(recipe.slug)) errors.push(`${recipe.slug}: duplicate slug`);
    slugs.add(recipe.slug);
    if (!Number.isInteger(recipe.version) || recipe.version < 1) errors.push(`${recipe.slug}: invalid version`);
    if (!Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 8) errors.push(`${recipe.slug}: invalid servings`);
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) errors.push(`${recipe.slug}: ingredients required`);
    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) errors.push(`${recipe.slug}: steps required`);

    const ingredientSlugs = new Set();
    recipe.ingredients.forEach((ingredient, index) => {
      const prefix = `${recipe.slug}: ingredient ${index + 1}`;
      if (ingredientSlugs.has(ingredient.slug)) errors.push(`${prefix}: duplicate ingredient slug`);
      ingredientSlugs.add(ingredient.slug);
      if (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 0) errors.push(`${prefix}: invalid quantity`);
      if (!SUPPORTED_UNITS.has(ingredient.unit)) errors.push(`${prefix}: unsupported unit '${ingredient.unit}'`);
      if (!SCALING_MODES.has(ingredient.scalingMode)) errors.push(`${prefix}: invalid scaling mode`);
      if (!Number.isFinite(ingredient.scalingExponent) || ingredient.scalingExponent <= 0 || ingredient.scalingExponent > 1) errors.push(`${prefix}: invalid scaling exponent`);
      if (!Number.isFinite(ingredient.roundingIncrement) || ingredient.roundingIncrement <= 0) errors.push(`${prefix}: invalid rounding increment`);
      for (const adjustment of ingredient.adjustments ?? []) {
        if (!adjustment.dimensionKey) errors.push(`${prefix}: adjustment dimension required`);
        if (adjustment.minFactor <= 0 || adjustment.maxFactor < adjustment.minFactor) errors.push(`${prefix}: invalid adjustment bounds`);
      }
    });

    const stepNumbers = recipe.steps.map((step) => step.stepNo);
    if (new Set(stepNumbers).size !== recipe.steps.length) errors.push(`${recipe.slug}: duplicate step number`);
    recipe.steps.forEach((step, index) => {
      if (step.stepNo !== index + 1) errors.push(`${recipe.slug}: steps must be ordered from 1`);
      if (!step.instruction?.trim()) errors.push(`${recipe.slug}: step ${index + 1} instruction required`);
      if (step.durationSeconds !== null && (!Number.isInteger(step.durationSeconds) || step.durationSeconds <= 0)) errors.push(`${recipe.slug}: step ${index + 1} invalid duration`);
    });
  }

  if (errors.length > 0) {
    throw new Error(`Invalid alpha recipe data:\n${errors.join('\n')}`);
  }

  return { recipeCount: recipes.length, slugs: [...slugs].sort() };
}

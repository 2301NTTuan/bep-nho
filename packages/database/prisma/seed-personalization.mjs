import { PrismaClient } from '@prisma/client';
import { alphaRecipes } from './seed-data/recipes/index.mjs';
import { validateRecipes } from './seed-data/validate.mjs';

const prisma = new PrismaClient();

async function main() {
  validateRecipes(alphaRecipes);
  const expected = alphaRecipes.reduce(
    (count, recipe) => count + recipe.ingredients.reduce(
      (recipeCount, ingredient) => recipeCount + (ingredient.adjustments?.length ?? 0),
      0,
    ),
    0,
  );
  const actual = await prisma.recipeAdjustmentRule.count({
    where: {
      recipeVersion: {
        OR: alphaRecipes.map((recipe) => ({
          recipe: { slug: recipe.slug },
          versionNo: recipe.version,
        })),
      },
    },
  });
  if (actual !== expected) throw new Error(`Expected ${expected} alpha adjustment rules, found ${actual}`);

  const versions = await prisma.recipeVersion.findMany({
    where: {
      OR: alphaRecipes.map((recipe) => ({
        recipe: { slug: recipe.slug },
        versionNo: recipe.version,
      })),
    },
    include: {
      recipe: true,
      ingredients: { orderBy: { sortOrder: 'asc' } },
      steps: { orderBy: { stepNo: 'asc' } },
      adjustmentRules: true,
    },
  });

  for (const expectedRecipe of alphaRecipes) {
    const version = versions.find((item) => item.recipe.slug === expectedRecipe.slug && item.versionNo === expectedRecipe.version);
    if (!version || !version.publishedAt || version.recipe.status !== 'published') {
      throw new Error(`${expectedRecipe.slug} V${expectedRecipe.version} is not published`);
    }
    if (version.ingredients.length !== expectedRecipe.ingredients.length || version.steps.length !== expectedRecipe.steps.length) {
      throw new Error(`${expectedRecipe.slug} V${expectedRecipe.version} has incomplete seeded content`);
    }
    version.ingredients.forEach((ingredient, index) => {
      if (ingredient.sortOrder !== index + 1) throw new Error(`${expectedRecipe.slug}: non-deterministic ingredient ordering`);
    });
    const ingredientIds = new Set(version.ingredients.map((ingredient) => ingredient.ingredientId));
    if (version.adjustmentRules.some((rule) => !ingredientIds.has(rule.ingredientId))) {
      throw new Error(`${expectedRecipe.slug}: adjustment rule references a foreign ingredient`);
    }
  }

  console.log(JSON.stringify({
    seed: 'alpha-seed-validation',
    recipes: versions.length,
    rules: actual,
    published: versions.filter((version) => version.publishedAt !== null).length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

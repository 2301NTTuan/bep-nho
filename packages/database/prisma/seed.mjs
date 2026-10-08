import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { alphaRecipes } from './seed-data/recipes/index.mjs';
import { validateRecipes } from './seed-data/validate.mjs';

const prisma = new PrismaClient();

function makeHash(recipe) {
  // Title and cuisine deliberately belong to the immutable version identity.
  return createHash('sha256')
    .update(JSON.stringify({ ...recipe, cuisine: 'vietnamese' }))
    .digest('hex');
}

async function seedRecipe(recipeData) {
  const contentHash = makeHash(recipeData);

  return prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.upsert({
      where: { slug: recipeData.slug },
      update: { canonicalTitle: recipeData.title, cuisine: 'vietnamese', status: 'published' },
      create: { slug: recipeData.slug, canonicalTitle: recipeData.title, cuisine: 'vietnamese', status: 'published' },
    });

    const existing = await tx.recipeVersion.findUnique({
      where: {
        recipeId_versionNo: { recipeId: recipe.id, versionNo: recipeData.version },
      },
    });
    if (existing) {
      if (existing.contentHash !== contentHash) {
        throw new Error(
          `${recipeData.slug} V${recipeData.version} already exists with different content; publish a new version instead of rewriting history`,
        );
      }
      return { slug: recipeData.slug, version: recipeData.version, action: 'verified' };
    }

    const ingredientIds = new Map();
    for (const item of recipeData.ingredients) {
      const ingredient = await tx.ingredient.upsert({
        where: { slug: item.slug },
        update: { canonicalName: item.name, category: item.category },
        create: { slug: item.slug, canonicalName: item.name, category: item.category },
      });
      ingredientIds.set(item.slug, ingredient.id);
    }

    const version = await tx.recipeVersion.create({
      data: {
        recipeId: recipe.id,
        versionNo: recipeData.version,
        servings: recipeData.servings,
        prepTimeMinutes: recipeData.prepTimeMinutes,
        cookTimeMinutes: recipeData.cookTimeMinutes,
        summary: recipeData.summary,
        contentHash,
        publishedAt: new Date(),
      },
    });

    await tx.recipeIngredient.createMany({
      data: recipeData.ingredients.map((item, index) => ({
        recipeVersionId: version.id,
        ingredientId: ingredientIds.get(item.slug),
        quantity: item.quantity,
        unit: item.unit,
        preparation: item.preparation,
        note: item.note,
        sortOrder: index + 1,
        scalingMode: item.scalingMode,
        scalingExponent: item.scalingExponent,
        roundingIncrement: item.roundingIncrement,
      })),
    });
    await tx.recipeStep.createMany({
      data: recipeData.steps.map((step) => ({
        recipeVersionId: version.id,
        stepNo: step.stepNo,
        instruction: step.instruction,
        durationSeconds: step.durationSeconds,
        heatLevel: step.heatLevel,
        tip: step.tip,
      })),
    });

    const rules = recipeData.ingredients.flatMap((item) =>
      (item.adjustments ?? []).map((rule) => ({
        recipeVersionId: version.id,
        ingredientId: ingredientIds.get(item.slug),
        dimensionKey: rule.dimensionKey,
        sensitivity: rule.sensitivity,
        minFactor: rule.minFactor,
        maxFactor: rule.maxFactor,
      })),
    );
    if (rules.length > 0) await tx.recipeAdjustmentRule.createMany({ data: rules });

    return { slug: recipeData.slug, version: recipeData.version, action: 'created' };
  });
}

async function main() {
  validateRecipes(alphaRecipes);
  await prisma.user.upsert({
    where: { authSubject: 'dev-local-user' },
    update: { status: 'active', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
    create: { authSubject: 'dev-local-user', status: 'active', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
  });

  const results = [];
  for (const recipe of alphaRecipes) results.push(await seedRecipe(recipe));
  console.log(JSON.stringify({ seed: 'alpha-recipes-v1', recipes: results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

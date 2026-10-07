import {
  PrismaClient,
} from '@prisma/client';

const prisma =
  new PrismaClient();

async function main() {
  const recipe =
    await prisma.recipe.findUnique({
      where: {
        slug:
          'trung-chien-thit-bam',
      },

      include: {
        versions: {
          where: {
            versionNo: 1,
          },

          take: 1,
        },
      },
    });

  if (
    !recipe ||
    !recipe.versions[0]
  ) {
    throw new Error(
      'Base recipe V1 not found',
    );
  }

  const version =
    recipe.versions[0];

  const nuocMam =
    await prisma.ingredient
      .findUnique({
        where: {
          slug: 'nuoc-mam',
        },
      });

  const hanhLa =
    await prisma.ingredient
      .findUnique({
        where: {
          slug: 'hanh-la',
        },
      });

  if (!nuocMam || !hanhLa) {
    throw new Error(
      'Required ingredients missing',
    );
  }

  const rules = [
    {
      ingredient:
        nuocMam,

      dimensionKey:
        'saltiness',

      sensitivity:
        0.30,

      minFactor:
        0.70,

      maxFactor:
        1.20,
    },

    {
      ingredient:
        hanhLa,

      dimensionKey:
        'garlic_onion',

      sensitivity:
        0.40,

      minFactor:
        0.80,

      maxFactor:
        1.30,
    },
  ];

  for (const rule of rules) {
    await prisma
      .recipeAdjustmentRule
      .upsert({
        where: {
          recipeVersionId_ingredientId_dimensionKey:
            {
              recipeVersionId:
                version.id,

              ingredientId:
                rule.ingredient.id,

              dimensionKey:
                rule.dimensionKey,
            },
        },

        update: {
          sensitivity:
            rule.sensitivity,

          minFactor:
            rule.minFactor,

          maxFactor:
            rule.maxFactor,
        },

        create: {
          recipeVersionId:
            version.id,

          ingredientId:
            rule.ingredient.id,

          dimensionKey:
            rule.dimensionKey,

          sensitivity:
            rule.sensitivity,

          minFactor:
            rule.minFactor,

          maxFactor:
            rule.maxFactor,
        },
      });
  }

  console.log(
    JSON.stringify(
      {
        seed:
          'personalization-rules-v1',

        recipe:
          recipe.slug,

        rules:
          rules.map(
            (rule) => ({
              ingredient:
                rule.ingredient.slug,

              dimension:
                rule.dimensionKey,

              sensitivity:
                rule.sensitivity,

              minFactor:
                rule.minFactor,

              maxFactor:
                rule.maxFactor,
            }),
          ),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

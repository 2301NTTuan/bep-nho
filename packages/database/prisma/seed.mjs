import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const recipeData = {
  slug: 'trung-chien-thit-bam',
  title: 'Trứng chiên thịt băm',

  servings: 2,
  prepTimeMinutes: 10,
  cookTimeMinutes: 10,

  summary:
    'Development fixture cho Recipe Domain của Bếp Nhớ. ' +
    'Cần culinary review trước khi dùng làm nội dung production.',

  ingredients: [
    {
      slug: 'trung-ga',
      name: 'Trứng gà',
      category: 'protein',
      quantity: 3,
      unit: 'quả',
      preparation: null,
    },
    {
      slug: 'thit-heo-bam',
      name: 'Thịt heo băm',
      category: 'protein',
      quantity: 100,
      unit: 'g',
      preparation: null,
    },
    {
      slug: 'nuoc-mam',
      name: 'Nước mắm',
      category: 'seasoning',
      quantity: 8,
      unit: 'ml',
      preparation: null,
    },
    {
      slug: 'hanh-la',
      name: 'Hành lá',
      category: 'vegetable',
      quantity: 15,
      unit: 'g',
      preparation: 'thái nhỏ',
    },
    {
      slug: 'dau-an',
      name: 'Dầu ăn',
      category: 'fat',
      quantity: 10,
      unit: 'ml',
      preparation: null,
    },
    {
      slug: 'tieu-den',
      name: 'Tiêu đen',
      category: 'seasoning',
      quantity: 0.5,
      unit: 'g',
      preparation: 'xay',
    },
  ],

  steps: [
    {
      instruction:
        'Đập trứng vào tô, cho thịt băm, nước mắm, hành lá và tiêu rồi trộn đều.',
      durationSeconds: 120,
      heatLevel: null,
      tip: 'Trộn vừa đều, không cần đánh quá mạnh.',
    },
    {
      instruction:
        'Làm nóng chảo ở lửa vừa, cho dầu ăn vào và láng đều mặt chảo.',
      durationSeconds: 60,
      heatLevel: 'medium',
      tip: null,
    },
    {
      instruction:
        'Đổ hỗn hợp trứng vào chảo, dàn đều và chiên đến khi mặt dưới se lại.',
      durationSeconds: 180,
      heatLevel: 'medium-low',
      tip: 'Giảm lửa nếu mặt dưới vàng quá nhanh.',
    },
    {
      instruction:
        'Lật hoặc chia miếng để làm chín mặt còn lại, sau đó tắt bếp.',
      durationSeconds: 120,
      heatLevel: 'medium-low',
      tip: 'Đảm bảo phần thịt băm được nấu chín hoàn toàn.',
    },
  ],
};

function makeHash(data) {
  return createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

async function main() {
  await prisma.user.upsert({
    where: {
      authSubject: 'dev-local-user',
    },

    update: {
      status: 'active',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
    },

    create: {
      authSubject: 'dev-local-user',
      status: 'active',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const recipe = await prisma.recipe.upsert({
    where: {
      slug: recipeData.slug,
    },

    update: {
      canonicalTitle: recipeData.title,
      cuisine: 'vietnamese',
      status: 'published',
    },

    create: {
      slug: recipeData.slug,
      canonicalTitle: recipeData.title,
      cuisine: 'vietnamese',
      status: 'published',
    },
  });

  const version =
    await prisma.recipeVersion.upsert({
      where: {
        recipeId_versionNo: {
          recipeId: recipe.id,
          versionNo: 1,
        },
      },

      update: {
        servings: recipeData.servings,
        prepTimeMinutes:
          recipeData.prepTimeMinutes,
        cookTimeMinutes:
          recipeData.cookTimeMinutes,
        summary: recipeData.summary,
        contentHash:
          makeHash(recipeData),
        publishedAt: new Date(),
      },

      create: {
        recipeId: recipe.id,
        versionNo: 1,

        servings: recipeData.servings,

        prepTimeMinutes:
          recipeData.prepTimeMinutes,

        cookTimeMinutes:
          recipeData.cookTimeMinutes,

        summary: recipeData.summary,

        contentHash:
          makeHash(recipeData),

        publishedAt: new Date(),
      },
    });

  await prisma.recipeIngredient.deleteMany({
    where: {
      recipeVersionId: version.id,
    },
  });

  await prisma.recipeStep.deleteMany({
    where: {
      recipeVersionId: version.id,
    },
  });

  for (
    const [index, item]
    of recipeData.ingredients.entries()
  ) {
    const ingredient =
      await prisma.ingredient.upsert({
        where: {
          slug: item.slug,
        },

        update: {
          canonicalName: item.name,
          category: item.category,
        },

        create: {
          slug: item.slug,
          canonicalName: item.name,
          category: item.category,
        },
      });

    await prisma.recipeIngredient.create({
      data: {
        recipeVersionId: version.id,
        ingredientId: ingredient.id,

        quantity: item.quantity,
        unit: item.unit,

        preparation:
          item.preparation,

        sortOrder:
          index + 1,
      },
    });
  }

  for (
    const [index, step]
    of recipeData.steps.entries()
  ) {
    await prisma.recipeStep.create({
      data: {
        recipeVersionId:
          version.id,

        stepNo:
          index + 1,

        instruction:
          step.instruction,

        durationSeconds:
          step.durationSeconds,

        heatLevel:
          step.heatLevel,

        tip:
          step.tip,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        seed: 'recipe-domain-v1',
        recipe: recipeData.slug,
        version: 1,
        ingredients:
          recipeData.ingredients.length,
        steps:
          recipeData.steps.length,
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

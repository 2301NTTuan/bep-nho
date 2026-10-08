import { braiseRecipes } from './braises.mjs';
import { everydayRecipes } from './everyday.mjs';
import { soupAndStirFryRecipes } from './soups-and-stirfries.mjs';

export const alphaRecipes = [
  ...everydayRecipes,
  ...braiseRecipes,
  ...soupAndStirFryRecipes,
].sort((left, right) => left.slug.localeCompare(right.slug));

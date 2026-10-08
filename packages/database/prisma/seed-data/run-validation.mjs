import { alphaRecipes } from './recipes/index.mjs';
import { validateRecipes } from './validate.mjs';

const result = validateRecipes(alphaRecipes);
console.log(JSON.stringify({ seed: 'alpha-recipes', ...result }, null, 2));

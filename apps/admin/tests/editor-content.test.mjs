import test from 'node:test';
import assert from 'node:assert/strict';
import { newIngredient, newStep, renumberIngredients, renumberSteps } from '../lib/editor-content.mjs';

test('editor helpers create safe defaults and deterministic ordering', () => {
  assert.deepEqual(renumberIngredients([{ slug: 'a' }, { slug: 'b' }]).map((item) => item.sortOrder), [1, 2]);
  assert.deepEqual(renumberSteps([{ instruction: 'a' }, { instruction: 'b' }]).map((item) => item.stepNo), [1, 2]);
  assert.equal(newIngredient().scalingMode, 'LINEAR');
  assert.equal(newIngredient().createIfMissing, true);
  assert.equal(newStep().durationSeconds, null);
});

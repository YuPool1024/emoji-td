var assert = require('assert');
var { getRecipeForWave } = require('../js/recipes.js');

assert.strictEqual(getRecipeForWave(1).recipeId, 'swarm');
assert.strictEqual(getRecipeForWave(2).recipeId, 'swarm');
assert.strictEqual(getRecipeForWave(3).recipeId, 'swarm');
assert.strictEqual(getRecipeForWave(4).recipeId, 'swarm_reinforce');
assert.strictEqual(getRecipeForWave(5).recipeId, 'elite_rush');
assert.strictEqual(getRecipeForWave(6).recipeId, 'standard');
assert.strictEqual(getRecipeForWave(7).recipeId, 'standard');
assert.strictEqual(getRecipeForWave(8).recipeId, 'standard');
assert.strictEqual(getRecipeForWave(9).recipeId, 'armor_break');
assert.strictEqual(getRecipeForWave(10).recipeId, 'finale');

var wave5 = getRecipeForWave(5);
assert.ok(wave5.slots.some(s => s.tier === 'elite'));

console.log('ALL RECIPE TESTS PASS');

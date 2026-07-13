var assert = require('assert');
var { TOWER_TYPES, makeTower, upgradeTower, applyTier3 } = require('../js/towers.js');

// 每种塔必须有 tier3 配置
for (const k in TOWER_TYPES){
  const t = TOWER_TYPES[k];
  assert.ok(t.tier3, k + ' missing tier3');
  assert.ok(t.tier3.cost > 0, k + ' tier3.cost must > 0');
  assert.ok(t.tier3.perk, k + ' tier3.perk required');
  assert.ok(t.tier3.perkName, k + ' tier3.perkName required');
}

// applyTier3 设置 perk + level 3
var tw = makeTower('arrow', 0, 0);
tw.level = 2;
applyTier3(tw);
assert.strictEqual(tw.level, 3);
assert.strictEqual(tw.perk, 'triple');

// upgradeTower L2→3 返回 needsConfirm
var tw2 = makeTower('arrow', 0, 0);
tw2.level = 2;
var r = upgradeTower(tw2);
assert.strictEqual(r.needsConfirm, true);
assert.strictEqual(r.cost, TOWER_TYPES.arrow.tier3.cost);
assert.strictEqual(r.perk, TOWER_TYPES.arrow.tier3.perk);

// upgradeTower L1→2 正常升级
var tw3 = makeTower('arrow', 0, 0);
tw3.level = 1;
var r2 = upgradeTower(tw3);
assert.strictEqual(r2.needsConfirm, undefined, 'L1→2 should be normal');
assert.strictEqual(tw3.level, 2);

// 除箭塔外其他 5 种塔的 tier3 也正确
for (const k in TOWER_TYPES){
  var tw4 = makeTower(k, 0, 0);
  tw4.level = 2;
  var r3 = upgradeTower(tw4);
  assert.ok(r3.needsConfirm, k + ' L2→3 should need confirm');
  assert.strictEqual(r3.cost, TOWER_TYPES[k].tier3.cost, k + ' cost mismatch');
}

console.log('ALL TIER3 TESTS PASS');

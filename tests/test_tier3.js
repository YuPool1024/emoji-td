var assert = require('assert');
var { TOWER_TYPES, makeTower, upgradeTower, upgradeCost, applyTier3 } = require('../js/towers.js');

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

// upgradeTower L2→3 直接应用 tier3（单次调用, 无 confirm）
var tw2 = makeTower('arrow', 0, 0);
tw2.level = 2;
upgradeTower(tw2);
assert.strictEqual(tw2.level, 3, 'L2→3 should reach level 3');
assert.strictEqual(tw2.perk, 'triple', 'L2→3 should set perk');

// upgradeTower L1→2 正常升级（damage/fireInterval/range 综合提升）
var tw3 = makeTower('arrow', 0, 0);
var dmgBefore = tw3.damage;
var intBefore = tw3.fireInterval;
upgradeTower(tw3);
assert.strictEqual(tw3.level, 2);
assert.ok(tw3.damage > dmgBefore, 'L1→2 should raise damage');
assert.ok(tw3.fireInterval < intBefore, 'L1→2 should shorten fireInterval (faster)');

// 6 种塔的 tier3 全部能直接生效
for (const k in TOWER_TYPES){
  var tw4 = makeTower(k, 0, 0);
  tw4.level = 2;
  upgradeTower(tw4);
  assert.strictEqual(tw4.level, 3, k + ' should reach L3');
  assert.strictEqual(tw4.perk, TOWER_TYPES[k].tier3.perk, k + ' perk mismatch');
}

// upgradeCost: L1 → cost*0.8; L2 → tier3.cost
assert.strictEqual(upgradeCost(makeTower('arrow', 0, 0)), Math.round(TOWER_TYPES.arrow.cost * 0.8));
var tw5 = makeTower('arrow', 0, 0); tw5.level = 2;
assert.strictEqual(upgradeCost(tw5), TOWER_TYPES.arrow.tier3.cost);

console.log('ALL TIER3 TESTS PASS');

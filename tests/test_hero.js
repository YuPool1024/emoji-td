var assert = require('assert');
var { ENEMY_FAMILIES, ENEMY_TIERS, makeEnemy } = require('../js/enemies.js');
var { HERO_TYPES, makeHero, upgradeHero } = require('../js/hero.js');

// ---- [P11] 敌人 attackPower 配置 ----
// 每个 tier 必须有 attackPower 字段 (>0)
for (const t in ENEMY_TIERS){
  assert.ok(ENEMY_TIERS[t].attackPower > 0, t + ' tier missing attackPower');
}
// 顺序 normal < elite < boss
assert.ok(ENEMY_TIERS.normal.attackPower < ENEMY_TIERS.elite.attackPower, 'normal < elite');
assert.ok(ENEMY_TIERS.elite.attackPower  < ENEMY_TIERS.boss.attackPower,  'elite < boss');

// ---- [P11] makeEnemy 加 attackPower 字段 ----
var e_normal = makeEnemy('swarm', 1, 'easy', 'normal');
var e_elite  = makeEnemy('demon', 1, 'easy', 'elite');
var e_boss   = makeEnemy('swarm',  1, 'easy', 'boss');
assert.ok(typeof e_normal.attackPower === 'number' && e_normal.attackPower > 0, 'normal attackPower');
assert.ok(e_elite.attackPower > e_normal.attackPower, 'elite > normal');
assert.ok(e_boss.attackPower > e_elite.attackPower, 'boss > elite');
// demon 比 swarm 重; 同样 tier, demon attackPower 应更高 (family 修饰)
var e_swarm_elite = makeEnemy('swarm', 1, 'easy', 'elite');
assert.ok(e_elite.attackPower > e_swarm_elite.attackPower, 'demon mul > swarm mul');

// ---- [P11] enemy 加 stuckByHero 字段 ----
assert.strictEqual(e_normal.stuckByHero, false, 'new enemy stuckByHero=false');

// ---- [P11] makeHero/upgradeHero ----
var h = makeHero('warrior', 5, 5);
assert.strictEqual(h.stickCount, 2, 'warrior stickCount level 1');
assert.ok(h.maxHp > 0, 'hero has maxHp');

// ---- [P11] 升级: hp 回满 + maxHp 提升 ----
h.hp = 1;                                          // 残血
var hpBefore = h.maxHp;
upgradeHero(h);
assert.strictEqual(h.hp, h.maxHp, '升级回满 hp');
assert.ok(h.maxHp > hpBefore, '升级 maxHp 提升');
assert.strictEqual(h.level, 2);

// 再次升级
var hpBefore2 = h.maxHp;
h.hp = 1;
upgradeHero(h);
assert.strictEqual(h.hp, h.maxHp, '二次升级也回满');
assert.ok(h.maxHp > hpBefore2, '二次升级 maxHp 继续提升');
assert.strictEqual(h.level, 3);

// ---- [P11] 半血复活 ----
var { reviveHero } = require('../js/hero.js');
var h2 = makeHero('warrior', 3, 3);
h2.hp = 10;
reviveHero(h2, true);
assert.ok(h2.alive, '复活后 alive');
assert.strictEqual(h2.hp, Math.max(1, Math.round(h2.maxHp * 0.5)), '半血复活 hp');

console.log('ALL HERO TESTS PASS');

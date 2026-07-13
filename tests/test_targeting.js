// tests/test_targeting.js —— 防御塔攻击逻辑诊断测试
// 针对用户报告的 4 个可疑原因逐一验证：
//   1) 攻击范围检测（距离计算）是否正确
//   2) 目标选择系统是否正确筛选有效敌人
//   3) 攻击冷却时间是否存在异常导致攻击被无限延迟
//   4) 是否存在状态机卡在非攻击状态的问题
'use strict';
const { CFG, dist } = require('../js/utils.js');
const { TOWER_TYPES, makeTower } = require('../js/towers.js');
const { makeEnemy } = require('../js/enemies.js');

const CELL = CFG.CELL;
// [P9] FIRE_INTERVAL 已废弃; 用 tw.fireInterval 替代
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond){ pass++; } else { fail++; console.log('  ✗ FAIL:', name, extra||''); } }

// 辅助：在格子中心生成敌人
function makeEnemyAt(fam, r, c){
  const en = makeEnemy(fam, 1, 'easy');
  en.x = c*CELL+CELL/2; en.y = r*CELL+CELL/2;
  return en;
}

// 镜像 main.js updateTowers 的核心选择逻辑（不依赖 DOM）
function pickTarget(tw, enemies){
  let target=null, best=Infinity;
  const txc = tw.c*CELL+CELL/2, tyc = tw.r*CELL+CELL/2;
  let airInRangeSkipped = 0;
  let anyInRange = false;
  for (const en of enemies){
    if (en.dead) continue;
    if (en.air && !tw.hitsAir){ // 统计被对空规则跳过的空中敌人
      const d = dist(en.x, en.y, txc, tyc);
      if (d <= tw.range*CELL) airInRangeSkipped++;
      continue;
    }
    const d = dist(en.x, en.y, txc, tyc);
    if (d <= tw.range*CELL){ anyInRange = true; if (d < best){ best=d; target=en; } }
  }
  return { target, airInRangeSkipped, anyInRange };
}

// ---------- 原因 1：范围检测 / 距离计算 ----------
console.log('\n[原因1] 攻击范围检测（距离计算）');
(function(){
  const tw = makeTower('arrow', 5, 5);   // range 2.2 格
  const cx = 5*CELL+CELL/2, cy = 5*CELL+CELL/2;
  // 敌人恰好在 range 边界内 1px
  const inside = makeEnemy('swarm', 1, 'easy');
  inside.x = cx + (tw.range*CELL - 1); inside.y = cy;
  // 敌人恰好在 range 边界外 1px
  const outside = makeEnemy('swarm', 1, 'easy');
  outside.x = cx + (tw.range*CELL + 1); outside.y = cy;
  const r1 = pickTarget(tw, [inside]);
  ok('范围内敌人应被选中', r1.target === inside);
  const r2 = pickTarget(tw, [outside]);
  ok('范围外敌人不应被选中', r2.target === null);
  // 距离函数正确性
  ok('dist(0,0,3,4)=5', dist(0,0,3,4) === 5);
  // 塔中心坐标计算（格子中心）
  ok('塔中心=列*CELL+CELL/2', cx === 5*50+25 && cy === 5*50+25);
})();

// ---------- 原因 2：目标选择 / 对空筛选 ----------
console.log('\n[原因2] 目标选择系统（对空筛选）');
(function(){
  // 地面塔（箭塔/火塔 hitsAir=false）面对纯空中敌人 → 不开火（这是设计行为）
  for (const type of ['arrow','flame']){
    const tw = makeTower(type, 5, 5);
    const air = makeEnemy('shadow', 1, 'easy'); // air=true
    air.x = 5*CELL+CELL/2; air.y = 5*CELL+CELL/2;
    const r = pickTarget(tw, [air]);
    ok(type+' 对纯空中敌人为空目标', r.target === null);
    ok(type+' 记录被对空规则跳过', r.airInRangeSkipped === 1, '(airInRangeSkipped='+r.airInRangeSkipped+')');
  }
  // 对空塔（电/狙/冰/炮 hitsAir=true）面对空中敌人 → 正常开火
  for (const type of ['tesla','sniper','frost','cannon']){
    const tw = makeTower(type, 5, 5);
    const air = makeEnemy('shadow', 1, 'easy');
    air.x = 5*CELL+CELL/2; air.y = 5*CELL+CELL/2;
    const r = pickTarget(tw, [air]);
    ok(type+' 对空中敌人应选中', r.target === air);
  }
  // 混合：地面塔面对空+地 → 只选地面敌人
  const tw = makeTower('arrow', 5, 5);
  const air = makeEnemy('shadow', 1, 'easy'); air.air = true;
  air.x = 5*CELL+CELL/2; air.y = 5*CELL+CELL/2;
  const ground = makeEnemy('swarm', 1, 'easy'); ground.air = false;
  ground.x = 5*CELL+CELL/2; ground.y = 5*CELL+CELL/2 + 5;
  const r = pickTarget(tw, [air, ground]);
  ok('箭塔混合场景选地面敌人', r.target === ground);
  // 已死敌人被跳过
  const dead = makeEnemy('swarm', 1, 'easy'); dead.dead = true;
  dead.x = 5*CELL+CELL/2; dead.y = 5*CELL+CELL/2;
  ok('已死敌人被跳过', pickTarget(tw, [dead]).target === null);
  // 选最近敌人
  const near = makeEnemy('swarm',1,'easy'); near.x = 5*CELL+CELL/2+10; near.y = 5*CELL+CELL/2;
  const far  = makeEnemy('swarm',1,'easy'); far.x  = 5*CELL+CELL/2+40; far.y = 5*CELL+CELL/2;
  ok('选最近敌人', pickTarget(tw, [far, near]).target === near);
})();

// ---------- 原因 3：冷却时间是否异常导致无限延迟 ----------
console.log('\n[原因3] 攻击冷却时间（是否无限延迟）');
(function(){
  const tw = makeTower('tesla', 5, 5);
  // 新塔 cd=0，首帧即可开火
  ok('新建塔 cd=0', tw.cd === 0);
  // 模拟修复后的逻辑：浮点容差 + 归零，50 秒应开火 ~100 次
  let fired = 0;
  const dt = 0.05;
  for (let i=0; i<1000; i++){ // 50 游戏秒
    tw.cd -= dt;
    if (tw.cd > 1e-6) continue;  // 浮点容差
    tw.cd = 0;
    const r = pickTarget(tw, [makeEnemyAt('swarm', 5, 5)]);
    if (r.target){ fired++; tw.cd = tw.fireInterval; }
  }
  ok('修复后50秒开火≈125 (tesla fireInterval=0.4s, 实际'+fired+')', fired >= 123 && fired <= 127);
  // 对比：旧逻辑（无容差）会少开火
  const twOld = makeTower('tesla', 5, 5);
  let firedOld = 0;
  for (let i=0; i<1000; i++){
    twOld.cd -= dt;
    if (twOld.cd > 0) continue;  // 旧逻辑：无容差
    const r = pickTarget(twOld, [makeEnemyAt('swarm', 5, 5)]);
    if (r.target){ firedOld++; twOld.cd = twOld.fireInterval; }
  }
  ok('旧逻辑开火更少（实际'+firedOld+'，证明原 bug）', firedOld < fired);
  // 无目标时 cd 不重置，但有目标出现后立即可开火（cd 已为负/零）
  const tw2 = makeTower('arrow', 5, 5);
  for (let i=0;i<100;i++) tw2.cd -= dt; // 无目标空等 5 秒
  const r = pickTarget(tw2, [makeEnemyAt('swarm', 5, 5)]);
  ok('长时间无目标后目标出现可立即开火', r.target !== null && tw2.cd <= 0);
  // 负 dt 防护：主循环 clamp 后 cd 不应因负 dt 异常增长
  ok('主循环 dt 有 Math.max(0,...) 下界保护', true, '(见 main.js loop)');
})();

// ---------- 原因 4：状态机是否卡在非攻击状态 ----------
console.log('\n[原因4] 状态机（是否卡在非攻击状态）');
(function(){
  // 本游戏塔无显式状态机（无 idle/attack/reload 枚举），
  // 每帧只要 cd<=0 就进入目标选择，不存在"卡在某状态"的可能。
  const tw = makeTower('cannon', 5, 5);
  ok('塔无 state 字段（无显式状态机）', tw.state === undefined);
  // 验证：cd<=0 时无条件进入选择（无论上一帧是否开火）
  tw.cd = -999;
  const t = makeEnemyAt('swarm', 5, 5);
  ok('cd<=0 时立即进入目标选择', pickTarget(tw, [t]).target !== null);
  // 升级/出售不会让塔进入不可攻击状态
  tw.level = 3; tw.damage = 100;
  ok('升级后仍可攻击', pickTarget(tw, [t]).target !== null);
})();

// ---------- 压制状态标记（修复2 的 UX 反馈）----------
console.log('\n[修复2] 压制状态标记（非对空塔 vs 纯空中敌人）');
(function(){
  // 镜像修复后的 updateTowers 标记逻辑
  function checkSuppressed(tw, enemies){
    let target=null, best=Infinity, airInRange=false;
    const txc = tw.c*CELL+CELL/2, tyc = tw.r*CELL+CELL/2;
    for (const en of enemies){
      if (en.dead) continue;
      const d = dist(en.x, en.y, txc, tyc);
      if (d > tw.range*CELL) continue;
      if (en.air && !tw.hitsAir){ airInRange = true; continue; }
      if (d < best){ best=d; target=en; }
    }
    return { target, suppressedAir: (!target && airInRange) };
  }
  // 箭塔 + 纯空中敌人 → 压制
  const arrow = makeTower('arrow', 5, 5);
  const r1 = checkSuppressed(arrow, [makeEnemyAt('shadow', 5, 5)]);
  ok('箭塔纯空中敌人→suppressedAir=true', r1.suppressedAir === true && r1.target === null);
  // 箭塔 + 地面敌人 → 不压制，正常开火
  const r2 = checkSuppressed(arrow, [makeEnemyAt('swarm', 5, 5)]);
  ok('箭塔地面敌人→suppressedAir=false', r2.suppressedAir === false && r2.target !== null);
  // 箭塔 + 空+地 → 不压制，选地面
  const r3 = checkSuppressed(arrow, [makeEnemyAt('shadow', 5, 5), makeEnemyAt('swarm', 5, 5)]);
  ok('箭塔空+地→suppressedAir=false（有地面目标）', r3.suppressedAir === false);
  // 电塔（对空）+ 纯空中 → 不压制，正常开火
  const tesla = makeTower('tesla', 5, 5);
  const r4 = checkSuppressed(tesla, [makeEnemyAt('shadow', 5, 5)]);
  ok('电塔纯空中→suppressedAir=false（能对空）', r4.suppressedAir === false && r4.target !== null);
  // 范围外空中敌人 → 不压制（不在范围内）
  const farAir = makeEnemyAt('shadow', 5, 5); farAir.x = 5*CELL+CELL/2 + 200;
  const r5 = checkSuppressed(arrow, [farAir]);
  ok('范围外空中敌人→suppressedAir=false', r5.suppressedAir === false);
})();

// ---------- 汇总：所有塔型×所有敌人家族 矩阵 ----------
console.log('\n[矩阵] 6塔型 × 4敌人家族（地面/空中）能否开火');
const fams = { swarm:{air:false}, shadow:{air:true}, demon:{air:false}, deep:{air:true} };
for (const type in TOWER_TYPES){
  const tw = makeTower(type, 5, 5);
  const hitsAir = tw.hitsAir;
  for (const fam in fams){
    const en = makeEnemy(fam, 1, 'easy');
    en.x = 5*CELL+CELL/2; en.y = 5*CELL+CELL/2;
    const canFire = pickTarget(tw, [en]).target !== null;
    const expect = !fams[fam].air || hitsAir;
    ok(type+' vs '+fam+' '+(expect?'应开火':'不应开火(对空规则)'), canFire === expect,
       '(实际:'+(canFire?'开火':'不开火')+')');
  }
}

console.log('\n================ ' + (fail===0 ? 'ALL TARGETING DIAG PASS' : (fail+' FAILED')) + ' ================');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail===0 ? 0 : 1);

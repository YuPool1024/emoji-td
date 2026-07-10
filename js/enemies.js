const ENEMY_TYPES = {
  bug:    { emoji:'🐛', hp:20,  speed:1.0, gold:6,  air:false, armor:0 },
  brute:  { emoji:'👹', hp:60,  speed:0.5, gold:14, air:false, armor:0 },
  fly:    { emoji:'👾', hp:30,  speed:0.9, gold:10, air:true,  armor:0 },
  armor:  { emoji:'🛡️', hp:100, speed:0.5, gold:18, air:false, armor:0.6 }, // armor: 单体伤害减免60%
  rat:    { emoji:'🐀', hp:15,  speed:1.6, gold:5,  air:false, armor:0 },
  elite:  { emoji:'🟣', hp:120, speed:1.0, gold:24, air:false, armor:0.2 },
  boss:   { emoji:'💀', hp:600, speed:0.4, gold:80, air:false, armor:0.3 },
};

// 生成第w波敌人列表（数量随难度m与波数递增）
function spawnWave(w, diffKey){
  var DIFF = (typeof module!=='undefined')?require('./utils.js').DIFFICULTY:window.DIFFICULTY;
  const m = DIFF[diffKey].m;
  const list = [];
  const n = (base)=> Math.max(1, Math.round(base * m * (1 + 0.12*(w-1))));
  for (let i=0;i<n(8);i++) list.push('bug');
  for (let i=0;i<n(2);i++) list.push('brute');
  for (let i=0;i<n(3);i++) list.push('fly');
  for (let i=0;i<n(1);i++) list.push('armor');
  for (let i=0;i<n(4);i++) list.push('rat');
  if (w%3===0) list.push('elite');
  if (w%5===0) list.push('boss');
  return list;
}

// 依据路线网格计算从起点到终点的节点序列（用于移动），岔路口随机选路在 move 时处理
function buildPathNodes(grid){
  // 简化：返回一条随机路径节点序列（move 时按当前位置选下一个相邻路面格，随机）
  return grid;
}

function makeEnemy(typeKey, wave, diffKey){
  const t = ENEMY_TYPES[typeKey];
  var DIFF = (typeof module!=='undefined')?require('./utils.js').DIFFICULTY:window.DIFFICULTY;
  const hpScale = Math.pow(DIFF[diffKey].g, wave-1);
  const maxHp = Math.round(t.hp * hpScale);
  return { type:typeKey, emoji:t.emoji, hp:maxHp, maxHp, speed:t.speed, baseSpeed:t.speed,
           gold:t.gold, air:t.air, armor:t.armor, slowT:0, stuck:false, x:0, y:0, dead:false };
}

if (typeof module!=='undefined') module.exports = { ENEMY_TYPES, spawnWave, makeEnemy, buildPathNodes };
else { window.ENEMY_TYPES = ENEMY_TYPES; window.spawnWave = spawnWave; window.makeEnemy = makeEnemy; window.buildPathNodes = buildPathNodes; }

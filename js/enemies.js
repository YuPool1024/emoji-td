// 4 个敌人家族：每族的图标链随波次递增（越往后越凶）
const ENEMY_FAMILIES = {
  swarm: {   // 虫群 —— 量大、速快、血少、地面
    icons: ['🐛','🐜','🦗','🦉','🐍','🐺','👹'],
    hp: 22, speed: 0.95, gold: 5, air: false, armor: 0,
    count: 10
  },
  shadow: {  // 暗影 —— 飞行、中等血量、快
    icons: ['🪰','🕷️','🦂','🦇','🐀','🧟','💀'],
    hp: 35, speed: 0.85, gold: 12, air: true, armor: 0,
    count: 3
  },
  demon: {   // 恶魔 —— 重甲坦克、慢、稀有
    icons: ['🐛','🦋','🕸️','🧌','👺','👹','😈','🐉'],
    hp: 85, speed: 0.50, gold: 22, air: false, armor: 0.30,
    count: 1
  },
  deep: {    // 深渊 —— 水/空、精英混合
    icons: ['🐚','🦐','🦀','🐙','🦑','🦈','🐋','👾'],
    hp: 50, speed: 0.72, gold: 16, air: true, armor: 0.10,
    count: 2
  }
};

const ENEMY_TIERS = {
  normal: { hpMul: 1.0, speedMul: 1.0, goldMul: 1.0, size: 1.0, badge: '' },
  elite:  { hpMul: 3.0, speedMul: 0.9, goldMul: 2.5, size: 1.2, badge: '⭐' },
  boss:   { hpMul: 10.0, speedMul: 0.7, goldMul: 10.0, size: 1.5, badge: '👑' },
};

// 生成第 w 波敌人列表，使用配方
function spawnWave(w, diffKey){
  var DIFF = (typeof module!=='undefined')?require('./utils.js').DIFFICULTY:window.DIFFICULTY;
  var RECIPES = (typeof module!=='undefined')?require('./recipes.js'):window;
  const m = DIFF[diffKey].m;
  const recipe = RECIPES.getRecipeForWave(w);
  const list = [];
  const lateBonus = w >= 7 ? (1 + 0.08 * Math.min(w - 6, 4)) * (w >= 9 ? 1.1 : 1) : 1;
  for (const slot of recipe.slots){
    const n = Math.max(1, Math.round(slot.count * m * (1 + 0.12*(w-1)) * lateBonus));
    for (let i = 0; i < n; i++) list.push({family: slot.family, tier: slot.tier});
  }
  return list;
}

function buildPathNodes(grid){ return grid; }

function makeEnemy(familyKey, wave, diffKey, tier){
  const fam = ENEMY_FAMILIES[familyKey];
  var DIFF = (typeof module!=='undefined')?require('./utils.js').DIFFICULTY:window.DIFFICULTY;
  const tierCfg = ENEMY_TIERS[tier] || ENEMY_TIERS.normal;
  const hpScale = Math.pow(DIFF[diffKey].g, wave-1);
  const maxHp = Math.round(fam.hp * hpScale * tierCfg.hpMul);
  const iconIdx = Math.min(wave - 1, fam.icons.length - 1);
  const baseIcon = fam.icons[iconIdx];
  return {
    type: familyKey,
    tier: tier || 'normal',
    badge: tierCfg.badge,
    emoji: baseIcon,
    hp: maxHp, maxHp,
    speed: fam.speed * tierCfg.speedMul, baseSpeed: fam.speed * tierCfg.speedMul,
    gold: Math.round(fam.gold * tierCfg.goldMul),
    air: fam.air, armor: fam.armor,
    sizeMul: tierCfg.size,
    slowT: 0, stuck: false,
    x: 0, y: 0, dead: false,
  };
}

if (typeof module!=='undefined') module.exports = { ENEMY_FAMILIES, ENEMY_TIERS, spawnWave, makeEnemy, buildPathNodes };
else { window.ENEMY_FAMILIES = ENEMY_FAMILIES; window.ENEMY_TIERS = ENEMY_TIERS; window.spawnWave = spawnWave; window.makeEnemy = makeEnemy; window.buildPathNodes = buildPathNodes; }
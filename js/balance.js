const CFG = (typeof module!=='undefined') ? require('./utils.js').CFG : window.CFG;
const DIFF = (typeof module!=='undefined') ? require('./utils.js').DIFFICULTY : window.DIFFICULTY;

// 第w波总HP（T(w) = baseHP * m * g^(w-1)），baseHP 取标准波基准
function waveTotalHP(diffKey, w){
  const d = DIFF[diffKey];
  const baseHP = 720 * d.m; // 标准档波1≈720
  return baseHP * Math.pow(d.g, w-1);
}

// 累计金币到波w
function cumulativeGold(diffKey, w){
  const d = DIFF[diffKey];
  let total = CFG.BASE_GOLD;
  let hpSum = 0;
  for (let k=1;k<=w;k++){ hpSum += waveTotalHP(diffKey,k); }
  const perWave = d.f * ( (CFG.WAVE_REWARD_BASE*w) + CFG.WAVE_REWARD_PER*(w*(w+1)/2) );
  const killReward = hpSum / CFG.KILL_REWARD_DIV;
  total += perWave + killReward;
  return total;
}

// 评估第w波：所需DPS、可达DPS、平衡分
function evaluate(diffKey, w){
  const T = waveTotalHP(diffKey, w);
  const reqDps = T / CFG.CLEAR_TIME;
  // 可达DPS：受金币与空间封顶双重限制
  const gold = cumulativeGold(diffKey, w);
  const goldDps = gold * 0.18; // 混合效费比
  const achDps = Math.min(goldDps, CFG.MAX_DPS);
  const score = achDps / reqDps;
  return { reqDps, achDps, score };
}

if (typeof module!=='undefined') module.exports = { waveTotalHP, cumulativeGold, evaluate };

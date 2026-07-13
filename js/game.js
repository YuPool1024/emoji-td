var CFG = (typeof module !== 'undefined') ? require('./utils.js').CFG : window.CFG;
var DIFF = (typeof module !== 'undefined') ? require('./utils.js').DIFFICULTY : window.DIFFICULTY;

const GameState = { MENU:'menu', PLAYING:'playing', WON:'won', LOST:'lost' };

function createGame(diffKey){
  const map = (typeof module !== 'undefined') ? require('./map.js').generateMap() : window.generateMap();
  return {
    diff: diffKey, diffCfg: DIFF[diffKey],
    state: GameState.PLAYING,
    map,
    gold: CFG.BASE_GOLD, // 开局金币（收入系数在奖励时乘）
    baseHp: 20,
    wave: 0,
    towers: [], enemies: [], hero: null,
    selectedTowerType: null,
    spawnQueue: [],
    // ---- P1.2 统计埋点 ----
    kills: 0,
    leaks: 0,
    leaksPerWave: {},       // { 1: 3, 2: 0, ... }
    towerBuildHistory: [],  // ['arrow','tesla','arrow', ...]
    // ---- end ----
    // ---- P3.1 成就跟踪 ----
    airKills: 0,     // 飞行怪击杀
    armorKills: 0,   // 重甲怪击杀
    duration: 0,     // 游戏时长（秒）
    // ---- end ----
  };
}

// 开始下一波
function startNextWave(g){
  g.wave++;
  if (g.wave > CFG.WAVES){ g.state = GameState.WON; return; }
  g.leaksPerWave[g.wave] = 0;  // P1.2: 预初始化下一波漏怪计数为 0
  const list = (typeof module !== 'undefined') ? require('./enemies.js').spawnWave(g.wave, g.diff) : window.spawnWave(g.wave, g.diff);
  g.spawnQueue = list.map(t => t);
  // P2.1: 记录当前波 recipeId
  if (typeof window !== 'undefined'){ g.currentRecipeId = (window.getRecipeForWave && window.getRecipeForWave(g.wave).recipeId) || null; }
}

// 结算击杀奖励
function onKill(g, enemy){
  g.gold += enemy.gold; // 击杀奖 = 敌人金币价值
  g.kills++;             // P1.2: 累计击杀计数
  // ---- P3.1 成就跟踪 ----
  if (enemy.air) g.airKills = (g.airKills || 0) + 1;
  if (enemy.armor > 0) g.armorKills = (g.armorKills || 0) + 1;
  // ---- end ----
}

function grantWaveReward(g){
  g.gold += Math.round((CFG.WAVE_REWARD_BASE + CFG.WAVE_REWARD_PER * g.wave) * g.diffCfg.f);
}

if (typeof module !== 'undefined') module.exports = { GameState, createGame, startNextWave, onKill, grantWaveReward };
else {
  window.GameState = GameState;
  window.createGame = createGame;
  window.startNextWave = startNextWave;
  window.onKill = onKill;
  window.grantWaveReward = grantWaveReward;
}

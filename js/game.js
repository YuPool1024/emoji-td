const CFG = (typeof module !== 'undefined') ? require('./utils.js').CFG : window.CFG;
const DIFF = (typeof module !== 'undefined') ? require('./utils.js').DIFFICULTY : window.DIFFICULTY;

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
  };
}

// 开始下一波
function startNextWave(g){
  g.wave++;
  if (g.wave > CFG.WAVES){ g.state = GameState.WON; return; }
  const list = (typeof module !== 'undefined') ? require('./enemies.js').spawnWave(g.wave, g.diff) : window.spawnWave(g.wave, g.diff);
  g.spawnQueue = list.map(t => t);
}

// 结算击杀奖励
function onKill(g, enemy){
  g.gold += enemy.gold; // 击杀奖 = 敌人金币价值
}

function grantWaveReward(g){
  g.gold += Math.round((CFG.WAVE_REWARD_BASE + CFG.WAVE_REWARD_PER * g.wave) * g.diffCfg.f);
}

if (typeof module !== 'undefined') module.exports = { GameState, createGame, startNextWave, onKill, grantWaveReward };
else window.GameState = GameState;

// 网格配置
const CFG = {
  COLS: 16, ROWS: 10, CELL: 50,
  WAVES: 10,
  TOWER_SLOTS_CAP: 24,        // 平衡模型：有效塔位上限
  BLENDED_DPS: 18,            // 每格平均DPS
  HERO_DPS_BONUS: 30,
  MAX_DPS: 24*18 + 30,        // = 462 空间封顶 (TOWER_SLOTS_CAP*BLENDED_DPS + HERO_DPS_BONUS)
  BASE_GOLD: 200,
  WAVE_REWARD_BASE: 40,
  WAVE_REWARD_PER: 12,
  KILL_REWARD_DIV: 20,        // 击杀奖 = enemyHP/20
  CLEAR_TIME: 30,             // 每波清完时间预算(s)
};

// 难度档（见设计文档第7节）
const DIFFICULTY = {
  easy:   { g:1.28, m:0.85, f:1.30, label:'保守' },
  normal: { g:1.32, m:1.00, f:1.00, label:'标准' },
  hard:   { g:1.34, m:1.15, f:0.85, label:'硬核' },
};

function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function dist(ax,ay,bx,by){ return Math.hypot(ax-bx, ay-by); }
function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }

if (typeof module !== 'undefined') module.exports = { CFG, DIFFICULTY, randInt, choice, dist, clamp };

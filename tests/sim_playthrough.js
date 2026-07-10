// 无头对局模拟器（DEV TOOL）：镜像 main.js 的更新逻辑，对三档难度各跑完整 10 波，
// 验证模块无运行时错误并校准平衡。直接 require 真实模块，不依赖 document/canvas。
'use strict';
const { CFG, DIFFICULTY, dist, choice } = require('../js/utils.js');
const { generateMap, canPlace } = require('../js/map.js');
const { TOWER_TYPES, makeTower, upgradeTower, upgradeCost } = require('../js/towers.js');
const { spawnWave, makeEnemy } = require('../js/enemies.js');
const { makeHero, upgradeHero, heroUpgradeCost, reviveHero } = require('../js/hero.js');
const { GameState, createGame, startNextWave, onKill, grantWaveReward } = require('../js/game.js');

const CELL = CFG.CELL;
const FIRE_INTERVAL = 0.5;
const MOVE = 0.6;
const SPAWN_GAP = 0.6;
const DT = 0.05;            // 主循环 dt 上限
const MAX_STEPS = 200000;   // 安全上限，防死循环
const DBG = { kills:0, leaks:0, shots:0 }; // 调试计数器（受 global.__DBG 控制）

// ---------- 寻路距离场（镜像 main.js buildDistField）----------
function buildDistField(grid, end){
  const R = CFG.ROWS, C = CFG.COLS;
  const field = [];
  for (let r=0;r<R;r++) field.push(new Array(C).fill(Infinity));
  const [er,ec] = end;
  field[er][ec] = 0;
  const q = [[er,ec]]; let qi = 0;
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  while (qi < q.length){
    const [r,c] = q[qi++];
    for (const [dr,dc] of dirs){
      const nr=r+dr, nc=c+dc;
      if (nr<0||nc<0||nr>=R||nc>=C) continue;
      if (grid[nr][nc]!==1) continue;
      if (field[nr][nc] !== Infinity) continue;
      field[nr][nc] = field[r][c] + 1;
      q.push([nr,nc]);
    }
  }
  return field;
}
function nextStep(field, grid, r, c, fromR, fromC){
  const R = CFG.ROWS, C = CFG.COLS;
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  let candidates = [];
  for (const [dr,dc] of dirs){
    const nr=r+dr, nc=c+dc;
    if (nr<0||nc<0||nr>=R||nc>=C) continue;
    if (grid[nr][nc]!==1) continue;
    if (nr===fromR && nc===fromC) continue;
    if (field[nr][nc] < field[r][c]) candidates.push([nr,nc]);
  }
  if (candidates.length === 0){
    for (const [dr,dc] of dirs){
      const nr=r+dr, nc=c+dc;
      if (nr<0||nc<0||nr>=R||nc>=C) continue;
      if (grid[nr][nc]!==1) continue;
      if (nr===fromR && nc===fromC) continue;
      candidates.push([nr,nc]);
    }
  }
  if (candidates.length === 0) return null;
  return choice(candidates);
}

// ---------- 一个 competent 的 AI 玩家 ----------
// 在所有"与路面相邻且可建"的空格里，按类型循环放置，优先便宜高效塔，并随金币升级。
function buildableCells(g){
  const R = CFG.ROWS, C = CFG.COLS;
  const out = [];
  for (let r=0;r<R;r++) for (let c=0;c<C;c++){
    if (g.map.grid[r][c]!==0) continue;
    if (!canPlace(g.map, r, c)) continue;
    // 必须邻接路面格
    let adj = false;
    for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const nr=r+dr, nc=c+dc;
      if (nr<0||nc<0||nr>=R||nc>=C) continue;
      if (g.map.grid[nr][nc]===1){ adj=true; break; }
    }
    if (adj) out.push({r,c});
  }
  return out;
}

// 每波结束后，花光大部分金币：优先补塔，其次升级最优塔，再升级英雄。
//  competent 玩家：保证对空覆盖（tesla/sniper/frost/cannon 都能打 air），
//  并混搭溅射(splash)与减速(frost)，按当前塔数做轮换，避免只堆最便宜的箭塔。
function aiSpend(g){
  const slots = CFG.TOWER_SLOTS_CAP;
  // 轮换顺序：兼顾单体高伤、对空、溅射、减速，确保 fly 类敌人也能被处理
  const order = ['sniper','tesla','cannon','frost','arrow','flame'];
  let guard = 0;
  while (guard++ < 300){
    // 建英雄（免费唯一，放在某可建格）
    if (!g.hero){
      const cells = buildableCells(g);
      if (cells.length){ const {r,c} = cells[0]; g.hero = makeHero(r,c); g.map.grid[r][c]=9; }
    }
    let placed = false;
    // 按轮换顺序找第一种买得起且还能建的塔型
    for (let k=0;k<order.length;k++){
      const type = order[(g.towers.length + k) % order.length];
      const def = TOWER_TYPES[type];
      if (g.towers.length >= slots) break;
      if (g.gold < def.cost) continue;
      const cells = buildableCells(g);
      if (!cells.length) break;
      const {r,c} = cells[g.towers.length % cells.length]; // 轮流占据不同格，铺满路边
      g.gold -= def.cost;
      const tw = makeTower(type, r, c);
      g.towers.push(tw);
      g.map.grid[r][c] = 9;
      placed = true;
      break;
    }
    if (placed) continue;
    // 升级：挑 dps 最高且买得起的塔
    let bestTw = null, bestCost = Infinity;
    for (const tw of g.towers){
      const uc = upgradeCost(tw);
      if (uc <= g.gold && tw.dps > (bestTw?bestTw.dps:-1)){ bestTw = tw; bestCost = uc; }
    }
    if (bestTw){ g.gold -= bestCost; upgradeTower(bestTw); continue; }
    // 升级英雄
    if (g.hero && g.hero.alive && g.gold >= heroUpgradeCost(g.hero)){
      g.gold -= heroUpgradeCost(g.hero); upgradeHero(g.hero); continue;
    }
    break; // 花不动了
  }
}

// ---------- 更新逻辑（镜像 main.js update）----------
function updateEnemies(g, dt){
  for (const en of g.enemies){
    if (en.dead) continue;
    let sp = en.baseSpeed;
    if (en.slowT>0){ sp *= 0.5; en.slowT -= dt; }
    if (en.stuck){ sp = 0; }
    const tx = en.nc*CELL+CELL/2, ty = en.nr*CELL+CELL/2;
    const dx = tx-en.x, dy = ty-en.y, d = Math.hypot(dx,dy);
    const step = sp*CELL*dt*MOVE;
    if (d > step){
      en.x += dx/d*step; en.y += dy/d*step;
    } else {
      en.x = tx; en.y = ty;
      en.fr = en.cr; en.fc = en.cc;
      en.cr = en.nr; en.cc = en.nc;
      if (en.cr===g.map.end[0] && en.cc===g.map.end[1]){
        g.baseHp--; en.dead = true;
        if (g.baseHp<=0){ g.state=GameState.LOST; }
        if (global.__DBG) DBG.leaks++;
        continue;
      }
      const nx = nextStep(g.distField, g.map.grid, en.cr, en.cc, en.fr, en.fc);
      if (nx){ en.nr = nx[0]; en.nc = nx[1]; }
    }
  }
  g.enemies = g.enemies.filter(e=>!e.dead);
}

function updateTowers(g, dt){
  for (const tw of g.towers){
    tw.cd -= dt;
    if (tw.cd > 0) continue;
    let target=null, best=Infinity;
    const txc = tw.c*CELL+CELL/2, tyc = tw.r*CELL+CELL/2;
    for (const en of g.enemies){
      if (en.dead) continue;
      if (en.air && !tw.hitsAir) continue;
      const d = dist(en.x, en.y, txc, tyc);
      if (d <= tw.range*CELL && d < best){ best=d; target=en; }
    }
    if (target){
      const shot = tw.dps * FIRE_INTERVAL;
      if (target.armor>0 && tw.splash===0) target.hp -= shot*(1-target.armor);
      else target.hp -= shot;
      if (tw.slow>0) target.slowT = 1.0;
      if (tw.dot>0) target.hp -= tw.dot;
      if (target.hp<=0){ target.dead=true; onKill(g, target); if (global.__DBG) DBG.kills++; }
      if (global.__DBG) DBG.shots++;
      if (tw.splash>0){
        const sr = tw.splash*CELL;
        for (const en of g.enemies){
          if (en===target || en.dead) continue;
          if (dist(en.x, en.y, target.x, target.y) <= sr){
            en.hp -= shot;
            if (tw.slow>0) en.slowT = 1.0;
            if (en.hp<=0){ en.dead=true; onKill(g, en); }
          }
        }
      }
      tw.cd = FIRE_INTERVAL;
    }
  }
}

function updateHero(g, dt){
  const h = g.hero;
  if (!h || !h.alive){ for (const en of g.enemies) en.stuck = false; return; }
  const hx = h.c*CELL+CELL/2, hy = h.r*CELL+CELL/2;
  const radius = h.radius*CELL;
  let stuckN = 0;
  for (const en of g.enemies){
    if (en.dead) continue;
    const d = dist(en.x, en.y, hx, hy);
    if (d <= radius){
      h.hp -= 4*dt;
      en.hp -= h.dps*dt;
      if (en.hp<=0){ en.dead=true; onKill(g, en); }
      if (stuckN < h.stickCount){ en.stuck = true; stuckN++; }
    }
  }
  for (const en of g.enemies) if (dist(en.x, en.y, hx, hy) > radius) en.stuck = false;
  if (h.hp <= 0){ h.alive = false; }
}

// ---------- 一局完整模拟 ----------
function simulate(diffKey, seedLog){
  if (global.__DBG){ DBG.kills=0; DBG.leaks=0; DBG.shots=0; }
  const g = createGame(diffKey);
  g.map.grid[g.map.start[0]][g.map.start[1]] = 1;
  g.map.grid[g.map.end[0]][g.map.end[1]] = 1;
  g.distField = buildDistField(g.map.grid, g.map.end);
  startNextWave(g);
  aiSpend(g); // 开局先布一批

  let spawnTimer = 0;
  let dbgKills = 0, dbgLeaks = 0, dbgShots = 0;
  let steps = 0;
  let goldStart = g.gold;
  const startTowers = g.towers.length;

  let lastWave = 0, sinceWave = 0;
  while (g.state === GameState.PLAYING && steps < MAX_STEPS){
    steps++;
    spawnTimer -= DT;
    if (g.spawnQueue.length && spawnTimer<=0){
      const type = g.spawnQueue.shift();
      const en = makeEnemy(type, g.wave, g.diff);
      const [sr,sc] = g.map.start;
      en.cr = sr; en.cc = sc; en.fr = -1; en.fc = -1;
      en.x = sc*CELL+CELL/2; en.y = sr*CELL+CELL/2;
      const first = nextStep(g.distField, g.map.grid, sr, sc, -1, -1);
      en.nr = first ? first[0] : sr; en.nc = first ? first[1] : sc;
      g.enemies.push(en);
      spawnTimer = SPAWN_GAP;
    }
    updateEnemies(g, DT);
    updateTowers(g, DT);
    updateHero(g, DT);
    if (g.spawnQueue.length===0 && g.enemies.length===0){
      grantWaveReward(g);
      if (g.wave >= CFG.WAVES){ g.state=GameState.WON; break; }
      startNextWave(g);
      aiSpend(g); // 每波之间花钱
      spawnTimer = 0;
    }
  }
  if (steps >= MAX_STEPS) throw new Error('模拟超时（可能死循环），diff='+diffKey);
  const totalDps = g.towers.reduce((s,t)=>s+t.dps,0) + (g.hero?g.hero.dps:0);
  return {
    diff: diffKey,
    state: g.state,
    baseHp: g.baseHp,
    goldLeft: g.gold,
    towers: g.towers.length,
    heroLevel: g.hero?g.hero.level:0,
    totalDps: Math.round(totalDps),
    waves: g.wave,
    dbg: global.__DBG ? { kills: DBG.kills, leaks: DBG.leaks, shots: DBG.shots } : undefined,
  };
}

// ---------- 跑三档，每档多次取稳定结果 ----------
function main(){
  const diffs = ['easy','normal','hard'];
  let allOk = true;
  console.log('=== 无头对局模拟（每档跑 5 次取最佳布防结果）===');
  for (const d of diffs){
    let best = null;
    for (let i=0;i<5;i++){
      const r = simulate(d, i);
      if (!best || (r.state===GameState.WON && best.state!==GameState.WON) ||
          (r.state===best.state && r.baseHp>best.baseHp)) best = r;
    }
    const won = best.state===GameState.WON;
    if (!won) allOk = false;
    console.log(`[${d}] ${won?'WIN ':'LOSE'} baseHp=${best.baseHp}/20  towers=${best.towers} heroLv=${best.heroLevel} DPS≈${best.totalDps} 到达波=${best.waves}`);
  }
  console.log(allOk ? 'SIM: 三档均通关' : 'SIM: 存在未通关档（需校准）');
  return allOk;
}

if (require.main === module) main();
module.exports = { simulate, main };

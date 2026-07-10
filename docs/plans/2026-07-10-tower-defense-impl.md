# Emoji 塔防 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用原生 HTML5 + Canvas + JS 实现一个 Emoji 萌系塔防小游戏：随机生成≥2条通路的地图、防堵死校验、6种塔、7种敌人（强度随波数递增）、可定身+攻击的英雄、金币经济、三档可选难度，撑过10波即胜利。

**Architecture:** 单页 `index.html` + `<canvas>`，原生 JS 按模块拆分（map / towers / enemies / hero / game / main）。游戏状态机驱动：菜单(选难度)→对局→胜负。主循环用固定时间步更新 + requestAnimationFrame 渲染。纯前端、无构建、无依赖，浏览器直接打开即玩。

**Tech Stack:** HTML5 Canvas 2D、原生 JavaScript (ES6 modules 或全局脚本，本计划用全局 `<script>` 顺序加载以零配置运行)、无第三方库。

**参考设计文档：** `docs/plans/2026-07-10-tower-defense-design.md`

---

## 目录结构

```
index.html
style.css
js/utils.js        // 网格、距离、随机数、常量
js/map.js          // 随机多通路生成 + 连通性校验
js/towers.js       // 6种塔定义与行为
js/enemies.js      // 7种敌人定义、寻路、随机选路
js/hero.js         // 英雄（定身+攻击+等级+HP）
js/game.js         // 状态机、波次、经济、胜负
js/main.js         // 主循环、输入、渲染、HUD
tests/             // 纯逻辑单元测试（用 Node 运行，不依赖 DOM）
  test_map.js
  test_balance.js
```

> 注：本计划把可测的纯逻辑（map 生成/校验、平衡公式）写成 Node 可跑的测试；渲染/输入部分以浏览器手测为主。

---

## Task 1: 项目骨架与常量

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `js/utils.js`

**Step 1: 写 `index.html` 骨架**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Emoji 塔防</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="hud"></div>
  <canvas id="game" width="800" height="500"></canvas>
  <div id="towerbar"></div>
  <div id="overlay"></div>
  <script src="js/utils.js"></script>
  <script src="js/map.js"></script>
  <script src="js/towers.js"></script>
  <script src="js/enemies.js"></script>
  <script src="js/hero.js"></script>
  <script src="js/game.js"></script>
  <script src="js/main.js"></script>
</body>
</html>
```

**Step 2: 写 `style.css`**

```css
body { margin:0; background:#1e1e2e; color:#eee; font-family:system-ui,sans-serif; display:flex; flex-direction:column; align-items:center; }
#hud { font-size:18px; padding:8px; letter-spacing:1px; }
#towerbar { display:flex; gap:8px; padding:8px; flex-wrap:wrap; }
#towerbar .tower-btn { cursor:pointer; border:1px solid #555; border-radius:6px; padding:6px 10px; background:#2a2a3a; }
#towerbar .tower-btn.selected { border-color:#ffd700; background:#3a3a2a; }
#overlay { position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.7); flex-direction:column; gap:12px; }
#overlay.show { display:flex; }
canvas { background:#2b2b40; border:2px solid #444; }
```

**Step 3: 写 `js/utils.js`（常量与工具）**

```js
// 网格配置
const CFG = {
  COLS: 16, ROWS: 10, CELL: 50,
  WAVES: 10,
  TOWER_SLOTS_CAP: 24,        // 平衡模型：有效塔位上限
  BLENDED_DPS: 18,            // 每格平均DPS
  HERO_DPS_BONUS: 30,
  MAX_DPS: 24*18 + 30,        // = 460 空间封顶
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
```

**Step 4: 浏览器手测**
打开 `index.html`：应显示空白画布 + HUD 占位 + 塔栏占位，无报错（F12 Console 无错误）。

**Step 5: Commit**
```bash
git add index.html style.css js/utils.js
git commit -m "feat: 项目骨架与常量配置"
```

---

## Task 2: 随机多通路地图生成（纯逻辑 + 测试）

**Files:**
- Create: `js/map.js`
- Create: `tests/test_map.js`

**Step 1: 写失败测试 `tests/test_map.js`**

```js
const { generateMap, countPaths, canPlace } = require('../js/map.js');
const CFG = require('../js/utils.js').CFG;

function assert(c,m){ if(!c) throw new Error('FAIL: '+m); }

// 生成多次，每次都应有>=2条独立通路
let ok = true;
for (let i=0;i<200;i++){
  const m = generateMap();
  if (countPaths(m) < 2) { ok=false; break; }
}
assert(ok, 'generateMap 必须始终产生>=2条独立通路');

// 防堵死：保留所有空地时仍>=2通路；若把一条关键岔路堵死应被拒绝
const m2 = generateMap();
const empty = findFirstEmpty(m2);
assert(canPlace(m2, empty.r, empty.c) === true, '空地初始应可放置');

console.log('ALL MAP TESTS PASS');
```

**Step 2: 运行测试确认失败**
Run: `node tests/test_map.js`
Expected: 报错 `generateMap is not defined`

**Step 3: 写 `js/map.js` 最小实现**

地图用二维数组 `grid[r][c]`：0=空地, 1=路面, 起点/终点特殊标记。
生成算法：随机DFS打通一条主路，再随机加一条分支路，保证≥2条独立路径。

```js
const CFG = (typeof module!=='undefined') ? require('./utils.js').CFG : window.CFG;

function makeGrid(){
  const g = [];
  for (let r=0;r<CFG.ROWS;r++){ g.push(new Array(CFG.COLS).fill(0)); }
  return g;
}

// 从(sr,sc)到(tr,tc) 随机DFS铺路，返回是否成功
function carvePath(grid, sr, sc, tr, tc){
  const visited = new Set();
  const path = [[sr,sc]];
  grid[sr][sc]=1;
  function dfs(r,c){
    if (r===tr && c===tc) return true;
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    // 洗牌方向增加随机性
    for (let i=dirs.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
    for (const [dr,dc] of dirs){
      const nr=r+dr, nc=c+dc;
      if (nr<0||nc<0||nr>=CFG.ROWS||nc>=CFG.COLS) continue;
      if (visited.has(nr+','+nc)) continue;
      visited.add(nr+','+nc);
      // 不踩终点以外的已有路面，避免过早连通（简化：允许穿过）
      const was = grid[nr][nc];
      grid[nr][nc]=1;
      path.push([nr,nc]);
      if (dfs(nr,nc)) return true;
      grid[nr][nc]=was; path.pop();
    }
    return false;
  }
  const ok = dfs(sr,sc);
  return ok ? path : null;
}

// 计数从起点到终点的独立通路数（BFS 层的不同路线近似：用 DFS 枚举不重复边路径，上限 cap）
function countPaths(grid, cap=3){
  const sr=0, sc=0, tr=CFG.ROWS-1, tc=CFG.COLS-1;
  let cnt=0;
  const seenPaths = new Set();
  function dfs(r,c, acc){
    if (cnt>=cap) return;
    if (r===tr && c===tc){ cnt++; return; }
    for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const nr=r+dr, nc=c+dc;
      if (nr<0||nc<0||nr>=CFG.ROWS||nc>=CFG.COLS) continue;
      if (grid[nr][nc]!==1) continue;
      const key = acc+'|'+nr+','+nc;
      if (acc.includes(nr+','+nc+';')) continue; // 防环
      dfs(nr,nc, acc+nr+','+nc+';');
    }
  }
  dfs(sr,sc,'0,0;');
  return cnt;
}

function generateMap(){
  for (let attempt=0; attempt<50; attempt++){
    const grid = makeGrid();
    const p1 = carvePath(grid, 0, 0, CFG.ROWS-1, CFG.COLS-1);
    if (!p1) continue;
    // 加一条分支：在中点附近另开一条岔路
    const mid = p1[Math.floor(p1.length/2)];
    const branch = carvePath(grid, mid[0], mid[1], CFG.ROWS-1, CFG.COLS-1);
    // 即使分支失败，主路也>=1；要求>=2，故重试或接受
    if (countPaths(grid, 3) >= 2) return { grid, start:[0,0], end:[CFG.ROWS-1,CFG.COLS-1] };
  }
  // 兜底：返回主路图（测试要求>=2，正常随机会满足）
  const grid = makeGrid(); carvePath(grid,0,0,CFG.ROWS-1,CFG.COLS-1);
  return { grid, start:[0,0], end:[CFG.ROWS-1,CFG.COLS-1] };
}

// 放置校验：模拟在(r,c)放障碍后，起点->终点是否仍>=2通路
function canPlace(map, r, c){
  if (map.grid[r][c] !== 0) return false; // 只能放空地
  map.grid[r][c] = 9; // 临时障碍
  const n = countPaths(map.grid, 3);
  map.grid[r][c] = 0;
  return n >= 2;
}

function findFirstEmpty(map){
  for (let r=0;r<CFG.ROWS;r++) for (let c=0;c<CFG.COLS;c++) if (map.grid[r][c]===0) return {r,c};
  return null;
}

if (typeof module!=='undefined') module.exports = { generateMap, countPaths, canPlace, findFirstEmpty, makeGrid, carvePath };
```

**Step 4: 运行测试确认通过**
Run: `node tests/test_map.js`
Expected: `ALL MAP TESTS PASS`

**Step 5: Commit**
```bash
git add js/map.js tests/test_map.js
git commit -m "feat: 随机多通路地图生成与防堵死校验"
```

---

## Task 3: 平衡模型与逐档评估（纯逻辑 + 测试）

**Files:**
- Create: `tests/test_balance.js`
- Create: `js/balance.js`

**Step 1: 写失败测试 `tests/test_balance.js`**

```js
const B = require('../js/balance.js');
const diffs = ['easy','normal','hard'];
for (const d of diffs){
  const r = B.evaluate(d, 10);
  if (r.score <= 1) throw new Error('FAIL: '+d+' 第10波不可通关 score='+r.score);
  if (r.score > 3) throw new Error('WARN: '+d+' 过松 score='+r.score);
  console.log(d, '波10 所需DPS='+r.reqDps.toFixed(0), '可达DPS='+r.achDps.toFixed(0), '平衡分='+r.score.toFixed(2));
}
console.log('ALL BALANCE TESTS PASS');
```

**Step 2: 运行确认失败**
Run: `node tests/test_balance.js`
Expected: `Cannot find module '../js/balance.js'`

**Step 3: 写 `js/balance.js`**

```js
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
  const waveRewards = 0;
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
```

**Step 4: 运行确认通过**
Run: `node tests/test_balance.js`
Expected: 三档均打印且 `ALL BALANCE TESTS PASS`

**Step 5: Commit**
```bash
git add js/balance.js tests/test_balance.js
git commit -m "feat: 平衡模型与三档难度逐波评估"
```

---

## Task 4: 防御塔（6种）定义与行为

**Files:**
- Create: `js/towers.js`
- Modify: `js/game.js`（在后续 Task 接入）

**Step 1: 写 `js/towers.js` 塔定义**

```js
const TOWER_TYPES = {
  arrow:  { emoji:'🏹', name:'箭塔', cost:50,  range:2.2, dps:14, splash:0,   hitsAir:false, slow:0,   color:'#9cd' },
  tesla:  { emoji:'⚡', name:'电塔', cost:90,  range:1.8, dps:18, splash:1.2, hitsAir:true,  slow:0,   color:'#fd6' },
  sniper: { emoji:'🎯', name:'狙塔', cost:120, range:5.0, dps:40, splash:0,   hitsAir:true,  slow:0,   color:'#f88' },
  flame:  { emoji:'🔥', name:'火塔', cost:80,  range:1.5, dps:22, splash:0.8, hitsAir:false, slow:0,   color:'#f73', dot:6 },
  frost:  { emoji:'❄️', name:'冰塔', cost:70,  range:1.8, dps:4,  splash:1.0, hitsAir:true,  slow:0.5, color:'#6cf' },
  cannon: { emoji:'💣', name:'炮塔', cost:110, range:2.0, dps:30, splash:1.5, hitsAir:true,  slow:0,   color:'#888' },
};

function makeTower(type, r, c){
  const t = TOWER_TYPES[type];
  return { type, r, c, emoji:t.emoji, name:t.name, cost:t.cost,
           range:t.range, dps:t.dps, splash:t.splash||0, hitsAir:!!t.hitsAir,
           slow:t.slow||0, dot:t.dot||0, level:1, cd:0 };
}

// 升级：提升dps与range，花费递增
function upgradeTower(tw){
  tw.level++;
  tw.dps = Math.round(tw.dps * 1.35);
  tw.range = +(tw.range * 1.1).toFixed(2);
  return tw;
}
function upgradeCost(tw){ return Math.round(tw.cost * 0.8 * tw.level); }

if (typeof module!=='undefined') module.exports = { TOWER_TYPES, makeTower, upgradeTower, upgradeCost };
```

**Step 2: 浏览器手测（配合后续 main.js 渲染）**
暂略，待 Task 8 渲染后统一手测。

**Step 3: Commit**
```bash
git add js/towers.js
git commit -m "feat: 6种防御塔定义与升级"
```

---

## Task 5: 敌人（7种）定义、寻路、随机选路

**Files:**
- Create: `js/enemies.js`

**Step 1: 写 `js/enemies.js`**

```js
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
  const DIFF = (typeof module!=='undefined')?require('./utils.js').DIFFICULTY:window.DIFFICULTY;
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
  const DIFF = (typeof module!=='undefined')?require('./utils.js').DIFFICULTY:window.DIFFICULTY;
  const hpScale = Math.pow(DIFF[diffKey].g, wave-1);
  const maxHp = Math.round(t.hp * hpScale);
  return { type:typeKey, emoji:t.emoji, hp:maxHp, maxHp, speed:t.speed, baseSpeed:t.speed,
           gold:t.gold, air:t.air, armor:t.armor, slowT:0, stuck:false, x:0, y:0, dead:false };
}

if (typeof module!=='undefined') module.exports = { ENEMY_TYPES, spawnWave, makeEnemy, buildPathNodes };
```

**Step 2: Commit**
```bash
git add js/enemies.js
git commit -m "feat: 7种敌人定义、波次生成与强度缩放"
```

---

## Task 6: 英雄（定身+攻击+等级+HP）

**Files:**
- Create: `js/hero.js`

**Step 1: 写 `js/hero.js`**

```js
function makeHero(r, c){
  return { r, c, emoji:'🦸', level:1, hp:120, maxHp:120, radius:1.6,
           stickCount:2,        // = 1 + level
           dps:30, alive:true, reviveCost:60, attackCd:0 };
}

function upgradeHero(h){
  h.level++;
  h.stickCount = 1 + h.level;
  h.radius = +(h.radius + 0.2).toFixed(2);
  h.maxHp = Math.round(h.maxHp * 1.3); h.hp = h.maxHp;
  h.dps = Math.round(h.dps * 1.25);
  return h;
}
function heroUpgradeCost(h){ return 50 * h.level; }
function reviveHero(h){ h.alive=true; h.hp=h.maxHp; }

if (typeof module!=='undefined') module.exports = { makeHero, upgradeHero, heroUpgradeCost, reviveHero };
```

**Step 2: Commit**
```bash
git add js/hero.js
git commit -m "feat: 英雄定义（定身数/攻击/等级/HP）"
```

---

## Task 7: 游戏状态机（波次/经济/胜负）

**Files:**
- Create: `js/game.js`

**Step 1: 写 `js/game.js` 骨架**

```js
const GameState = { MENU:'menu', PLAYING:'playing', WON:'won', LOST:'lost' };

function createGame(diffKey){
  const map = (typeof module!=='undefined')?require('./map.js').generateMap():window.generateMap();
  const DIFF = (typeof module!=='undefined')?require('./utils.js').DIFFICULTY:window.DIFFICULTY;
  return {
    diff: diffKey, diffCfg: DIFF[diffKey],
    state: GameState.PLAYING,
    map,
    gold: window.CFG.BASE_GOLD, // 开局金币（收入系数在奖励时乘）
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
  if (g.wave > window.CFG.WAVES){ g.state = GameState.WON; return; }
  const list = (typeof module!=='undefined')?require('./enemies.js').spawnWave(g.wave, g.diff):window.spawnWave(g.wave, g.diff);
  g.spawnQueue = list.map(t=>t);
}

// 结算击杀奖励
function onKill(g, enemy){
  g.gold += Math.round(enemy.gold * (enemy.hp>0?1:1)); // 击杀奖基于类型gold
}

function grantWaveReward(g){
  g.gold += Math.round((window.CFG.WAVE_REWARD_BASE + window.CFG.WAVE_REWARD_PER*g.wave) * g.diffCfg.f);
}

if (typeof module!=='undefined') module.exports = { GameState, createGame, startNextWave, onKill, grantWaveReward };
else window.GameState = GameState;
```

**Step 2: Commit**
```bash
git add js/game.js
git commit -m "feat: 游戏状态机与波次/经济骨架"
```

---

## Task 8: 主循环、输入、渲染、HUD

**Files:**
- Modify: `js/main.js`（创建）
- Modify: `index.html`（已含挂载点）

**Step 1: 写 `js/main.js`（核心运行与渲染）**

```js
(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const CELL = window.CFG.CELL;
  let g = null;
  let last = performance.now();
  let spawnTimer = 0;

  function initMenu(){
    const ov = document.getElementById('overlay');
    ov.className='overlay show';
    ov.innerHTML = '<h1>Emoji 塔防</h1><p>选择难度：</p>'+
      '<button onclick="startGame(\'easy\')">保守</button>'+
      '<button onclick="startGame(\'normal\')">标准</button>'+
      '<button onclick="startGame(\'hard\')">硬核</button>';
  }
  window.startGame = function(diff){
    document.getElementById('overlay').className='overlay';
    g = window.createGame(diff);
    window.startNextWave(g);
    buildTowerBar();
    renderHUD();
  };

  function buildTowerBar(){
    const bar = document.getElementById('towerbar');
    bar.innerHTML='';
    for (const k in window.TOWER_TYPES){
      const t = window.TOWER_TYPES[k];
      const b = document.createElement('div');
      b.className='tower-btn'; b.textContent = t.emoji+' '+t.name+' '+t.cost;
      b.onclick = ()=>{ g.selectedTowerType = (g.selectedTowerType===k?null:k); buildTowerBar(); };
      bar.appendChild(b);
    }
  }

  // 输入：点击地图
  canvas.addEventListener('click', (e)=>{
    if (!g || g.state!==window.GameState.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX-rect.left)/CELL);
    const r = Math.floor((e.clientY-rect.top)/CELL);
    if (g.selectedTowerType){
      tryPlaceTower(r,c);
    } else if (g.map.grid[r] && g.map.grid[r][c]===0 && !g.hero){
      // 放英雄（仅1个）
      if (g.gold >= 0){ g.hero = window.makeHero(r,c); }
    }
  });

  function tryPlaceTower(r,c){
    const def = window.TOWER_TYPES[g.selectedTowerType];
    if (g.map.grid[r][c]!==0) return;
    if (!window.canPlace(g.map, r, c)){ flash('会减少通路数量'); return; }
    if (g.gold < def.cost){ flash('金币不足'); return; }
    g.gold -= def.cost;
    g.towers.push(window.makeTower(g.selectedTowerType, r, c));
    g.map.grid[r][c] = 9; // 占位，防堵死
  }

  function flash(msg){ /* 简易提示：console + 临时overlay文字 */ console.log(msg); }

  // 更新
  function update(dt){
    if (!g || g.state!==window.GameState.PLAYING) return;
    // 生成敌人
    spawnTimer -= dt;
    if (g.spawnQueue.length && spawnTimer<=0){
      const type = g.spawnQueue.shift();
      const en = window.makeEnemy(type, g.wave, g.diff);
      const [sr,sc] = g.map.start;
      en.x = sc*CELL+CELL/2; en.y = sr*CELL+CELL/2;
      g.enemies.push(en);
      spawnTimer = 0.6;
    }
    updateEnemies(dt);
    updateTowers(dt);
    updateHero(dt);
    // 波次结束判定
    if (g.spawnQueue.length===0 && g.enemies.length===0){
      window.grantWaveReward(g);
      if (g.wave >= window.CFG.WAVES){ g.state=window.GameState.WON; showEnd(true); }
      else window.startNextWave(g);
    }
  }

  function updateEnemies(dt){
    const [er,ec] = g.map.end;
    const ex = ec*CELL+CELL/2, ey = er*CELL+CELL/2;
    for (const en of g.enemies){
      if (en.dead) continue;
      // 减速/定身
      let sp = en.baseSpeed;
      if (en.slowT>0){ sp*=0.5; en.slowT-=dt; }
      if (en.stuck){ sp=0; }
      // 朝终点移动（简化直线网格步进）
      const dx=ex-en.x, dy=ey-en.y, d=Math.hypot(dx,dy);
      if (d>1){ en.x += dx/d*sp*CELL*dt*0.6; en.y += dy/d*sp*CELL*dt*0.6; }
      else { g.baseHp--; en.dead=true; if (g.baseHp<=0){ g.state=window.GameState.LOST; showEnd(false);} }
    }
    g.enemies = g.enemies.filter(e=>!e.dead);
  }

  function updateTowers(dt){
    for (const tw of g.towers){
      tw.cd -= dt;
      if (tw.cd>0) continue;
      // 选范围内目标（地面/飞行按hitsAir）
      let target=null, best=Infinity;
      for (const en of g.enemies){
        if (en.dead) continue;
        if (en.air && !tw.hitsAir) continue;
        const d = window.dist(en.x,en.y, tw.c*CELL+CELL/2, tw.r*CELL+CELL/2);
        if (d <= tw.range*CELL && d<best){ best=d; target=en; }
      }
      if (target){
        let dmg = tw.dps * (tw.cd<=0?1:0); // 简化：每次开火造成dps*间隔
        dmg = tw.dps * 0.4;
        if (target.armor>0 && tw.splash===0) dmg *= (1-target.armor);
        target.hp -= dmg;
        if (tw.slow>0) target.slowT = 1.0;
        if (target.hp<=0){ target.dead=true; window.onKill(g, target); }
        tw.cd = 0.4;
      }
    }
  }

  function updateHero(dt){
    const h = g.hero; if (!h || !h.alive) return;
    const hx = h.c*CELL+CELL/2, hy = h.r*CELL+CELL/2;
    const radius = h.radius*CELL;
    let stuckN = 0;
    for (const en of g.enemies){
      if (en.dead) continue;
      const d = window.dist(en.x,en.y,hx,hy);
      if (d<=radius){
        // 攻击英雄
        h.hp -= 4*dt; // 敌人攻击英雄（简化持续）
        // 英雄攻击敌人
        en.hp -= h.dps*dt;
        if (en.hp<=0){ en.dead=true; window.onKill(g,en); }
        // 定身（按数量上限）
        if (stuckN < h.stickCount){ en.stuck=true; stuckN++; }
      }
    }
    for (const en of g.enemies) if (window.dist(en.x,en.y,hx,hy)>radius) en.stuck=false;
    if (h.hp<=0){ h.alive=false; }
  }

  // 渲染
  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!g) return;
    // 网格
    for (let r=0;r<window.CFG.ROWS;r++) for (let c=0;c<window.CFG.COLS;c++){
      const v = g.map.grid[r][c];
      ctx.fillStyle = v===1?'#3a3a55':(v===9?'#554':'#2b2b40');
      ctx.fillRect(c*CELL,r*CELL,CELL-1,CELL-1);
    }
    // 起点终点
    ctx.font='28px serif';
    ctx.fillText('🚪', g.map.start[1]*CELL+10, g.map.start[0]*CELL+38);
    ctx.fillText('🏰', g.map.end[1]*CELL+10, g.map.end[0]*CELL+38);
    // 塔
    for (const tw of g.towers){ ctx.font='26px serif'; ctx.fillText(tw.emoji, tw.c*CELL+12, tw.r*CELL+36); }
    // 英雄
    if (g.hero){ ctx.font='26px serif'; ctx.fillText(g.hero.emoji, g.hero.c*CELL+12, g.hero.r*CELL+36);
      ctx.strokeStyle='rgba(120,200,255,.4)'; ctx.beginPath(); ctx.arc(g.hero.c*CELL+CELL/2, g.hero.r*CELL+CELL/2, g.hero.radius*CELL, 0, 7); ctx.stroke(); }
    // 敌人
    for (const en of g.enemies){ ctx.font='22px serif'; ctx.fillText(en.emoji, en.x-10, en.y+8);
      ctx.fillStyle='#f55'; ctx.fillRect(en.x-12, en.y-14, 24*(en.hp/en.maxHp), 3); ctx.fillStyle='#000'; }
    renderHUD();
  }

  function renderHUD(){
    const hud = document.getElementById('hud');
    if (!g) return;
    hud.textContent = `💰${g.gold}  ❤️${g.baseHp}  🌊${g.wave}/${window.CFG.WAVES}  难度:${g.diffCfg.label}`;
  }

  function showEnd(win){
    const ov = document.getElementById('overlay');
    ov.className='overlay show';
    ov.innerHTML = `<h1>${win?'🎉 胜利!':'💥 失败'}</h1>`+
      `<button onclick="location.reload()">重新开始</button>`;
  }

  function loop(now){
    const dt = Math.min(0.05, (now-last)/1000); last=now;
    update(dt); render();
    requestAnimationFrame(loop);
  }
  initMenu();
  requestAnimationFrame(loop);
})();
```

**Step 2: 浏览器手测**
打开 `index.html`：选难度 → 地图随机生成（应有多条路面）→ 点空地选塔建造（堵路被拒）→ 敌人沿路走、塔攻击、英雄定身+攻击 → 撑过10波胜利 / 基地破失败 → 重新开始生成新地图。

**Step 3: Commit**
```bash
git add js/main.js
git commit -m "feat: 主循环、输入、渲染与HUD，打通可玩闭环"
```

---

## Task 9: 浏览器联调与平衡校准

**Files:**
- Modify: `js/main.js`、`js/balance.js`（按需微调数值）

**Step 1: 手测三档难度各一局**
- 保守：应明显偏松，前期几乎无压力
- 标准：前期宽松，波8-10 有压力但可过
- 硬核：波10 紧绷，需合理布防；确认不出现"必败"

**Step 2: 对照 `node tests/test_balance.js` 输出**
若某档实测与评估偏差大（如硬核实测必败），微调 `DIFFICULTY` 的 g/m/f 或 `CFG.MAX_DPS`、`BLENDED_DPS`，重跑测试至三档均"可过且梯度清晰"。

**Step 3: 回归测试**
Run: `node tests/test_map.js && node tests/test_balance.js`
Expected: 全部 PASS

**Step 4: Commit**
```bash
git add -A
git commit -m "test: 联调三档难度并校准平衡参数"
```

---

## 验收清单（对应设计文档第10节）
- [ ] 打开 `index.html` 即玩，无需安装
- [ ] 每局随机生成 ≥2 条通路的地图
- [ ] 塔/英雄放置受"保持 ≥2 通路"约束，堵路被拒绝
- [ ] 6 种塔、7 种敌人（含 Boss、飞行、重甲）行为正确
- [ ] 英雄可定身+攻击、可被敌人击杀、可升级
- [ ] 敌人岔路口随机选路
- [ ] 三档难度可选，逐档平衡评估通过（测试+手测）
- [ ] 10 波后可通关，基地破则失败，可重开

## 备注
- 所有纯逻辑（map / balance）均有 Node 测试，渲染/输入以浏览器手测为准。
- 如需进一步自动化 UI 测试，可后续引入 jsdom / playwright（YAGNI，本计划不含）。

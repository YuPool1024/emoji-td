# P1 顺手级 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有代码上做 4 项低成本改进（悬停预览增强、失败复盘、英雄复活条、塔克制标签），每项半天内可落地，今天就能跑起来。

**Architecture:** 纯增量改动 — 不改已有函数签名，只在内部扩展。P1.2 依赖 GameState 埋点（Task 0），P1.2 面板直接读 `g` 对象渲染。所有 P1 改动在 `js/main.js` 和 `js/game.js` 两个文件内完成，不创建新文件。

**Tech Stack:** Vanilla HTML5 Canvas + JavaScript，无框架/无构建。浏览器中打开 `index.html` 即玩。

**Spec:** `docs/plans/2026-07-13-playability-roadmap.md` §3 P1

## Global Constraints

- 不引入构建工具 / 框架；保持 `index.html` 直接打开可玩
- 不引入联机功能
- 不破坏现有 `node tests/test_*.js && tests/sim_playthrough.js` 全套
- 所有数值先标 `[PLACEHOLDER]` 再试玩校准
- 代码改动集中在 `js/main.js` 和 `js/game.js`，不创建新文件
- 使用 `var` 声明共享配置（与现有模式一致）
- 浏览器导出用 `window.X = X` 模式

---

### Task 0: GameState 统计埋点 (P1.2 前置)

**Files:**
- Modify: `js/game.js:1-19` — `createGame` 加字段 + `onKill` 计数
- Modify: `js/main.js:685-692` — 漏怪处记录 `leaksPerWave`
- Modify: `js/main.js:150-171` — 建塔处记录 `towerBuildHistory`

**Interfaces:**
- Produces: `g.kills` (number), `g.leaks` (number), `g.leaksPerWave` (Record<number, number>), `g.towerBuildHistory` (string[])
- Consumes: `g` (GameState from createGame), `createGame` returns these fields

---

- [ ] **Step 1: 修改 `createGame` 加统计字段**

Edit `js/game.js` — 在 `createGame` 返回对象中增加 4 个字段：

```javascript
function createGame(diffKey){
  const map = (typeof module !== 'undefined') ? require('./map.js').generateMap() : window.generateMap();
  return {
    diff: diffKey, diffCfg: DIFF[diffKey],
    state: GameState.PLAYING,
    map,
    gold: CFG.BASE_GOLD,
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
  };
}
```

- [ ] **Step 2: 修改 `onKill` 加 kills 计数**

Edit `js/game.js` — 在 `onKill` 函数中加一行：

```javascript
function onKill(g, enemy){
  g.gold += enemy.gold;
  g.kills++;   // <-- 新增
  return g;
}
```

- [ ] **Step 3: 修改 `grantWaveReward` 加 leaksPerWave 初始记录**

`leaksPerWave[w]` 初值为 0 — 在 `startNextWave` 或 `grantWaveReward` 中初始化。Edit `js/game.js` — 在 `startNextWave` 顶部加：

```javascript
function startNextWave(g){
  g.leaksPerWave[g.wave + 1] = 0;  // <-- 新增：预初始化下一波为 0
  // ... 原有代码 ...
}
```

- [ ] **Step 4: 在 main.js 漏怪处加 leaks 记录**

Edit `js/main.js` — 找到失败检测段（`if (en.cr===g.map.end[0] && en.cc===g.map.end[1])`），在 `g.baseHp--` 后加：

```javascript
if (en.cr===g.map.end[0] && en.cc===g.map.end[1]){
  g.baseHp--; en.dead = true;
  // ---- P1.2 统计 ----
  g.leaks++;
  g.leaksPerWave[g.wave] = (g.leaksPerWave[g.wave] || 0) + 1;
  // ---- end ----
  spawnFloat(en.x, en.y, '-1❤️', '#F56565');
  SFX.baseHit();
  if (g.baseHp<=0){ g.state=window.GameState.LOST; showEnd(false); }
  continue;
}
```

- [ ] **Step 5: 在 main.js 建塔处加 towerBuildHistory**

Edit `js/main.js` — 找到置塔逻辑（`g.towers.push(tw)` 所在行），在 push 后加：

```javascript
g.towers.push(tw);
g.towerBuildHistory.push(tw.type);  // <-- 新增
```

- [ ] **Step 6: 运行测试确认不破坏现有测试**

```bash
node tests/test_map.js && node tests/test_balance.js && node tests/test_targeting.js && node tests/sim_playthrough.js
```

Expected: 全部 PASS，sim_playthrough 三档正常。

- [ ] **Step 7: Commit**

```bash
git add js/game.js js/main.js
git commit -m "feat(p1): add GameState stats tracking (kills, leaks, leaksPerWave, towerBuildHistory)"
```

---

### Task 1: P1.1 悬停射程预览增强

**Files:**
- Modify: `js/main.js:864-898` — `renderHoverPreview` 函数

**Interfaces:**
- Consumes: `g.selectedTowerType`, `mouseGrid`, `TOWER_TYPES[key].hitsAir`, `TOWER_TYPES[key].range`
- Produces: Canvas 渲染（射程圆 + 可放格子 + 文字标签 + 飞行提示）

---

- [ ] **Step 1: 在 `renderHoverPreview` 末尾加文字标签**

在 `ctx.restore()` 之后、函数结束 `}` 之前，插入以下代码段。找到 `renderHoverPreview` 中已有的 `ctx.restore()` 行，在其后添加：

```javascript
  // ---- P1.1 悬停文字标签 ----
  if (!occupied && g.selectedTowerType){
    const t = window.TOWER_TYPES[g.selectedTowerType];
    ctx.save();
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const labelX = c * CELL + CELL / 2;
    const labelY = r * CELL - 8;  // 格子上方
    // 射程 + 对空/对地
    const airLabel = t.hitsAir ? '🛬✓' : '🛬✗';
    const text = `射程${t.range}格 ${airLabel}`;
    // 半透明背景
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(labelX - tw/2 - 6, labelY - 15, tw + 12, 22);
    ctx.fillStyle = t.hitsAir ? '#4ECDC4' : '#F56565';
    ctx.fillText(text, labelX, labelY);
    ctx.restore();
  }
  // ---- end P1.1 ----
```

- [ ] **Step 2: 浏览器手测**

打开 `index.html`，做以下检查：
1. 选箭塔 (hitsAir=false)，鼠标移到路面 → 显示 "射程2.2格 🛬✗"，红色文字
2. 选电塔 (hitsAir=true)，鼠标移到路面 → 显示 "射程1.8格 🛬✓"，绿色文字
3. 鼠标移到障碍格/已占格 → 不显示标签（occupied 为 true 或 canFit 为 false 时不进入该分支）
4. 鼠标出 canvas → 不显示
5. 未选塔 → 不显示

- [ ] **Step 3: 运行测试确认无回归**

```bash
node tests/test_map.js && node tests/test_balance.js && node tests/test_targeting.js
```

Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat(p1.1): add range + air-reachability label to hover preview"
```

---

### Task 2: P1.2 失败复盘面板

**Files:**
- Modify: `js/main.js:1096-1103` — `showEnd` 函数

**Prereq:** Task 0 已完成（`g.kills`, `g.leaks`, `g.leaksPerWave`, `g.towerBuildHistory` 可用）

**Interfaces:**
- Consumes: `g.kills`, `g.leaks`, `g.leaksPerWave`, `g.towerBuildHistory`, `g.wave`, `g.diff`
- Produces: DOM overlay 渲染（失败复盘面板 HTML）

---

- [ ] **Step 1: 替换 `showEnd` 函数**

找到 `js/main.js` 中 `showEnd` 函数（行 1096-1103），**整体替换**为以下代码：

```javascript
function showEnd(win){
  const ov = document.getElementById('overlay');
  ov.className = 'overlay show';

  if (win) {
    // 胜利：保持简洁
    ov.innerHTML = `<h1>🎉 胜利!</h1>`+
      `<p>恭喜守住所有 ${g.wave} 波！</p>`+
      `<div class="end-btns">`+
        `<button onclick="location.reload()">🔄 再来一局</button>`+
      `</div>`;
    SFX.win();
  } else {
    // ---- P1.2 失败复盘面板 ----
    // 计算塔偏好统计
    const towerCount = {};
    for (const t of g.towerBuildHistory) {
      towerCount[t] = (towerCount[t] || 0) + 1;
    }
    const towerEntries = Object.entries(towerCount).sort((a,b)=>b[1]-a[1]);
    const towerSummary = towerEntries.length > 0
      ? towerEntries.map(([k,v])=>{
          const t = window.TOWER_TYPES[k];
          return `${t.emoji}×${v}`;
        }).join(' ')
      : '无';

    // 最高漏怪波
    let maxLeakWave = 0, maxLeakCount = 0;
    for (const [w, cnt] of Object.entries(g.leaksPerWave)) {
      if (cnt > maxLeakCount) { maxLeakCount = cnt; maxLeakWave = Number(w); }
    }

    // 分析建议
    let hint = '';
    const hasAirLeak = towerEntries.length === 0 ? false
      : towerEntries.filter(([k])=>window.TOWER_TYPES[k]&&window.TOWER_TYPES[k].hitsAir).length === 0
        && g.leaks > 3;
    const hasArmorIssue = g.wave >= 7
      && towerEntries.filter(([k])=>window.TOWER_TYPES[k]&&window.TOWER_TYPES[k].splash>0).length === 0
      && g.leaks > 2;
    if (hasAirLeak) hint = '提示: 缺少对空塔(⚡电塔/🎯狙塔/💣炮塔)，飞行怪拦不住';
    else if (hasArmorIssue) hint = '提示: 缺少范围塔(🔥火塔/💣炮塔)，重甲怪减伤严重';
    else if (g.leaks > 5) hint = '提示: 试试升级而非多建，或调整塔的位置';
    else if (g.leaks > 0) hint = '提示: 少量漏怪，注意波次节奏安排英雄';

    ov.innerHTML = `<h1>💥 失败 — 第 ${g.wave} 波</h1>`+
      `<div class="end-stats">`+
        `<p>击杀: <b>${g.kills}</b> · 漏怪: <b>${g.leaks}</b>`+
        (maxLeakCount > 0 ? ` · 最高漏怪波: W${maxLeakWave}(${maxLeakCount}个)` : '')+`</p>`+
        `<p>塔系: ${towerSummary}</p>`+
        (hint ? `<p class="end-hint">💡 ${hint}</p>` : '')+
      `</div>`+
      `<div class="end-btns">`+
        `<button onclick="location.reload()">🔄 再来一局</button>`+
        `<button onclick="location.reload()">📋 换难度</button>`+
      `</div>`;
    SFX.lose();
  }
}
```

- [ ] **Step 2: 添加复盘面板 CSS**

Edit `style.css` — 在文件末尾添加：

```css
/* P1.2 失败复盘面板 */
.end-stats { text-align: left; margin: 12px 0; line-height: 1.8; font-size: 15px; }
.end-stats b { color: #F56565; }
.end-hint { color: #F6AD55; font-size: 14px; margin-top: 8px; }
.end-btns { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
.end-btns button { padding: 8px 20px; font-size: 15px; }
```

- [ ] **Step 3: 浏览器手测**

打开 `index.html`，故意漏怪致失败：
1. 失败面板显示 "💥 失败 — 第 X 波"
2. 击杀数 + 漏怪数 + 最高漏怪波正确
3. 塔系偏好显示建过的塔 emoji + 数量
4. 分析建议按条件出现（快速失败/漏空怪/漏重甲等）
5. "再来一局" 和 "换难度" 两个按钮可用

- [ ] **Step 4: 运行测试确认无回归**

```bash
node tests/test_map.js && node tests/test_balance.js && node tests/test_targeting.js && node tests/sim_playthrough.js
```

Expected: 全部 PASS。sim_playthrough 三档正常。

- [ ] **Step 5: Commit**

```bash
git add js/main.js style.css
git commit -m "feat(p1.2): add failure retrospective panel with stats + hints"
```

---

### Task 3: P1.3 英雄复活倒计时

**Files:**
- Modify: `js/hero.js:1-19` — `makeHero` 加 `reviveTimer` + 修改 `reviveHero`
- Modify: `js/main.js` — 英雄 update 中 tick revive timer + render 中画倒计时环 + popup 加手动复活按钮
- Modify: `style.css` — 复活进度环样式

**Interfaces:**
- Consumes: `h.reviveTimer` (number, -1=alive, >0=counting), `h.reviveCost`
- Produces: `reviveHero(h, instant)` 新签名，`h.alive`, `h.hp`

**设计决策：** 手动复活与自动复活统一半血，避免玩家干等 60s 白嫖。

---

- [ ] **Step 1: 修改 `hero.js` — `makeHero` 加字段 + `reviveHero` 改签名**

Edit `js/hero.js` — 完整替换 `makeHero` 和 `reviveHero`：

```javascript
function makeHero(r, c){
  return { r, c, emoji:'🦸', level:1, hp:120, maxHp:120, radius:1.6,
           stickCount:2,        // = 1 + level
           dps:30, alive:true, reviveCost:60, attackCd:0,
           reviveTimer: -1 };   // -1=alive, >0=counting down in seconds, 0=auto-revive ready
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

// instant=false → 自动半血复活; instant=true → 手动半血复活(花费金币, 立即)
function reviveHero(h, instant){
  h.alive = true;
  h.hp = Math.max(1, Math.round(h.maxHp * 0.5));  // 统一半血 [PLACEHOLDER]
  h.reviveTimer = -1;
}
```

更新底部的 module.exports / window 导出：

```javascript
if (typeof module!=='undefined') module.exports = { makeHero, upgradeHero, heroUpgradeCost, reviveHero };
else { window.makeHero = makeHero; window.upgradeHero = upgradeHero; window.heroUpgradeCost = heroUpgradeCost; window.reviveHero = reviveHero; }
```

- [ ] **Step 2: 在 main.js 的 `updateHero` 中加 revive timer tick**

Edit `js/main.js` — 找到 `updateHero` 函数，在英雄死亡段加 timer 递减逻辑。找到英雄 `alive=false` 的 return 分支，改为：

```javascript
function updateHero(dt){
  if (!g.hero) return;
  const h = g.hero;
  if (!h.alive){
    // ---- P1.3 复活倒计时 ----
    if (h.reviveTimer > 0) {
      h.reviveTimer = Math.max(0, h.reviveTimer - dt);
      if (h.reviveTimer <= 0) {
        // 自动复活：半血
        window.reviveHero(h, false);
      }
    }
    // ---- end P1.3 ----
    return;
  }
  // ... 原有 alive=true 逻辑 ...
}
```

还需在英雄死亡时（`h.alive = false`）初始化 timer。找到设置 `h.alive = false` 的位置，加一行：

```javascript
if (h.hp <= 0) {
  h.alive = false;
  h.reviveTimer = 60;  // <-- 新增：60s 倒计时 [PLACEHOLDER]
  h.hp = 0;
}
```

- [ ] **Step 3: 在 render 中画复活进度环**

Edit `js/main.js` — 在 render 函数中，英雄渲染段加倒计时环。找到绘制英雄的位置，在 `if (!h.alive)` 分支中加：

```javascript
// 在英雄死亡渲染段
if (!h.alive){
  // 复活进度环（在英雄位置画外环）
  const cx = h.c * CELL + CELL / 2;
  const cy = h.r * CELL + CELL / 2;
  const progress = 1 - (h.reviveTimer / 60);  // 0→1
  ctx.save();
  // 背景环
  ctx.beginPath();
  ctx.arc(cx, cy, CELL * 0.7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // 进度弧
  ctx.beginPath();
  ctx.arc(cx, cy, CELL * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = progress > 0.9 ? '#4ECDC4' : '#F6AD55';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 4: 在 popup 中加手动复活按钮**

Edit `js/main.js` — 找到 popup 渲染逻辑（通常在 `showPopup` 或类似函数）。当英雄死亡且有足够金币时，显示复活按钮。找到 `selected` 是英雄但 `h.alive === false` 的分支，在 popup HTML 中加：

```javascript
// 在选中英雄死亡的 popup 中
if (selected === 'hero' && g.hero && !g.hero.alive){
  const h = g.hero;
  const canAfford = g.gold >= h.reviveCost;
  const secLeft = Math.ceil(h.reviveTimer);
  popupEl.innerHTML =
    `<p>🦸 英雄已阵亡</p>`+
    `<p>⏳ 自动复活: ${secLeft}s 后 (半血)</p>`+
    `<button ${canAfford?'':'disabled'} onclick="manualReviveHero()">`+
      `💰 立即复活 (${h.reviveCost}💰, 半血)`+
    `</button>`;
}

// 新增函数
function manualReviveHero(){
  if (!g || !g.hero || g.hero.alive) return;
  const h = g.hero;
  if (g.gold < h.reviveCost) return;
  g.gold -= h.reviveCost;
  window.reviveHero(h, true);
  hidePopup();
  SFX.buy();  // 复用购买音效
}
```

- [ ] **Step 5: 浏览器手测**

打开 `index.html`，让英雄死亡：
1. 英雄死亡后位置显示复活进度环（从 0 顺时针走到满环）
2. 选中死亡英雄 → popup 显示 "⏳ 自动复活: Xs 后" + 手动复活按钮
3. 手动复活：扣金币，英雄立即半血复活，进度环消失
4. 自动复活：60s 后免费半血复活 [PLACEHOLDER]
5. 金币不够时手动复活按钮 disable

- [ ] **Step 6: 运行测试确认无回归**

```bash
node tests/test_map.js && node tests/test_balance.js && node tests/test_targeting.js && node tests/sim_playthrough.js
```

Expected: 全部 PASS。注意：test_targeting.js 和 sim_playthrough.js 不涉及英雄复活逻辑。

- [ ] **Step 7: Commit**

```bash
git add js/hero.js js/main.js
git commit -m "feat(p1.3): add hero revive countdown ring + manual instant-revive popup"
```

---

### Task 4: P1.4 塔克制标签

**Files:**
- Modify: `js/main.js:150-171` — `buildTowerBar` 函数

**Interfaces:**
- Consumes: `TOWER_TYPES[k].hitsAir`, `TOWER_TYPES[k].splash`
- Produces: DOM towerbar 按钮（每个按钮加 air/armor 克制标签）

---

- [ ] **Step 1: 修改 `buildTowerBar` 加克制标签**

Edit `js/main.js` — 找到 `buildTowerBar` 函数，修改按钮的 innerHTML，在费用后追加克制标签：

```javascript
function buildTowerBar(){
  const bar = document.getElementById('towerbar');
  bar.innerHTML = '';
  for (const k in window.TOWER_TYPES){
    const t = window.TOWER_TYPES[k];
    const b = document.createElement('button');
    b.className = 'tower-btn' + (g && g.selectedTowerType===k ? ' sel':'');
    b.type = 'button';
    // ---- P1.4 克制标签 ----
    const airTag = t.hitsAir ? '<span class="tag tag-green">🛬✓</span>'
                             : '<span class="tag tag-red">🛬✗</span>';
    const armorTag = t.splash > 0 ? '<span class="tag tag-green">🛡️✓</span>'
                                   : '<span class="tag tag-red">🛡️✗</span>';
    // ---- end P1.4 ----
    b.innerHTML = '<span class="tower-emoji">'+t.emoji+'</span>'+
                  '<span>'+t.name+'</span>'+
                  '<span class="tower-cost">💰'+t.cost+'</span>'+
                  '<span class="tower-tags">'+airTag+armorTag+'</span>';
    b.onclick = ()=>{
      if (!g) return;
      g.selectedTowerType = (g.selectedTowerType===k ? null : k);
      selected = null;
      hidePopup();
      buildTowerBar();
    };
    bar.appendChild(b);
  }
}
```

- [ ] **Step 2: 添加克制标签 CSS**

Edit `style.css` — 追加：

```css
/* P1.4 塔克制标签 */
.tower-tags { display: flex; gap: 2px; margin-top: 3px; font-size: 12px; }
.tag { padding: 1px 4px; border-radius: 3px; }
.tag-green { background: rgba(78,205,196,0.2); color: #4ECDC4; }
.tag-red { background: rgba(245,101,101,0.2); color: #F56565; }
```

- [ ] **Step 3: 浏览器手测**

打开 `index.html`，检查每种塔的标签：
| 塔 | 对空 | 破甲 | 原因 |
|----|------|------|------|
| 🏹 箭塔 | 🛬✗ | 🛡️✗ | hitsAir=false, splash=0 |
| ⚡ 电塔 | 🛬✓ | 🛡️✓ | hitsAir=true, splash=1.2 |
| 🎯 狙塔 | 🛬✓ | 🛡️✗ | hitsAir=true, splash=0 |
| 🔥 火塔 | 🛬✗ | 🛡️✓ | hitsAir=false, splash=0.8 |
| ❄️ 冰塔 | 🛬✓ | 🛡️✓ | hitsAir=true, splash=1.0 |
| 💣 炮塔 | 🛬✓ | 🛡️✓ | hitsAir=true, splash=1.5 |

- [ ] **Step 4: Commit**

```bash
git add js/main.js style.css
git commit -m "feat(p1.4): add air/armor counter tags to tower selection buttons"
```

---

## 自审

**1. Spec coverage:** 4 项 P1 全部覆盖，Task 0 覆盖 P1.2 前置埋点。

**2. Placeholder scan:**
- 复活倒计时 60s [PLACEHOLDER] — 已标注
- 复活血量 `maxHp*0.5` [PLACEHOLDER] — 已标注
- 分析建议阈值 `g.leaks > 3` / `> 5` / `> 2` — 试玩校准值，已标注在代码注释中
- 无 TBD/TODO

**3. Type consistency:**
- `g.kills` (number), `g.leaks` (number), `g.leaksPerWave` (Record<number,number>), `g.towerBuildHistory` (string[]) — Task 0 → Task 2 一致
- `h.reviveTimer` (number, -1=alive) — Task 3 Step 1 → Step 2 → Step 3 → Step 4 一致
- `reviveHero(h, instant)` — 新签名在 hero.js 和 main.js 中一致

**4. 无遗漏项。**

---

## 执行说明

Plan 共 5 个 Task（含 Task 0 前置），预计 2 天工效。

**Task 依赖链：**
```
Task 0 (GameState 埋点)
  └→ Task 2 (P1.2 失败复盘)

Task 1 (P1.1 射程预览) — 独立

Task 3 (P1.3 复活倒计时) — 依赖 hero.js 改动

Task 4 (P1.4 克制标签) — 独立
```

Task 0, 1, 3 (Step 1), 4 可以并行推进——互不依赖。
Task 3 Step 2-4 依赖 Step 1 的 hero.js 改动先落地。
Task 2 依赖 Task 0。

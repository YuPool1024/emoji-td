# Emoji 塔防 — 代码整体审查报告

> 审查日期：2026-07-13 ｜ 范围：`js/` 全部 17 文件 + `index.html`
> 方法：逐文件通读 + 单测/sim 回归 + 性能基准
> 结论：**架构健康，6 个逻辑测试 + 平衡测试全部通过，无语法错误。** 但存在 **1 个明确的逻辑 bug（英雄掉血）**、若干设计不一致，以及若干「每帧浪费」级别的性能点。

---

## 一、🔴 必须修复的逻辑错误

### 1. ~~英雄掉血按「每个范围内敌人」计算~~ ✅ 设计行为，每敌咬一口
**状态**：保留现状。已确认 `h.hp -= 4*dt` 在 per-enemy 循环内是故意的——每个敌人攻击英雄，群围威胁成立。
（审查原误判为此为 bug，已回退修复。）

**弃置**（用户确认这是设计行为，每只怪攻击英雄）。

### 1. ~~英雄掉血按「每个范围内敌人」计算~~ （确认为设计行为）
**状态**：✅ 保留现状。每个敌人都咬英雄 4*dt——群怪威胁符合"英雄会被围死"的意图。已更新注释。


### 2. 开局倒计时闪现「4」
**位置**：`js/main.js` L147 `countdown = 3.5;` + `renderCountdown()` L1125 `Math.ceil(countdown)`
`countdown` 初值 3.5 → `ceil(3.5)=4`，开局前 0.5s 会显示「4」，随后才「3-2-1」。
**修复**：初值改 `3.0`，或显示处 `Math.min(3, Math.ceil(countdown))`。

---

## 二、🟡 设计 / 一致性问题

### 3. 溅射（splash）二次伤害不吃护甲
**位置**：`js/main.js` `applyTowerDamage()`
- 主目标：L294 `if (target.armor>0 && tw.splash===0) target.hp -= shot*(1-target.armor);`（吃护甲）
- 溅射目标：L311 `en.hp -= shot;`（**不吃护甲**）

即同一发炮弹，中心怪受护甲减伤、周围怪满额。若护甲是核心机制（破甲波、重甲），这会让范围塔变相「穿甲」。建议溅射也走同一套护甲规则，或显式注释为设计行为。

### 4. 成就只在「胜利」时判定
**位置**：`js/main.js` L1154 `if (win && panels.achievements && panels.achievements.checkUnlocks)`
`checkUnlocks()` 在 `showEnd` 里且仅当 `win`。但 `tactic_air`(击杀≥30飞行) / `tactic_armor` / `full_comp`(集齐6塔) / `completionist`(全 tier-3) 的 `check()` 本身**不要求胜利**。结果：你打出了 6 种 tier-3 却输掉 → 不记录。
建议：失败也调用一次 `checkUnlocks`（这些成就的 predicate 已正确，只是没机会跑）；同时 `first_win`/`pacifist` 等依赖 `won` 的保持原样即可。

### 5. 死亡英雄弹窗倒计时不刷新
**位置**：`js/main.js` L756 `showHeroPopup(h)` + `js/panels/popup.js` L64
英雄阵亡时弹窗写死 `Math.ceil(h.reviveTimer)`（当时 60s），之后**静态不变**；而 canvas 上的复活进度环是每帧活的。玩家看着「60s」不动，体验割裂。
建议：英雄存活期间若弹窗开着，每帧/每秒重渲染倒计时；或干脆以 canvas 环为准、弹窗只显示「自动复活中」。

### 6. `popup.panel` 定位硬编码 `CELL=50`
**位置**：`js/panels/popup.js` L17–18 `(c * 50 + 50)` / `(r * 50 + 50)`
`main.js` 的 `positionPopup` 用的是 `CELL` 变量，两处不一致。当前 `CFG.CELL=50` 没暴露问题，但一旦改格子尺寸弹窗会错位。
**修复**：改用 `window.CFG.CELL`。

### 7. `main.js` 的 `positionPopup()` 是死代码
**位置**：`js/main.js` L251 定义，`grep` 确认全程未被调用（弹窗自行 `panels.popup.show` 定位）。可删。

### 8. HUD 的 store 双喂机制冗余
`panels.hud` 既在 `mount` 里 `store.subscribe`（L32），又被 `renderHUD()` 每帧 `update()` 直推（L898/L1144）。两者都走同一 `render()` 且都按签名去重，所以**无害**，但属于两套并行通道。可保留其一。

---

## 三、🟢 性能问题（可优化，非瓶颈）

### 9. `canPlace`（Dinic 最大流）每帧调用 —— 最大浪费点 ⭐
**位置**：`js/main.js` `renderHoverPreview()` L907–909，经 `render()` 每帧调用
```js
try { canFit = window.canPlace(g.map, r, c); } catch(_) { canFit = false; }
```
**基准实测**：单次 `canPlace` ≈ 0.047ms。选中塔 + 鼠标悬停路面时，**每帧 60 次/s = ~2.8ms/帧**（约占 16.6ms 预算的 17%），且地图在两次放塔之间根本不变 → 纯浪费。低端机更明显。
**修复**（任选其一，推荐前者）：
- 缓存：以 `map` 维护 `placeVersion`，放塔时 `+1`；`renderHoverPreview` 仅当 `mouseGrid` 或 `placeVersion` 变化才重算 `canFit`；
- 或仅当 `mouseGrid` 相对上一帧改变时才算（鼠标不动即跳过）。

### 10. `updateEnemies` 每帧 `filter` 新建数组
**位置**：`js/main.js` L684 `g.enemies = g.enemies.filter(e=>!e.dead);`
每帧分配一个新数组（~60 次/s × 敌人数）。建议原地压缩（双指针写回），减少 GC 抖动。

### 11. `updateHero` 对每个敌人算两次 `dist`
**位置**：`js/main.js` 伤害循环 L736 一次 + stuck 清除循环 L750 又一次，两个完整 O(n) 遍历。可合并为单遍：在循环内同时处理 `stuck` 置位/清除，省掉第二个 `dist`。

### 12. 投射物数组只从头部 `shift` 已到达项
**位置**：`js/main.js` `updateProjectiles()` L375
```js
while (projectiles.length && projectiles[0].arrived) projectiles.shift();
```
若队首飞行中、中间某发先到达（`arrived=true`），它要等队首到达后才被移除。期间居中存在但不渲染/不更新（无泄漏，但数组会短期滞留）。可改成原地压缩或反向遍历 `splice`。

### 13. `SFX.noise` 每次新建 `AudioBuffer`
**位置**：`js/audio.js` L51–56
每次音效 `noise()` 都 `createBuffer` + 填随机样本（开火/命中高频触发，24 塔满编时 ~100+ 次/s）。属次要，可预生成噪声缓冲复用或池化。

---

## 四、小项 / 可读性

| # | 位置 | 说明 |
|---|------|------|
| 14 | `js/panels/hero-select.js` L35 | `if (hh && !hh.unlock \|\| (...))` 优先级靠 `&&` 先结合侥幸正确，但可读性差，建议加括号 |
| 15 | `js/hero.js` L13 | `makeHero` 的 `attackCd:0` 字段**从未被读取**，死字段 |
| 16 | `js/game.js` L35 | `startNextWave` 内 `if (g.wave > CFG.WAVES) WON` 从主循环不可达（L498 已先判 `>=`），防御性死代码 |
| 17 | `js/main.js` L462–468 | 倒计时归零分支逻辑正确，但 `countdownLastSec>0` 守卫与 L458 的 `sec<=3` 略冗余，可简化 |

---

## 五、回归验证（本次审查时）

```
node --check 全部 17 个 JS 文件          ✅ 无语法错误
test_map / test_balance / test_targeting ✅ PASS (targeting 52/52)
test_recipes / test_tier3 / test_store  ✅ PASS
```
> 注：标准 3 档测试与 462 DPS 封顶红线保持有效（与历史一致）。

---

## 六、优先级建议

| 优先级 | 项 | 工作量 |
|--------|-----|--------|
| P1 | #9 canPlace 缓存 | ~10 行，已完成 |
| P1 | #2 倒计时「4」 | 1 行 |
| P2 | #4 失败也判定成就 | ~3 行 |
| P2 | #3 溅射护甲一致性 | 设计决策 + 数行 |
| P3 | #5 弹窗倒计时刷新 / #6 CELL 硬编码 / #10–12 性能精炼 | 各数行 |

需要我直接把上面任意一项修掉吗？建议先动 **#1**（显著影响平衡）和 **#9**（每帧白烧 2.8ms）。

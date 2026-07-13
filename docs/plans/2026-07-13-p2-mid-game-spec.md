# Spec 2: P2 中局级 4 系统

> **状态**：设计中 → 等待用户审阅
> **关联**：`docs/plans/2026-07-13-playability-roadmap.md` §4
> **前置**：Spec 1 (UI Step A) 落地后开工
> **注意**：本 spec 不含 UI 重构（Spec 1/3 单独）

---

## 0. 目标

P2 含 4 个系统，目标是给中后期带来节奏变化与决策深度：
- **P2.1 特殊波次** — 打破 10 波同构感
- **P2.2 终极塔升级** — 6 种塔 tier-3 终态
- **P2.3 暂停/倍速** — 玩家掌控节奏
- **P2.4 新手引导卡** — 60 秒上手

每个系统都是**单方向 spec** 落地，按 AGENTS.md 流程：spec → 计划 → 实现 → 审查。

---

## 1. P2.3 暂停/倍速（最简单，1d）

### 1.1 Mechanic

| 键 | 行为 |
|----|------|
| `Space` | toggle 暂停/继续 |
| `1` | 1× 正常速度 |
| `2` | 1.5× 加速 |
| `3` | 2× 加速 |

- 倍速状态实时显示在 HUD：右上角"⏸ 暂停" / "1.0×" / "1.5×" / "2.0×"
- 暂停时所有动画停（wave/countdown/敌人/塔/英雄/特效全停），但 HUD 可点击、塔栏可选、弹窗可交互
- 倍速生效时 wave/countdown 也要按比例走完

### 1.2 实现陷阱

主循环 `loop` 现有 `dt = Math.max(0, Math.min(0.05, (now-last)/1000))` 上限 0.05。
**若 2× 时简单 `dt *= 2` 会被 clamp 吃掉** → 速度不变。

**正确做法**：按倍速 N 在每帧内调用 N 次 `update(dt)`，dt 保持 ≤ 0.05。

```js
// 伪代码
function loop(now){
  const rawDt = (now - last) / 1000;
  last = now;
  if (paused) {
    // 仅渲染，不更新
    render();
  } else {
    const ticks = speedMul;  // 1, 1.5, 2
    const dt = Math.min(0.05, Math.max(0, rawDt));
    for (let i = 0; i < ticks; i++) {
      update(dt);
    }
    render();
  }
  requestAnimationFrame(loop);
}
```

**注意**：当 `speedMul = 1.5` 时，一帧内调 1.5 次 update 不能整数化。两种解法：
- **A**：把 update 改成接受 scaled dt（即 `update(dt * speedMul)`），但要小心 dt 上限
- **B**：累加余数，每帧按需要执行 0/1/2 次 update

**采用 B**：

```js
let tickAcc = 0;
function loop(now){
  const rawDt = (now - last) / 1000;
  last = now;
  if (!paused){
    tickAcc += rawDt * speedMul;
    const dt = 0.05;  // 固定步长
    while (tickAcc >= dt){
      update(dt);
      tickAcc -= dt;
    }
  }
  render();
  requestAnimationFrame(loop);
}
```

这样 1.5× 时一帧可能执行 0 或 1 次 update（取决于累加），2× 时 0/1/2 次。物理/AI 时间步长恒定 0.05s，结果一致。

### 1.3 实现位置

`js/main.js`：
- 加全局状态：`paused` (bool), `speedMul` (number 1/1.5/2), `tickAcc` (number)
- 加 `keydown` 监听器
- 改 `loop` 累加器模式
- HUD 加状态显示（在 panels/hud.js 中实现，依赖 main.js 暴露的 paused/speedMul）

### 1.4 状态

`{ paused: bool, speedMul: 1 | 1.5 | 2 }` 作为可观察状态，由 main.js 持有，hud panel 读取。

### 1.5 测试

- 单元测试：`tests/test_pause_speed.js`，mock 时间推进 10s，验证累计 update 次数 = 期望 ticks
- 浏览器手测：Space 暂停/继续、1/2/3 切倍速、暂停时点塔/出售

---

## 2. P2.1 特殊波次（中，2d）

### 2.1 Mechanic

6 种 **wave recipe**，按波号 → recipe id 映射：

| 波 | Recipe | 组成 | 体验目标 |
|----|--------|------|---------|
| 1–3 | `swarm` | 默认（现有逻辑） | 入坑期 |
| 4 | `swarm_reinforce` | 偶发 elite + 大量小怪 | "突然爆一波" |
| 5 | `elite_rush` | 全 elite + 1 boss 提前露头 | "精英海来了" |
| 6–8 | `standard` | 恢复节奏 | 恢复呼吸 |
| 9 | `armor_break` | 重甲为主 | "我得换打法" |
| 10 | `finale` | Boss + 双精英 + 大波 | 收官爆点 |

### 2.2 数据模型

需要在 `ENEMY_FAMILIES` 旁加 **ENEMY_TIERS**：

```js
const ENEMY_TIERS = {
  normal: { hpMul: 1.0, speedMul: 1.0, goldMul: 1.0, size: 1.0, badge: '' },
  elite:  { hpMul: 3.0, speedMul: 0.9, goldMul: 2.5, size: 1.2, badge: '⭐' },
  boss:   { hpMul: 10.0, speedMul: 0.7, goldMul: 10.0, size: 1.5, badge: '👑' },
};
```

`makeEnemy(familyKey, wave, diffKey, tier='normal')` 接受 tier 参数，HP/速度/金币/size 乘以对应倍数。

### 2.3 Recipe 表

新建 `js/recipes.js`：

```js
const WAVE_RECIPES = {
  swarm: {
    1: [{family:'swarm', tier:'normal', count:1.0}],
    2: [{family:'swarm', tier:'normal', count:1.0}],
    3: [{family:'swarm', tier:'normal', count:1.0}],
  },
  swarm_reinforce: {
    4: [
      {family:'swarm', tier:'normal', count:1.5},
      {family:'swarm', tier:'elite', count:0.2},
    ],
  },
  elite_rush: {
    5: [
      {family:'demon', tier:'elite', count:1.0},
      {family:'deep', tier:'elite', count:1.0},
      {family:'swarm', tier:'elite', count:0.5},
      {family:'demon', tier:'boss', count:0.1},  // 1/10 概率出 boss
    ],
  },
  standard: {
    6: [{family:'swarm', tier:'normal', count:1.0}],
    7: [{family:'swarm', tier:'normal', count:1.0}],
    8: [{family:'swarm', tier:'normal', count:1.0}],
  },
  armor_break: {
    9: [
      {family:'demon', tier:'normal', count:2.0},
      {family:'demon', tier:'elite', count:0.3},
    ],
  },
  finale: {
    10: [
      {family:'swarm', tier:'normal', count:1.5},
      {family:'demon', tier:'elite', count:1.0},
      {family:'deep', tier:'elite', count:1.0},
      {family:'demon', tier:'boss', count:0.2},
    ],
  },
};
```

`getRecipeForWave(w)` → 返回 `{recipeId, slots[]}`。

### 2.4 改 spawnWave

```js
function spawnWave(w, diffKey){
  const m = DIFF[diffKey].m;
  const recipe = getRecipeForWave(w);
  const list = [];
  for (const slot of recipe.slots){
    const n = Math.max(1, Math.round(slot.count * m * (1 + 0.12*(w-1))));
    for (let i = 0; i < n; i++) list.push({family: slot.family, tier: slot.tier});
  }
  return list;
}
```

返回结构从 `'swarm'` 字符串改为 `{family, tier}` 对象。**所有调用方需同步更新**（main.js 的 spawn 段、sim_playthrough.js 等）。

### 2.5 Boss 视觉

- 敌人绘制加 `tier === 'boss'` 红色光环 + `tier === 'elite'` 金色光环
- HP 条宽度按 `tier.size` 缩放

### 2.6 配方名横幅

每波开始时，wave banner 改为显示配方名 + 提示：

```
🌊 第 5 波
👑 精英海来了
```

`showWaveBanner(wave, recipeId)` 接受 recipeId 查 `WAVE_RECIPES` 的 displayName。

### 2.7 实现位置

- 新建 `js/recipes.js`
- 改 `js/enemies.js`：`ENEMY_TIERS` + `makeEnemy(...,tier)` + `spawnWave` 返回新结构
- 改 `js/main.js`：spawn 段读取新结构、render 敌人加光环、showWaveBanner 加副标题
- 改 `tests/sim_playthrough.js`：mock spawnWave 返回新结构

### 2.8 测试

- 单元测试：`tests/test_recipes.js`
  - `getRecipeForWave(1)` → `swarm` recipe
  - `getRecipeForWave(4)` → `swarm_reinforce`
  - 9 阶差 + 10 阶 finale 都正确
  - 同一波号两次调用结果一致
- 回归：sim_playthrough 跑 3 档，确认硬档仍能通关（boss tier 数值要标 [PLACEHOLDER]）

---

## 3. P2.4 新手引导卡（中，1d）

### 3.1 Mechanic

3 张轮播卡：

| 序号 | 内容 |
|------|------|
| 1 | "👋 选塔 → 点格子放塔(至少留一条路给敌人走)" |
| 2 | "🦸 选塔时直接点空地 → 部署英雄(范围持续攻击+定身)" |
| 3 | "🛰️ 切硬核前,记得:电/狙/炮 可打飞行, 重甲需要持续伤害" |

### 3.2 触发与时序

**A/B 痕迹**：硬档不出引导卡（硬档默认玩家已会）。

**时序**（方案 C，已拍板）：
```
玩家选难度 (非硬档)
  → 进入 PLAYING
  → 0s: 屏幕底部从右向左滑出卡片 #1
  → 2.5s: 切到卡片 #2
  → 5s: 切到卡片 #3
  → 7.5s: 出现 "👁 我已了解" 按钮
  → 玩家点击 → 卡片淡出 + 启动 3.5s 倒计时 → 第一波
```

若 7.5s 内玩家点 "跳过" → 直接启动倒计时。

### 3.3 实现位置

- 新建 `js/panels/onboarding.js`（属于 UI 重构 Step A 之外的独立 panel，挂在 `<div id="onboarding">`，新 DOM 节点）
- 改 `index.html`：加 `<div id="onboarding"></div>` 占位
- 改 `js/main.js`：`startGame` 在 `countdown = 3.5` 之前先 `panels.onboarding.start(diff)`
- onboarding panel 内部维护 timer 和 click 事件
- 完成后回调 `ui.emit('ONBOARDING_DONE')` → main.js 设 countdown=3.5

### 3.4 视觉

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│                                              │
│           ╔════════════════════╗             │
│           ║  👋 选塔 → 点格子放塔   ║             │
│           ║  (至少留一条路给敌人走)   ║             │
│           ╚════════════════════╝             │
│                                              │
│           ● ○ ○        [跳过]                │
└──────────────────────────────────────────────┘
```

- 卡片从底部 30% 处居中显示
- 进度点显示当前第几张
- "跳过" 按钮 7.5s 后变 "我已了解"

### 3.5 测试

- 浏览器手测：非硬档触发，硬档不触发
- 3 张卡正确切换
- 7.5s 跳过 / 立即跳过都进入倒计时

---

## 4. P2.2 终极塔升级（最重，2d）— 必须在 Spec 1 后落地

### 4.1 Mechanic

`level === 2 → 3` 升级是 tier-3 终态，需要消耗 `tier3Cost`（基础价 3 倍 [PLACEHOLDER]），并弹确认对话框：

```
💎 终极升级 — 花费 250💰
将获得 [perk 名]
[取消] [确认升级]
```

### 4.2 Tier-3 Perk 一览

| 塔 | Perk 效果 | 实现 |
|----|----------|------|
| 🏹 箭塔 | 三连射(命中 / 命中 / 命中) | 一次 fireTower 调 3 次 applyTowerDamage，命中位置略微偏移 |
| ⚡ 电塔 | 链式闪电(命中后弹射 3 个相邻怪) | 命中后选最近的 3 个其他怪，依次 applyTowerDamage |
| 🎯 狙塔 | 穿透(一发贯穿一条直线) | 不只命中第一个目标，沿 tw→target 方向继续找下一个敌人 |
| 🔥 火塔 | 真 DoT(4s 持续灼烧) | 命中后给敌人加 `dot: {dmg: X, expire: now+4}` 字段，updateEnemies 中按 dt 扣血 |
| ❄️ 冰塔 | 群冻(目标及 1.5 半径内冻 1.5s) | 命中后对范围内所有敌人加 `slowT = max(slowT, 1.5)` |
| 💣 炮塔 | 散射(3 发扇形霰弹) | 一次 fireTower 弹 3 个投射物，angle 偏移 ±15° |

### 4.3 数据模型

`TOWER_TYPES.<key>` 加 `tier3` 字段：

```js
arrow: {
  ...,
  tier3: {
    cost: 150,        // 基础价 3 倍 [PLACEHOLDER]
    perk: 'triple',   // 标识 perk 类型
    perkName: '三连射',
  },
}
```

`makeTower` 不变（tier-3 是 level 3 状态）。
`upgradeTower` 检测 `level === 2 → 3` 时返回 `{ needsConfirm: true, cost: t.tier3.cost, perk: t.tier3.perk }` 而不直接升级。
popup 弹确认 → 用户确认后调 `applyTier3(tw)` 真正升级。

### 4.4 实现路径

1. `towers.js`：TOWER_TYPES 加 tier3 字段 + 新增 `applyTier3(tw)` 函数
2. `main.js`：
   - `updateTowers` 加 perk 分支：triple / chain / pierce / dot / freeze / spread
   - `fireTower` 按 perk 分发
   - `applyTowerDamage` 处理 pierce（继续找下一目标）
3. 弹窗确认（依赖 Spec 1 的 popup panel）：
   - popup 新增 `kind: 'tower-tier3'` 分支
   - 升级按钮 onClick 调 `applyTier3` 而非 `upgradeTower`
4. 视觉：塔 emoji 套光圈金边（drawTower 改）

### 4.5 平衡校准

**红线**：每加 tier-3，sim_playthrough 跑 200 次硬档，确认 462 DPS 封顶不动摇。

**风险**：tier-3 太强会破坏平衡。
**缓解**：
- `tier3.cost` 标 [PLACEHOLDER]，先用 3× 基础价试玩
- sim_playthrough 加 `runWithTier3()` 模式，把 6 种塔都升到 tier-3，看是否 1v1 能力超出 462 DPS
- 不强 → 收紧数值；过强 → 加 cooldown

### 4.6 测试

- 单元测试：`tests/test_tier3.js`
  - mock 场景：3 个敌人排成线 → 狙塔 tier-3 一次性扣 3 个人的血
  - mock 场景：3 个怪聚集 → 火塔 tier-3 给每人加 4s dot
  - mock 场景：箭塔 tier-3 1 次 fire 触发 3 次 applyTowerDamage 调用
  - 回归：sim_playthrough 跑 3 档 × 5 次（无 tier-3 + 全 tier-3），DPS 封顶稳定

---

## 5. 4 个系统的依赖与顺序

```
P2.3 暂停/倍速  ──────┐
                       ├──→  P2.1 特殊波次  ──┐
P2.4 新手引导卡 ──────┤                      ├──→  P2.2 终极塔升级  ──→  UI Step B (store)
                       │                      │
                (Spec 1 UI Step A 先落地) ───┘
```

**P2.3 + P2.4 可以并行**（互不依赖）。
**P2.1 依赖 P2.3**（不依赖，但建议 P2.3 先稳）。
**P2.2 必须在 Spec 1 之后**（popup panel 抽取 + tier-3 弹窗）。

实际推进顺序：
1. Spec 1: UI Step A
2. P2.3 暂停/倍速（1d，依赖 Spec 1 的 hud 显示位置）
3. P2.4 引导卡（1d，依赖 Spec 1 的 panel 模式）
4. P2.1 特殊波次（2d，独立）
5. P2.2 终极塔升级（2d，依赖 popup panel + 平衡校准）

---

## 6. 不在 P2 范围（明确）

- 成就系统（P3.1）
- 每日挑战（P3.3）
- 多英雄（P3.4）
- UI 重构 Step B / store.js（Spec 3）
- 难度扩档（用户已确认保留 3 档）
- BGM / 排行榜 / 装备系统

## 7. 测试策略

| 系统 | 测试 |
|------|------|
| P2.3 暂停/倍速 | 单元测试累加器 + 浏览器手测 |
| P2.1 特殊波次 | 单元测试 recipe 映射 + sim 回归 |
| P2.4 引导卡 | 浏览器手测（DOM 元素） |
| P2.2 终极塔 | 单元测试 perk 行为 + sim 200 次硬档回归 |

**红线**：每个 P+ 系统落地后都跑全套 `node tests/test_*.js && sim_playthrough.js`，确认：
- 三档仍能通关
- 封顶 462 DPS 不动摇
- sim_playthrough 输出波数与之前一致（±5%）

## 8. 验收

- P2.3 暂停/倍速：Space 暂停生效，1/2/3 切速生效，HUD 显示状态
- P2.1 特殊波次：每波用对应 recipe，4/5/9/10 波有可见特殊效果
- P2.4 引导卡：非硬档触发，3 卡轮播，跳过进入倒计时
- P2.2 终极塔：6 塔都能升 tier-3，perk 行为符合表格，全套测试通过

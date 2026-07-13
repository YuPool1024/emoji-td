# Spec 3: UI 重构 Step B — 状态总线 store.js

> **状态**：设计中 → 等待用户审阅
> **关联**：`docs/plans/2026-07-13-playability-roadmap.md` §6.2 Step B
> **前置**：Spec 1 (UI Step A) 落地

---

## 0. 目标

引入 `js/store.js`（~50 行），提供轻量发布订阅。让 panel 订阅自己关心的 game state slice，main.js 不再"状态变化时显式调用 panel.update()"。

**核心价值**：成就 / 每日挑战 / 多英雄这些"跨局"信息需要集中地（localStorage 持久化 + 跨 menu/play 状态共享），store 提供这个集中点。

---

## 1. 现状 vs 目标

### 1.1 现状（Spec 1 之后）

```js
// main.js
panels.hud.mount(...);
panels.towerbar.mount(...);
// ...
function loop(now){
  // ...
  panels.hud.update(g);  // 显式调用
  // ...
}
```

**问题**：
- 状态变化要散布显式调用（建塔调一次、漏怪调一次、HUD 改一次）
- 跨局状态（成就、每日种子、英雄解锁）没集中地，要散布在 localStorage + 多处
- panel 仍依赖 main.js 显式 push

### 1.2 目标

```js
// panels/hud.js
function createHudPanel(){
  const unsub = store.subscribe(state => {
    // 重新渲染 HUD
  });
  return { mount, unmount: unsub, ... };
}

// main.js
function startGame(diff){
  store.setState({ ...currentState, gold: 100, wave: 0 });
  // 不再需要显式 panels.hud.update(g)
}
```

**panel 通过订阅自动响应**，main.js 只需 `setState` 一处。

---

## 2. store.js 设计

### 2.1 API

```js
const store = {
  getState(): State,
  setState(partial | (state) => partial): void,
  subscribe(listener): unsubscribe,
  // 可选便捷方法
  select(selector): 当前 selector(state) 值,
}
```

### 2.2 完整实现（~50 行）

```js
(function(){
  let state = {};
  const listeners = new Set();
  let scheduledNotify = false;
  
  function getState(){ return state; }
  
  function setState(partial){
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = Object.assign({}, state, next);
    scheduleNotify();
  }
  
  function scheduleNotify(){
    if (scheduledNotify) return;
    scheduledNotify = true;
    // 合并同一帧的多次 setState
    Promise.resolve().then(() => {
      scheduledNotify = false;
      for (const l of listeners) l(state);
    });
  }
  
  function subscribe(listener){
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  
  function select(selector){
    return selector(state);
  }
  
  if (typeof module !== 'undefined') module.exports = { getState, setState, subscribe, select };
  else window.store = { getState, setState, subscribe, select };
})();
```

**关键设计**：
- **微任务合并**：同一帧内的多次 setState 合并成一次 notify（避免重复渲染）
- **不可变更新**：每次 setState 返回新 state（panel 通过 `===` 比对判断）
- **极简 API**：4 个方法，无 immer / 无 reselect / 无 dev tools

### 2.3 不引入

- ❌ immer（多 30KB，加深调试栈）
- ❌ 中间件（不必要，panels 直接调 `store.setState`）
- ❌ 持久化（localStorage 持久化交给 panel 自己处理，store 只管内存）
- ❌ 跨 tab 同步（不在 P2 范围）

---

## 3. State 形状

### 3.1 初始 state

```js
const initialState = {
  // ---- 当前局内状态 ----
  game: null,                  // GameState 对象（createGame 返回值）或 null
  selectedTowerType: null,     // 当前选中的塔类型
  selected: null,              // { kind: 'tower'|'hero', ref: ... }
  mouseGrid: null,             // {r, c} 或 null
  paused: false,
  speedMul: 1,
  
  // ---- UI 状态 ----
  countdown: 3.5,
  countdownLastSec: -1,
  waveBanner: null,            // { wave, recipeId, life } 或 null
  spawnTimer: 0,
  
  // ---- 跨局状态（localStorage 持久化，Step B 先做内存版）----
  achievements: [],            // ['first_win', 'hard_clear', ...]
  dailySeed: null,             // 当前每日种子
  dailyRuns: [],               // [{seed, time, wave, killed, leaked}, ...]
  heroes: ['warrior'],         // 已解锁英雄: ['warrior', 'mage', 'hunter']
  selectedHero: 'warrior',
  
  // ---- 跨局 UI 状态 ----
  muted: false,                // 静音状态
};
```

### 3.2 状态分类

| 类别 | 状态 | 持久化 |
|------|------|--------|
| 局内 | `game`, `selectedTowerType`, `selected`, `mouseGrid` | 不持久 |
| 局内 UI | `countdown`, `waveBanner`, `spawnTimer`, `paused`, `speedMul` | 不持久 |
| 跨局 | `achievements`, `dailySeed`, `dailyRuns`, `heroes`, `selectedHero`, `muted` | localStorage |

**Step B 范围**：先做局内 + 局内 UI 状态的 store 化（消除 main.js 显式 panel.update 调用）。跨局状态在 P3 引入时再做 store 集成。

---

## 4. 集成路径

### 4.1 main.js 改 main 循环

**Before**（Spec 1 后）：
```js
function loop(now){
  const dt = ...;
  update(dt);
  render();
  panels.hud.update(g);  // 显式
  requestAnimationFrame(loop);
}
```

**After**：
```js
function loop(now){
  const dt = ...;
  update(dt);
  render();
  // panels 自动从 store 订阅，无需显式调用
  requestAnimationFrame(loop);
}
```

### 4.2 main.js 改 startGame

**Before**：
```js
window.startGame = function(diff){
  g = window.createGame(diff);
  countdown = 3.5;
  // ...
  buildTowerBar();  // 显式
  renderHUD();      // 显式
};
```

**After**：
```js
window.startGame = function(diff){
  store.setState({
    game: window.createGame(diff),
    countdown: 3.5,
    selectedTowerType: null,
    selected: null,
  });
};
```

towerbar panel 订阅 `state.selectedTowerType` 自动重建。
hud panel 订阅 `state.game.gold` / `state.game.baseHp` / `state.game.wave` 自动更新。

### 4.3 关键：setState 调用点散布

main.js 内部会有 ~20 处 `store.setState({ ... })` 替代直接修改 `g` 字段。例如：
- 漏怪处：原 `g.baseHp--` → 改 `store.setState({game: {...g, baseHp: g.baseHp-1, ...}})`
- 击杀处：原 `g.gold += 5` → 改 `store.setState({game: {...g, gold: g.gold+5}})`
- 选塔：原 `g.selectedTowerType = k` → 改 `store.setState({selectedTowerType: k})`

**注意**：用浅复制 `{...g, x: ...}` 保证不可变，panels 的 `subscribe` 才能 diff。

### 4.4 性能

每帧最多 60 次 setState（漏怪 + 击杀 + 移动）→ 合并成 1 次 notify。
panel 内做 `===` 浅比较，只在变化时 re-render。

---

## 5. 与 ui.js 的关系

`ui.js`（Spec 1）有事件 emitter（`ui.on` / `ui.emit`）。
`store.js`（本 spec）有 state pub/sub（`store.subscribe` / `store.setState`）。

**两者职责分离**：
- **ui emitter**：处理用户行为（点击、键入）→ 调用 action handler
- **store**：处理状态变化 → 通知 panel 重新渲染

**关系流**：
```
panel 点击 → ui.emit('UPGRADE_TOWER', {tw})
  → main.js 的 ui.on('UPGRADE_TOWER', handler)
    → handler 改 store state
      → store notify
        → panel subscribe 自动 re-render
```

---

## 6. 文件级产出

### 6.1 `js/store.js` (新, 50 行)

按 §2.2 实现。

### 6.2 `js/panels/*` (改, Spec 1 基础上加订阅)

每个 panel 的 `mount` 改为：

```js
// panels/hud.js (示例)
function createHudPanel(){
  let lastGold = -1, lastHp = -1, lastWave = -1;
  const unsub = store.subscribe(state => {
    const g = state.game;
    if (!g) return;
    if (g.gold !== lastGold || g.baseHp !== lastHp || g.wave !== lastWave){
      lastGold = g.gold; lastHp = g.baseHp; lastWave = g.wave;
      renderHud(state);
    }
  });
  return { mount, unmount: unsub, ... };
}
```

### 6.3 `js/main.js` (改, Spec 1 基础上把状态全走 store)

- 移除 `g`, `selected`, `mouseGrid`, `countdown`, `selectedTowerType` 等模块级变量
- 全部通过 `store.getState()` 读取
- 全部通过 `store.setState({...})` 写入

### 6.4 `index.html` (改, 加 store.js script 标签)

```html
<script src="js/store.js"></script>
<script src="js/ui.js"></script>
<!-- panels/* -->
```

顺序：store 在 ui 之前，ui 依赖 store 不强（emit 和 setState 互不依赖，但 panle 依赖两者）。

---

## 7. 测试

### 7.1 单元测试 `tests/test_store.js`

- `getState()` 返回初始 state
- `setState({a:1})` 后 `getState().a === 1`
- `setState(prev => ({a: prev.a+1}))` 函数式更新正确
- 同一帧多次 setState 合并成一次 notify（用 microtask flush）
- `subscribe` 返回的 unsub 能正确取消

### 7.2 集成测试

- sim_playthrough 仍能跑（state 通过 store 流转不影响游戏逻辑）
- 浏览器手测：所有现有功能保持

### 7.3 性能

- 浏览器 DevTools Performance：1 局游戏中 notify 次数应 < 1000（60s × 60fps × 1 notify = 3600 max）
- HUD 重渲染：仅在 gold/hp/wave 变化时触发（不再是每帧 60 次）

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| setState 散布遗漏 → 状态不更新 | 审 review：grep 原 `g.x =` 模式，每处都改 setState |
| 浅复制性能问题 | benchmark；游戏实体数 < 100，浅复制开销 < 1ms/帧 |
| 微任务时序问题 | 单元测试覆盖合并逻辑；不依赖同步触发 |
| 与现有 `g` 变量混用 | 一次性迁移，旧 `g` 变量全删；不要混用 |
| panel 在 unmount 后仍订阅 | 严格调用 unsub()；mount 返回 unsub 接口 |

## 9. 验收

- `js/store.js` 落地，~50 行
- 局内状态全部走 store
- 局内 UI 状态全部走 store
- panel 通过 subscribe 自动响应
- `node tests/test_*.js && sim_playthrough.js` 全过
- 浏览器手测：现有所有功能保持
- 跨局状态（成就/每日/英雄解锁）先不接 store，留 P3 接入

## 10. 跨局状态接入（Step B 之外，留 P3）

- `localStorage['td_achievements']` ↔ `store.state.achievements`：成就解锁时同步双向写
- `localStorage['td_daily_seed']` ↔ `store.state.dailySeed`：每日挑战菜单打开时计算当日 seed
- `localStorage['td_heroes']` ↔ `store.state.heroes`：英雄解锁/选角

P3 引入时再做。本 spec 只建立 store 基础设施。

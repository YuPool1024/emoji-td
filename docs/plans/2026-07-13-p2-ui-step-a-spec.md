# Spec 1: UI 重构 Step A — 抽离 UI 组件层

> **状态**：设计中 → 等待用户审阅
> **关联**：`docs/plans/2026-07-13-playability-roadmap.md` §6.2 Step A
> **前置**：P1 已完成（5 commit 落 master）

---

## 0. 目标

把 `main.js`（已 41KB）按 UI 关注点拆分为独立 panel 文件，让"加新 UI 不破坏已有 UI"成为可能。**这是 P2.2 终极塔升级的硬性前置**（路线图 §6.3 明确）。

## 1. 当前问题（具体数据）

- `main.js` 41KB，IIFE 闭包，42 个函数
- DOM 操作集中在：`initMenu` L122-132 / `buildTowerBar` L151-178 / `showEnd` L1173-1236 / `showTowerPopup` L283-306 / `showHeroPopup` L308-339 / `renderHUD` L1163-1170 / `initMuteBtn` L1239-1254 / `flash` L242-250
- 4 个 panel 重叠职责：菜单/HUD/塔栏/弹窗/胜负/Flash 都直接操作 DOM
- `renderHUD` 每帧都重写 innerHTML（每帧 60 次 DOM 解析+替换）—— 同时是性能隐患
- 加新功能（成就/每日挑战/多英雄）都要在 main.js 尾部追加 — 单文件越长越难 audit

## 2. 目标架构

```
js/
  audio.js       (现有, 不动)
  utils.js       (现有, 不动)
  map.js         (现有, 不动)
  towers.js      (现有, 不动)
  enemies.js     (现有, 不动)
  hero.js        (现有, 不动)
  game.js        (现有, 不动)
  ui.js          ← 新增 (200 行): 通用 UI 工具 + uiDispatch
  panels/        ← 新增目录:
    menu.js      (主菜单: 难度选择)
    hud.js       (顶部状态栏: 金币/血量/波数/难度)
    towerbar.js  (塔栏: 塔按钮 + 克制标签)
    popup.js     (弹窗: 塔升级/英雄升级/复活)
    end.js       (胜负面板 + P1.2 复盘)
    toast.js     (Flash 短提示)
  main.js        (大瘦身: 只保留主循环 + 输入分派 + SFX 初始化)
```

### 2.1 panel 通用接口约定

每个 panel 模块导出工厂函数：

```js
function createMenuPanel(opts) {
  // ...
  return {
    mount(parentEl) {},    // 首次挂载到 DOM
    update(state) {},      // 状态变更时刷新 (可空 - 内部自管)
    unmount() {},          // 清理 (可空)
    show(opts) {},         // 显式显示 (用于菜单/胜负面板)
    hide() {},             // 显式隐藏
  };
}
```

**关键设计**：
- `mount` 调用一次，`update` 可被 game state 变化主动调用
- panel **不直接读写 `g`**，而是接收 `state` 参数（来自 main.js 显式调用或 store）
- panel **不直接持有 SFX 调用**，而是 emit action 给 main.js 分派（避免 panel 与 audio 模块耦合）

### 2.2 ui.js 提供的能力

```js
// 通用工具
ui.toast(message, duration=1200)        // 替代 flash() 临时提示
ui.modal(opts) -> { close() }            // 通用 modal
ui.confirm(opts) -> Promise<bool>         // 通用确认
ui.emitter()                              // 简单事件发布订阅
ui.on(action, handler)                    // 注册 action 监听
ui.emit(action, payload)                  // 派发 action (panel → main)
```

**Action 类型常量**（集中定义）：
- `START_GAME` `{diff}`
- `PLACE_TOWER` `{type, r, c}`
- `UPGRADE_TOWER` `{tw}`
- `SELL_TOWER` `{tw}`
- `UPGRADE_HERO` `{h}`
- `REVIVE_HERO` `{h, instant}`
- `END_REPLAY` `{action}` ('restart' | 'change-diff')
- `TOGGLE_MUTE` `{}`

### 2.3 main.js 的角色（瘦身后）

```js
// 伪代码 - 瘦身后 main.js 的核心结构
(function(){
  'use strict';
  // ... 现有 module-level 状态 ...
  
  const panels = {
    menu: createMenuPanel(),
    hud: createHudPanel(),
    towerbar: createTowerbarPanel(),
    popup: createPopupPanel(),
    end: createEndPanel(),
    toast: createToastPanel(),
  };
  
  // mount 一次
  panels.menu.mount(document.getElementById('overlay'));
  panels.hud.mount(document.getElementById('hud'));
  panels.towerbar.mount(document.getElementById('towerbar'));
  panels.popup.mount(document.getElementById('popup'));
  panels.toast.mount(document.getElementById('flash'));
  
  // action 分派
  ui.on('START_GAME', ({diff}) => { /* 现有 startGame 逻辑 */ });
  ui.on('UPGRADE_TOWER', ({tw}) => { /* 现有升级逻辑 */ });
  // ... 其他 actions ...
  
  function loop(now) {
    // dt 计算不变
    update(dt);
    render();
    panels.hud.update(g);  // 每帧或节流
    requestAnimationFrame(loop);
  }
})();
```

## 3. 关键设计决策

### 3.1 Panel 与 game state 通信

**采用 "显式 + 节流"** 而非 "订阅":

- main.js 在游戏状态变化的关键点（建塔/漏怪/金币变动）显式调用 `panels.hud.update(g)` 等
- `renderHUD` 不再每帧调用，改为状态变化时调用（消除每帧 innerHTML 重建）
- 优点：简单直接，不引入新机制；缺点：调用点要散布

**说明**：spec 只改"调用频率"（从 60fps 改为事件驱动），不引入 store（store 是 Step B，本 spec 不动）。

### 3.2 弹窗组件化

`showTowerPopup` 和 `showHeroPopup` 合并为一个 `popup` 组件：

```js
panel.show({ kind: 'tower', ref: tw, cost: uc });
panel.show({ kind: 'hero', ref: h, cost: uc });
panel.show({ kind: 'hero-dead', ref: h });
panel.hide();
```

popup 内部按 `kind` 分支渲染。**事件通过 ui.emit 上抛**：

- `UPGRADE_TOWER` / `SELL_TOWER` / `UPGRADE_HERO` / `REVIVE_HERO`

### 3.3 静态方法 → 工厂函数

**Before**：
```js
function showEnd(win) { /* 直接读写 DOM */ }
```

**After**：
```js
// panels/end.js
function createEndPanel() {
  let mounted = false;
  return {
    mount(parentEl) { mounted = true; this.parent = parentEl; },
    show(win, stats) { /* 渲染胜负面板 */ },
    hide() {},
  };
}
```

所有 panel 都遵循 factory + return interface 模式。

### 3.4 Canvas 渲染不重构

`render()` / `update()` / `drawTower()` 等纯 Canvas 绘制函数**不**在本次重构范围。UI 重构只动 DOM/事件/CSS 相关的部分。Canvas 渲染保持现有结构。

**理由**：
- Canvas 渲染耦合在主循环里，抽出需要 store（Step B）
- P2.4 引导卡是 DOM 元素，不需要 Canvas 配合
- 渐进式重构降低风险

## 4. 文件级产出

### 4.1 `js/ui.js` (新, 200 行)

```js
// exports:
//   ui.toast(msg, dur)
//   ui.modal(opts) -> { close() }
//   ui.confirm(opts) -> Promise<bool>
//   ui.on(action, handler)
//   ui.emit(action, payload)
//   ui.actions (常量)

(function(){
  const actions = {
    START_GAME: 'START_GAME',
    PLACE_TOWER: 'PLACE_TOWER',
    UPGRADE_TOWER: 'UPGRADE_TOWER',
    SELL_TOWER: 'SELL_TOWER',
    UPGRADE_HERO: 'UPGRADE_HERO',
    REVIVE_HERO: 'REVIVE_HERO',
    END_REPLAY: 'END_REPLAY',
    TOGGLE_MUTE: 'TOGGLE_MUTE',
  };
  
  const handlers = new Map();
  
  function on(action, handler) {
    if (!handlers.has(action)) handlers.set(action, []);
    handlers.get(action).push(handler);
  }
  function emit(action, payload) {
    const list = handlers.get(action) || [];
    for (const h of list) h(payload);
  }
  function toast(msg, dur = 1200) {
    const el = document.getElementById('flash');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), dur);
  }
  
  // ... modal / confirm 实现 ...
  
  if (typeof module !== 'undefined') module.exports = { on, emit, toast, actions, modal, confirm };
  else { window.ui = { on, emit, toast, actions, modal, confirm }; }
})();
```

### 4.2 `js/panels/menu.js` (新, 60 行)

导出 `createMenuPanel()`。渲染难度选择菜单（迁移自 `initMenu` L122-132）。

### 4.3 `js/panels/hud.js` (新, 50 行)

导出 `createHudPanel()`。渲染金币/血量/波数/难度（迁移自 `renderHUD` L1163-1170）。

### 4.4 `js/panels/towerbar.js` (新, 90 行)

导出 `createTowerbarPanel()`。渲染 6 塔按钮 + 克制标签（迁移自 `buildTowerBar` L151-178）。

### 4.5 `js/panels/popup.js` (新, 130 行)

导出 `createPopupPanel()`。处理塔/英雄弹窗的 3 种 kind（迁移自 `showTowerPopup` + `showHeroPopup`）。

### 4.6 `js/panels/end.js` (新, 110 行)

导出 `createEndPanel()`。处理胜利 + P1.2 失败复盘（迁移自 `showEnd` L1173-1236）。

### 4.7 `js/panels/toast.js` (新, 30 行)

导出 `createToastPanel()`。简单包装 `ui.toast()`，给 main.js 一个统一的"显示提示"接口。

### 4.8 `index.html` (改)

添加 6 个 panel 文件的 script 标签（在 main.js 之前）：

```html
<script src="js/ui.js"></script>
<script src="js/panels/menu.js"></script>
<script src="js/panels/hud.js"></script>
<script src="js/panels/towerbar.js"></script>
<script src="js/panels/popup.js"></script>
<script src="js/panels/end.js"></script>
<script src="js/panels/toast.js"></script>
```

### 4.9 `js/main.js` (改, 瘦身到 ~28KB)

保留：
- 全局状态 (`g`, `selected`, `mouseGrid`, `countdown`, 等)
- Canvas 初始化和 `ctx`
- 寻路/BFS 函数
- 鼠标输入处理 (canvas click/mousemove)
- 主循环 `update`/`render`/`loop`
- 投射物/命中/激光/飘字 的 spawn/update/render（纯游戏逻辑）
- 敌人/塔/英雄 update 逻辑
- 音效初始化 (initMuteBtn → 迁移到 panel?)
- panel mount 一次 + action 监听注册

移除：
- 全部 DOM innerHTML 赋值（迁移到 panel）
- `flash()` (迁移到 `ui.toast`)
- `initMenu` / `buildTowerBar` / `showTowerPopup` / `showHeroPopup` / `showEnd` / `renderHUD` / `initMuteBtn` (迁移到 panel)
- 弹窗 `positionPopup` / `hidePopup` (迁移到 popup panel)

## 5. 不在本次重构范围（明确）

- Canvas 渲染 (render/drawTower/projectiles 等) — 留 P2 推进时按需拆
- store.js 状态总线 — Step B 单独 spec
- 成就/每日挑战/多英雄 UI — P3 spec
- 任何新功能 — 这次只搬代码，不加新功能
- 测试覆盖 — 现有 sim_playthrough 验证回归

## 6. 测试与回归

### 6.1 回归测试
每步提交后跑：

```bash
node tests/test_map.js && \
node tests/test_balance.js && \
node tests/test_targeting.js && \
node tests/sim_playthrough.js
```

Expected: 全部 PASS，三档通关。

### 6.2 浏览器手测清单
- [ ] 菜单：选 3 档难度都能进入游戏
- [ ] HUD：金币/血量/波数/难度 显示正确，建塔/漏怪时数字更新
- [ ] 塔栏：6 塔 + 克制标签正确，点击选/取消
- [ ] 悬停预览：射程 + 对空标签显示
- [ ] 弹窗：点塔显示升级/出售；点英雄显示升级/复活；死亡显示倒计时 + 手动复活
- [ ] 胜负面板：胜利简单胜利界面；失败复盘显示击杀/漏怪/塔偏好
- [ ] 静音按钮可点击
- [ ] 暂停/倍速键位（若 P2.3 已实现）仍有效
- [ ] Esc/其他快捷键（如有）仍有效

### 6.3 性能验证
- HUD 不再每帧重建（DevTools 看 `#hud` 节点修改次数）
- 关键交互响应无明显延迟

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Panel 拆错边界 → 改不动 | Step A 不引入新功能，纯搬代码，边界错了也能改 |
| 弹窗 event 监听漏改 | 改完用 `ui.emit` 走统一通道，搜索现有 inline onclick 全部走 `START_GAME` 等 action |
| 动静态丢失 → Tower 可点击 | mount 时机：initMenu 与 startGame 分别 mount 一次，不要 mount 后又 unmount |
| Canvas/事件顺序错位 | 保留 IIFE 模块作用域，panel 持有闭包引用 |
| main.js 瘦身后功能丢失 | 行为不变对照清单：每行 main.js 删除前必须在新 panel 找到对应实现 |

## 8. 实施顺序（建议）

UI 重构 Step A 自身要拆成 5 个子任务（按风险从低到高）：

1. **新建 `ui.js`**：通用工具 + emitter，不动任何现有代码
2. **抽 `toast` panel**：flash() 替代，零风险
3. **抽 `hud` panel**：消除每帧 innerHTML 重建（小性能提升）
4. **抽 `towerbar` / `menu` / `end` panel**：纯搬，零行为变化
5. **抽 `popup` panel**：最大块，先小步做塔弹窗，再做英雄弹窗

每步独立 commit，每步跑测试。

## 9. 与 P2.2 的关系

**Spec 1 落地是 P2.2 终极塔升级的硬性前置**（路线图 §6.3）。

理由：tier-3 升级会涉及 6 种塔的弹窗变化（确认对话框 + 终极效果显示）。如果 popup 仍散在 main.js，改 6 处 view 不可控。先抽 popup panel，再做 tier-3，每种塔只需在 popup panel 的 `kind: 'tower-tier3'` 分支加 case。

## 10. 验收标准

- main.js 从 ~41KB 降到 ~28KB（估算）
- 6 个新 panel 文件 + 1 个 ui.js 工具文件
- 所有现有功能（菜单/HUD/塔栏/弹窗/胜负/Flash）行为不变
- HUD 改为事件驱动，不再每帧重建
- `node tests/test_*.js && sim_playthrough.js` 全过
- 浏览器手测清单全过

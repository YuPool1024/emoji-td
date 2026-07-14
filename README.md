# 🎮 Emoji 塔防 (Emoji Tower Defense)

> 一款纯原生 HTML5 Canvas + JavaScript 编写的浏览器塔防游戏 —— **零框架、零构建、零依赖**，双击 `index.html` 即玩。

用 Emoji 当塔、当怪、当英雄。虫群从地图一端涌来，你在有限的空位上布防、升级、召唤英雄，守住终点的血量撑过 10 波。

---

## ✨ 特性

- **6 种防御塔**，各有射程 / 伤害 / 溅射 / 对空 / 减速 / 灼烧的差异定位，均可三级终极升级
- **4 大敌人家族 × 3 个等级**（普通 / 精英 ⭐ / BOSS 👑），飞行、重甲、快攻各不相同
- **3 位英雄**（🦸 战士 / 🧙 法师 / 🏹 猎人），通过成就解锁，可部署、升级、复活
- **特殊波次配方**：虫群来袭、精英突袭、破甲波、终决战……每波有专属预告横幅
- **9 项成就系统** + **每日挑战**（UTC 日期播种，全球同一张地图与出怪，可复现）
- **暂停 / 变速**（×1 / ×2 / ×4）、**60fps 渲染上限**、屏内 **FPS 角标**与低性能提示
- **纯 Web Audio API 合成音效**，无任何外部音频资源
- **保证有解的地图**：随机地图算法保证始终存在 ≥2 条独立通路

---

## 🚀 运行

无需安装、无需构建：

```bash
# 方式一：直接双击
index.html

# 方式二：用任意静态服务器（可选，避免个别浏览器的本地文件限制）
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000
```

---

## 🕹️ 玩法与操作

| 操作 | 键位 / 方式 |
|---|---|
| 选择并放置塔 | 点击底部塔栏 → 点击地图空位 |
| 升级 / 出售塔 | 点击已建的塔 → 弹窗操作 |
| 部署 / 升级英雄 | 塔栏英雄按钮 / 点击英雄 |
| 暂停 · 继续 | `Space` |
| 变速 ×1 / ×2 / ×4 | `1` / `2` / `3` |

### 防御塔一览

| 塔 | 造价 | 定位 |
|---|---|---|
| 🏹 箭塔 | 50 | 廉价单体，地面 |
| ❄️ 冰塔 | 70 | 减速 + 溅射，可对空 |
| 🔥 火塔 | 80 | 灼烧持续伤害，地面 |
| ⚡ 电塔 | 90 | 快速溅射，可对空 |
| 💣 炮塔 | 110 | 大范围溅射，可对空 |
| 🎯 狙塔 | 120 | 超远射程高爆发，可对空 |

> 提示：**飞行敌人**只能被「可对空」的塔命中；**重甲敌人**会削减单体伤害，用溅射塔破甲更划算。

---

## 🧱 技术架构

单页应用，`index.html` 按依赖顺序加载 22 个经典脚本，全部运行在同一全局作用域：

```
audio → utils → map → towers → recipes → enemies → hero → game
      → store → ui
      → panels/*  (toast / hud / menu / towerbar / end / popup /
                   achievements / hero-select / daily)
      → main
```

- **`main.js`** —— IIFE 总装：`requestAnimationFrame` 主循环、渲染、输入、寻路（BFS 距离场）、面板生命周期
- **`store.js`** —— 极简发布/订阅状态总线（微任务批处理通知）
- **`ui.js`** —— 动作事件总线 + `toast`/`modal`/`confirm` DOM 辅助；面板只发意图、不改状态
- **`panels/*.js`** —— 每个 UI 面一个模块（工厂模式），只渲染 + 发动作

数据层：`towers.js` / `enemies.js` / `recipes.js` / `hero.js` / `map.js` / `utils.js`。

---

## 🧪 测试

无构建 / 无 lint，仅有基于 Node 的纯逻辑测试：

```bash
node tests/test_map.js          # 地图：随机地图恒有 ≥2 通路；canPlace 边界
node tests/test_balance.js      # 平衡：3 难度档，波10 平衡分区间
node tests/test_targeting.js    # 目标选择：射程 / 对空筛选 / 冷却 / 压制
node tests/test_recipes.js      # 配方：波次 → recipeId 映射
node tests/test_store.js        # 状态总线：setState/subscribe 微任务合并
node tests/test_tier3.js        # 三级：每塔均有终极配置
node tests/test_hero.js         # 英雄：攻击、升级回满、半血复活
node tests/test_pathfinding.js  # 寻路：per-enemy 漫游者比例与行为分歧
node tests/sim_playthrough.js   # 无头全对局模拟（开发工具）
```

> UI / 渲染行为无自动化测试，靠手动游玩（`index.html`）与 `sim_playthrough.js` 验证。

---

## 📁 目录结构

```
.
├── index.html          # 入口，加载全部脚本
├── style.css           # 样式
├── js/                 # 22 个模块（核心逻辑 + UI 组件层 + panels/）
├── tests/              # 9 个 Node 逻辑测试
├── docs/               # 设计文档、实施计划、代码评审记录
└── CODEBUDDY.md        # 面向 AI 协作者的项目指引
```

---

## 📄 授权

见 [LICENSE](LICENSE)。

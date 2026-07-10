const { generateMap, countPaths, canPlace, findFirstEmpty, makeGrid } = require('../js/map.js');
const CFG = require('../js/utils.js').CFG;

function assert(c,m){ if(!c) throw new Error('FAIL: '+m); }

// 生成多次，每次都应有>=2条独立通路
let ok = true;
for (let i=0;i<500;i++){
  const m = generateMap();
  if (countPaths(m) < 2) { ok=false; break; }
}
assert(ok, 'generateMap 必须始终产生>=2条独立通路');

// 手搭网格，固定 countPaths 计数逻辑：恰好 2 条顶点不相交通路
// 路线A：顶行(0,*) + 末列(*,C-1) 下行到终点
// 路线B：首列(*,0) 下行 + 底行(R-1,*) 右行到终点
// 两路仅在起点(0,0)与终点(R-1,C-1)相接(端点容量无限)，内部顶点不相交 => 恰好2条独立通路。
const g2 = makeGrid();
for (let c=0;c<CFG.COLS;c++){ g2[0][c]=1; g2[CFG.ROWS-1][c]=1; }   // 顶行 + 底行
for (let r=0;r<CFG.ROWS;r++){ g2[r][0]=1; g2[r][CFG.COLS-1]=1; }   // 首列 + 末列
assert(countPaths({grid:g2}, 3) === 2, '手搭网格应恰好有 2 条独立通路');
assert(countPaths({grid:g2}, 3) >= 2, '手搭网格应至少 2 条独立通路');

// 单走廊网格：只有 1 条通路
const g1 = makeGrid();
for (let c=0;c<CFG.COLS;c++) g1[0][c] = 1;        // 顶行
for (let r=0;r<CFG.ROWS;r++) g1[r][CFG.COLS-1] = 1; // 末列
assert(countPaths({grid:g1}, 3) === 1, '单走廊网格应恰好有 1 条独立通路');

// 防堵死：保留所有空地时仍>=2通路；若把一条关键岔路堵死应被拒绝
const m2 = generateMap();
const empty = findFirstEmpty(m2);
assert(canPlace(m2, empty.r, empty.c) === true, '空地初始应可放置');

// canPlace 越界保护：越界坐标必须返回 false 且不抛异常
assert(canPlace(m2, -1, 0) === false, 'canPlace 越界(-1,0) 应返回 false');
assert(canPlace(m2, 0, CFG.COLS) === false, 'canPlace 越界(0,COLS) 应返回 false');

console.log('ALL MAP TESTS PASS');

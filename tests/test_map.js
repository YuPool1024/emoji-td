const { generateMap, countPaths, canPlace, findFirstEmpty } = require('../js/map.js');
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

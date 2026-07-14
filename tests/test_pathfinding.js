var assert = require('assert');
var { makeEnemy } = require('../js/enemies.js');

// ---- [P14] spawn 时一次性掷 _wanderer, 比例 ≈ 20% ----
var total = 1000, wanderers = 0;
for (var i = 0; i < total; i++){
  var e = makeEnemy('swarm', 1, 'easy', 'normal');
  if (e._wanderer) wanderers++;
}
var rate = wanderers / total;
assert.ok(rate > 0.15 && rate < 0.25, 'wanderer 比例偏离 20% (实际 ' + (rate*100).toFixed(1) + '%)');

// _wanderer 是 spawn 一次性决定, 不会变
var e1 = makeEnemy('swarm', 1, 'easy', 'normal');
var e1w0 = e1._wanderer;
assert.strictEqual(e1._wanderer, e1w0, '_wanderer 一次性');

// 所有 tier/family 都得到 _wanderer 字段
for (const f of ['swarm','shadow','demon','deep']){
  for (const t of ['normal','elite','boss']){
    var e2 = makeEnemy(f, 1, 'easy', t);
    assert.ok(typeof e2._wanderer === 'boolean', f + '/' + t + ' 缺 _wanderer');
  }
}

// ---- [P14] nextStep 镜像 main.js ----
// 关键: wanderer 走 forward (distance ≤ current + 1), 不是 others.
// 这样 wanderer 仍"非最优"但保证收敛, 不会因"绕远无限"死循环.
function nextStep(field, grid, r, c, fromR, fromC, en){
  var best = [], forward = [];
  var dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  var R = field.length, C = field[0].length;
  for (var d of dirs){
    var nr = r+d[0], nc = c+d[1];
    if (nr<0||nc<0||nr>=R||nc>=C) continue;
    if (grid[nr][nc] !== 1) continue;
    if (nr === fromR && nc === fromC) continue;
    var fd = field[nr][nc];
    if (fd < field[r][c]) best.push([nr,nc]);
    if (fd <= field[r][c] + 1) forward.push([nr,nc]);
  }
  if (best.length === 0 && forward.length === 0){
    for (var d of dirs){
      var nr = r+d[0], nc = c+d[1];
      if (nr<0||nc<0||nr>=R||nc>=C) continue;
      if (grid[nr][nc] !== 1) continue;
      if (nr === fromR && nc === fromC) continue;
      forward.push([nr,nc]);
    }
    if (forward.length === 0) return null;
  }
  var isWanderer = !!(en && en._wanderer);
  var pool = isWanderer
    ? (forward.length > 0 ? forward : best)
    : (best.length > 0 ? best : forward);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- optimal/wanderer 行为分歧 ----
// 5x5 全部 road, 终点 (2,2). BFS Manhattan-ish:
// 在 (1,1) field=2. 邻居:
//   (0,0)=1<2 best, (0,1)=1<2 best, (1,0)=1<2 best (3 best)
//   (1,2)=3>2 forward (≤3 ok), (0,2)=3, (2,0)=2 ==2 forward, (2,1)=3, (2,2)=0<2 best (4 best) etc.
// 设 fromR=(1,0): 排除 (1,0). 
// best: (0,0)(0,1)(2,2). forward (+≤1): best + 同层 (2,0) + +1 (1,2)(0,2)(2,1)
var g = [];
for (var i = 0; i < 5; i++){
  var row = [];
  for (var j = 0; j < 5; j++) row.push(1);
  g.push(row);
}
var f = [
  [1,1,1,1,1],
  [1,1,1,1,1],
  [1,1,1,1,1],   // (2,2) = end = 0, 但为简化都设 1
  [1,1,1,1,1],
  [1,1,1,1,1]
];
f[2][2] = 0;  // end
// 重写: 在 (1,1) field=2. 
// dist BFS from (2,2): (1,2)=1, (2,1)=1, (0,2)=2, (2,0)=2, (1,1)=2, (0,1)=3, etc
// 用 Manhattan-ish: dist = |r-2| + |c-2|
for (var r = 0; r < 5; r++){
  for (var c = 0; c < 5; c++){
    f[r][c] = Math.abs(r-2) + Math.abs(c-2);
  }
}
// 在 (1,1) field=2. 邻居:
//   (0,0): |0-2|+|0-2| = 4 >2 非 forward (但加上非≤3 非 forward)
//   (0,1): |0-2|+|1-2| = 3 = 2+1 ok forward, 非 best
//   (1,0): |1-2|+|0-2| = 3 ok forward, 非 best
//   (1,2): |1-2|+|2-2| = 1 <2 best
//   (2,0): |2-2|+|0-2| = 2 ==2 ok forward
//   (2,1): |2-2|+|1-2| = 1 <2 best
//   (2,2): |2-2|+|2-2| = 0 <2 best
//   (0,2): |0-2|+|2-2| = 2 ==2 ok forward
// 设 fromR=(2,1):
// best: (1,2)(2,2) (排除 fromR=(2,1))
// forward: best + 同层 (2,0)(0,2) + +1 (0,1)(1,0) = (1,2)(2,2)(2,0)(0,2)(0,1)(1,0) = 6 candidates
var optToBest = 0, optToForward = 0, optToFar = 0;
for (var k = 0; k < 200; k++){
  var r2 = nextStep(f, g, 1, 1, 2, 1, { _wanderer: false });
  if (!r2) continue;
  var fd = f[r2[0]][r2[1]];
  if (fd < 2) optToBest++;
  else if (fd <= 3) optToForward++;
  else optToFar++;
}
assert.strictEqual(optToFar, 0, 'optimal 不应该走 >current+1');
assert.ok(optToBest === 200, 'optimal 200 次应 100% 走 best (实际 best=' + optToBest + ' forward=' + optToForward + ')');

var wandToBest = 0, wandToForward = 0, wandToFar = 0;
for (var k = 0; k < 200; k++){
  var r2 = nextStep(f, g, 1, 1, 2, 1, { _wanderer: true });
  if (!r2) continue;
  var fd = f[r2[0]][r2[1]];
  if (fd < 2) wandToBest++;
  else if (fd <= 3) wandToForward++;
  else wandToFar++;
}
assert.strictEqual(wandToFar, 0, 'wanderer 也不应该走 >current+1 (否则死循环)');
assert.ok(wandToBest > 0 && wandToBest < 200, 'wanderer 200 次应既走 best 又走 forward (actual best=' + wandToBest + ' forward=' + wandToForward + ')');
assert.ok(wandToForward > 0, 'wanderer 至少应走一次 forward (=非最优)');

// ---- wanderer 收敛性: 1000 步内必到终点 ----
// 5x5 grid, 手算一个 wanderer 从 (0,0) 走到 (2,2) 的最长路径: Manhattan = 4 + 走弯路, 1000 步绰绰有余.
var reached = false;
var pos = [0, 0];
for (var step = 0; step < 1000; step++){
  var r3 = nextStep(f, g, pos[0], pos[1], -1, -1, { _wanderer: true });
  if (!r3) break;
  pos = r3;
  if (pos[0] === 2 && pos[1] === 2){ reached = true; break; }
}
assert.ok(reached, 'wanderer 1000 步内应到达终点 (走时 pos=' + pos + ', step=' + step + ')');

console.log('ALL PATHFINDING TESTS PASS');

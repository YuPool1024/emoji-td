const CFG = (typeof module!=='undefined') ? require('./utils.js').CFG : window.CFG;

function makeGrid(){
  const g = [];
  for (let r=0;r<CFG.ROWS;r++){ g.push(new Array(CFG.COLS).fill(0)); }
  return g;
}

// 从(sr,sc)到(tr,tc) 随机DFS铺路，返回是否成功。
// blocked: 可选 Set，其中的单元格不可进入（用于强制第二条路避开第一条）。
// 返回铺好的路径坐标数组。
function carvePath(grid, sr, sc, tr, tc, blocked){
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
      if (nr===tr && nc===tc) { grid[nr][nc]=1; path.push([nr,nc]); return true; }
      if (visited.has(nr+','+nc)) continue;
      if (blocked && blocked.has(nr+','+nc) && !(nr===sr&&nc===sc)) continue;
      visited.add(nr+','+nc);
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

// 用 Dinic 最大流计算 起点->终点 的顶点不相交路径数（精确、快速）。
// 每个路面格拆成 in/out 两节点，容量1（起点/终点容量无限，可被所有路径共用）；
// 相邻路面格之间连容量1的边。最大流即独立通路数。
// 入参支持 map 对象或裸 grid。
function countPaths(map, capLimit=3){
  const grid = map.grid ? map.grid : map;
  const R=CFG.ROWS, C=CFG.COLS, N=R*C;
  const S=0, T=N-1; // (0,0) -> (R-1,C-1)
  const INF=1e9;
  // 建图：节点 0..N-1 为 in，N..2N-1 为 out
  const head=new Array(2*N).fill(-1);
  const to=[], ecap=[], nxt=[];
  function addEdge(u,v,c){
    to.push(v); ecap.push(c); nxt.push(head[u]); head[u]=to.length-1;
    to.push(u); ecap.push(0); nxt.push(head[v]); head[v]=to.length-1;
  }
  function inNode(r,c){ return r*C+c; }
  function outNode(r,c){ return N + r*C+c; }
  for (let r=0;r<R;r++) for (let c=0;c<C;c++){
    if (grid[r][c]!==1) continue;
    const isEnd = (r===0&&c===0) || (r===R-1&&c===C-1);
    addEdge(inNode(r,c), outNode(r,c), isEnd?INF:1);
    for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const nr=r+dr, nc=c+dc;
      if (nr<0||nc<0||nr>=R||nc>=C) continue;
      if (grid[nr][nc]!==1) continue;
      addEdge(outNode(r,c), inNode(nr,nc), 1);
    }
  }
  // Dinic
  const level=new Array(2*N).fill(-1);
  const it=new Array(2*N).fill(0);
  function bfs(){
    level.fill(-1); level[S]=0; const q=[S]; let qi=0;
    while(qi<q.length){ const u=q[qi++]; for(let e=head[u];e>=0;e=nxt[e]){ if(ecap[e]>0 && level[to[e]]<0){ level[to[e]]=level[u]+1; q.push(to[e]); } } }
    return level[T]>=0;
  }
  // 标准 Dinic DFS
  function dinicDFS(u,f){
    if (u===T) return f;
    for(;it[u]>=0; it[u]=nxt[it[u]]){
      const e=it[u];
      if (ecap[e]>0 && level[to[e]]===level[u]+1){
        const d=dinicDFS(to[e], Math.min(f, ecap[e]));
        if (d>0){ ecap[e]-=d; ecap[e^1]+=d; return d; }
      }
    }
    return 0;
  }
  let flow=0;
  while(bfs()){
    for(let i=0;i<2*N;i++) it[i]=head[i];
    let f;
    while((f=dinicDFS(S, INF))>0){ flow+=f; if (flow>=capLimit) break; }
    if (flow>=capLimit) break;
  }
  return flow;
}

function generateMap(){
  for (;;) {
    const grid = makeGrid();
    const p1 = carvePath(grid, 0, 0, CFG.ROWS-1, CFG.COLS-1);
    if (!p1) continue;
    // 用禁止集强制第二条路不与第一条路重合（节点不相交 => 至少2条独立通路）。
    const blocked = new Set(p1.map(([r,c]) => r+','+c));
    const p2 = carvePath(grid, 0, 0, CFG.ROWS-1, CFG.COLS-1, blocked);
    if (p2 && countPaths({grid}, 3) >= 2) {
      return { grid, start:[0,0], end:[CFG.ROWS-1,CFG.COLS-1] };
    }
  }
}

// 放置校验：模拟在(r,c)放障碍后，起点->终点是否仍>=2通路
function canPlace(map, r, c){
  if (r<0 || c<0 || r>=CFG.ROWS || c>=CFG.COLS) return false; // 越界保护
  if (map.grid[r][c] !== 0) return false; // 只能放空地
  map.grid[r][c] = 9; // 临时障碍
  try {
    const n = countPaths(map, 3);
    return n >= 2;
  } finally {
    map.grid[r][c] = 0;
  }
}

function findFirstEmpty(map){
  for (let r=0;r<CFG.ROWS;r++) for (let c=0;c<CFG.COLS;c++) if (map.grid[r][c]===0) return {r,c};
  return null;
}

if (typeof module!=='undefined') module.exports = { generateMap, countPaths, canPlace, findFirstEmpty, makeGrid, carvePath };

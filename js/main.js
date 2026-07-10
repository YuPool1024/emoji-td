// main.js —— 主循环、输入、渲染、HUD，打通可玩闭环
// 依赖全局（浏览器）：CFG, generateMap, canPlace, TOWER_TYPES, makeTower, upgradeTower,
// upgradeCost, spawnWave, makeEnemy, makeHero, upgradeHero, heroUpgradeCost, reviveHero,
// GameState, createGame, startNextWave, onKill, grantWaveReward, dist
(function(){
  'use strict';

  const CELL = window.CFG.CELL;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let g = null;
  let last = performance.now();
  let spawnTimer = 0;

  // 选中用于升级/出售的实体（塔或英雄）
  let selected = null; // { kind:'tower'|'hero', ref }

  // ---------- 寻路：基于路面格的 BFS 距离场 ----------
  // 返回 distField[r][c] = 该路面格到终点的最短步数；非路面格为 Infinity。
  function buildDistField(grid, end){
    const R = window.CFG.ROWS, C = window.CFG.COLS;
    const field = [];
    for (let r=0;r<R;r++) field.push(new Array(C).fill(Infinity));
    const [er,ec] = end;
    field[er][ec] = 0;
    const q = [[er,ec]];
    let qi = 0;
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    while (qi < q.length){
      const [r,c] = q[qi++];
      for (const [dr,dc] of dirs){
        const nr=r+dr, nc=c+dc;
        if (nr<0||nc<0||nr>=R||nc>=C) continue;
        if (grid[nr][nc]!==1) continue;       // 只走路面
        if (field[nr][nc] !== Infinity) continue;
        field[nr][nc] = field[r][c] + 1;
        q.push([nr,nc]);
      }
    }
    return field;
  }

  // 给定当前格与来源格，返回下一个要走的路面格（岔路随机选）。
  // 候选 = 路面邻居中 field 更小 且 不是来源格 的那些；若有多个取随机；若无则退回任意路面邻居。
  function nextStep(field, grid, r, c, fromR, fromC){
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    let candidates = [];
    for (const [dr,dc] of dirs){
      const nr=r+dr, nc=c+dc;
      if (nr<0||nc<0||nr>=window.CFG.ROWS||nc>=window.CFG.COLS) continue;
      if (grid[nr][nc]!==1) continue;
      if (nr===fromR && nc===fromC) continue;
      if (field[nr][nc] < field[r][c]) candidates.push([nr,nc]);
    }
    if (candidates.length === 0){
      // 没有更优前进格（理论上终点处才发生）：退回非来源的路面邻居
      for (const [dr,dc] of dirs){
        const nr=r+dr, nc=c+dc;
        if (nr<0||nc<0||nr>=window.CFG.ROWS||nc>=window.CFG.COLS) continue;
        if (grid[nr][nc]!==1) continue;
        if (nr===fromR && nc===fromC) continue;
        candidates.push([nr,nc]);
      }
    }
    if (candidates.length === 0) return null;
    return window.choice(candidates);
  }

  // ---------- 菜单 ----------
  function initMenu(){
    const ov = document.getElementById('overlay');
    ov.className = 'overlay show';
    ov.innerHTML = '<h1>Emoji 塔防</h1><p>选择难度：</p>'+
      '<button onclick="startGame(\'easy\')">保守</button>'+
      '<button onclick="startGame(\'normal\')">标准</button>'+
      '<button onclick="startGame(\'hard\')">硬核</button>';
  }

  window.startGame = function(diff){
    document.getElementById('overlay').className = 'overlay';
    g = window.createGame(diff);
    // 终点格在 carvePath 里已是路面(1)，确保起点也是路面，便于寻路统一
    g.map.grid[g.map.start[0]][g.map.start[1]] = 1;
    g.map.grid[g.map.end[0]][g.map.end[1]] = 1;
    g.distField = buildDistField(g.map.grid, g.map.end);
    selected = null;
    window.startNextWave(g);
    buildTowerBar();
    renderHUD();
  };

  // ---------- 塔选择栏 ----------
  function buildTowerBar(){
    const bar = document.getElementById('towerbar');
    bar.innerHTML = '';
    for (const k in window.TOWER_TYPES){
      const t = window.TOWER_TYPES[k];
      const b = document.createElement('div');
      b.className = 'tower-btn' + (g && g.selectedTowerType===k ? ' sel':'');
      b.textContent = t.emoji+' '+t.name+' '+t.cost;
      b.onclick = ()=>{
        if (!g) return;
        g.selectedTowerType = (g.selectedTowerType===k ? null : k);
        selected = null;            // 取消实体选择
        clearPanel();
        buildTowerBar();
      };
      bar.appendChild(b);
    }
  }

  // ---------- 点击：放置 / 选中 ----------
  canvas.addEventListener('click', (e)=>{
    if (!g || g.state!==window.GameState.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX-rect.left)/CELL);
    const r = Math.floor((e.clientY-rect.top)/CELL);
    if (r<0||c<0||r>=window.CFG.ROWS||c>=window.CFG.COLS) return;

    // 点击已有塔 -> 选中弹出升级/出售
    const tw = g.towers.find(t=>t.r===r && t.c===c);
    if (tw){ selected = { kind:'tower', ref:tw }; showTowerPanel(tw); return; }
    // 点击英雄 -> 选中弹出升级/复活
    if (g.hero && g.hero.r===r && g.hero.c===c){
      selected = { kind:'hero', ref:g.hero }; showHeroPanel(g.hero); return;
    }

    if (g.selectedTowerType){
      tryPlaceTower(r,c);
      return;
    }
    // 放置英雄（免费、唯一、占格）
    if (g.map.grid[r][c]===0 && !g.hero){
      g.hero = window.makeHero(r,c);
      g.map.grid[r][c] = 9;
      selected = { kind:'hero', ref:g.hero };
      showHeroPanel(g.hero);
    }
  });

  function tryPlaceTower(r,c){
    const def = window.TOWER_TYPES[g.selectedTowerType];
    if (g.map.grid[r][c]!==0){ flash('此处不可建造'); return; }
    if (!window.canPlace(g.map, r, c)){ flash('会减少通路数量'); return; }
    if (g.gold < def.cost){ flash('金币不足'); return; }
    g.gold -= def.cost;
    const tw = window.makeTower(g.selectedTowerType, r, c);
    g.towers.push(tw);
    g.map.grid[r][c] = 9;
    selected = { kind:'tower', ref:tw };
    showTowerPanel(tw);
    renderHUD();
  }

  function flash(msg){
    const el = document.getElementById('flash');
    if (el){ el.textContent = msg; el.style.opacity = 1;
      clearTimeout(flash._t); flash._t = setTimeout(()=>{ el.style.opacity = 0; }, 1200); }
    console.log(msg);
  }

  // ---------- 升级 / 出售 面板 ----------
  function clearPanel(){ const p = document.getElementById('panel'); if (p) p.innerHTML=''; }

  function showTowerPanel(tw){
    const p = document.getElementById('panel'); if (!p) return;
    const uc = window.upgradeCost(tw);
    p.innerHTML = '';
    const title = document.createElement('div');
    title.className='panel-title';
    title.textContent = `${tw.emoji} ${tw.name} Lv.${tw.level}  DPS:${tw.dps} 射程:${tw.range}`;
    p.appendChild(title);

    const up = document.createElement('button');
    up.textContent = `升级 (💰${uc})`;
    up.disabled = g.gold < uc;
    up.onclick = ()=>{
      if (g.gold < uc) return;
      g.gold -= uc; window.upgradeTower(tw);
      flash('已升级'); renderHUD(); showTowerPanel(tw);
    };
    p.appendChild(up);

    const sell = document.createElement('button');
    const refund = Math.round(tw.cost*0.5);
    sell.textContent = `出售 (退💰${refund})`;
    sell.onclick = ()=>{
      g.gold += refund;
      g.map.grid[tw.r][tw.c] = 0;
      g.towers = g.towers.filter(t=>t!==tw);
      if (selected && selected.ref===tw) selected=null;
      clearPanel(); renderHUD(); flash('已出售');
    };
    p.appendChild(sell);
  }

  function showHeroPanel(h){
    const p = document.getElementById('panel'); if (!p) return;
    p.innerHTML='';
    const title = document.createElement('div');
    title.className='panel-title';
    title.textContent = `${h.emoji} 英雄 Lv.${h.level}  HP:${Math.round(h.hp)}/${h.maxHp}  DPS:${h.dps}`;
    p.appendChild(title);

    const up = document.createElement('button');
    const uc = window.heroUpgradeCost(h);
    up.textContent = `升级 (💰${uc})`;
    up.disabled = g.gold < uc;
    up.onclick = ()=>{
      if (g.gold < uc) return;
      g.gold -= uc; window.upgradeHero(h);
      flash('英雄已升级'); renderHUD(); showHeroPanel(h);
    };
    p.appendChild(up);

    if (!h.alive){
      const rev = document.createElement('button');
      rev.textContent = `复活 (💰${h.reviveCost})`;
      rev.disabled = g.gold < h.reviveCost;
      rev.onclick = ()=>{
        if (g.gold < h.reviveCost) return;
        g.gold -= h.reviveCost; window.reviveHero(h);
        flash('英雄已复活'); renderHUD(); showHeroPanel(h);
      };
      p.appendChild(rev);
    } else {
      const info = document.createElement('div');
      info.className='panel-info';
      info.textContent = '存活中：可对附近敌人造成持续伤害。';
      p.appendChild(info);
    }
  }

  // ---------- 更新 ----------
  function update(dt){
    if (!g || g.state!==window.GameState.PLAYING) return;
    spawnTimer -= dt;
    if (g.spawnQueue.length && spawnTimer<=0){
      const type = g.spawnQueue.shift();
      const en = window.makeEnemy(type, g.wave, g.diff);
      const [sr,sc] = g.map.start;
      en.cr = sr; en.cc = sc; en.fr = -1; en.fc = -1; // 当前/来源网格
      en.x = sc*CELL+CELL/2; en.y = sr*CELL+CELL/2;
      // 朝起点的某个路面邻居迈第一步
      const first = nextStep(g.distField, g.map.grid, sr, sc, -1, -1);
      en.nr = first ? first[0] : sr; en.nc = first ? first[1] : sc;
      g.enemies.push(en);
      spawnTimer = 0.6;
    }
    updateEnemies(dt);
    updateTowers(dt);
    updateHero(dt);
    if (g.spawnQueue.length===0 && g.enemies.length===0){
      window.grantWaveReward(g);
      if (g.wave >= window.CFG.WAVES){ g.state=window.GameState.WON; showEnd(true); }
      else { window.startNextWave(g); flash(`第 ${g.wave} 波来袭`); }
    }
  }

  function cellCenter(r,c){ return [c*CELL+CELL/2, r*CELL+CELL/2]; }

  function updateEnemies(dt){
    const MOVE = 0.6; // 速度系数
    for (const en of g.enemies){
      if (en.dead) continue;
      let sp = en.baseSpeed;
      if (en.slowT>0){ sp *= 0.5; en.slowT -= dt; }
      if (en.stuck){ sp = 0; }
      // 移动到下一格中心
      const [tx,ty] = cellCenter(en.nr, en.nc);
      const dx = tx-en.x, dy = ty-en.y, d = Math.hypot(dx,dy);
      const step = sp*CELL*dt*MOVE;
      if (d > step){
        en.x += dx/d*step; en.y += dy/d*step;
      } else {
        en.x = tx; en.y = ty;
        // 抵达下一格中心：更新当前/来源，决定再下一步
        en.fr = en.cr; en.fc = en.cc;
        en.cr = en.nr; en.cc = en.nc;
        if (en.cr===g.map.end[0] && en.cc===g.map.end[1]){
          g.baseHp--; en.dead = true;
          if (g.baseHp<=0){ g.state=window.GameState.LOST; showEnd(false); }
          continue;
        }
        const nx = nextStep(g.distField, g.map.grid, en.cr, en.cc, en.fr, en.fc);
        if (nx){ en.nr = nx[0]; en.nc = nx[1]; }
      }
    }
    g.enemies = g.enemies.filter(e=>!e.dead);
  }

  function updateTowers(dt){
    const FIRE_INTERVAL = 0.5; // 射击节奏（秒）
    for (const tw of g.towers){
      tw.cd -= dt;
      if (tw.cd > 0) continue;
      let target=null, best=Infinity;
      const txc = tw.c*CELL+CELL/2, tyc = tw.r*CELL+CELL/2;
      for (const en of g.enemies){
        if (en.dead) continue;
        if (en.air && !tw.hitsAir) continue;
        const d = window.dist(en.x, en.y, txc, tyc);
        if (d <= tw.range*CELL && d < best){ best=d; target=en; }
      }
      if (target){
        const shot = tw.dps * FIRE_INTERVAL;
        if (tw.armor!=null && target.armor>0 && tw.splash===0) target.hp -= shot*(1-target.armor);
        else target.hp -= shot;
        if (tw.slow>0) target.slowT = 1.0;
        if (tw.dot>0) target.hp -= tw.dot; // 简易点燃（即时）
        if (target.hp<=0){ target.dead=true; window.onKill(g, target); }
        // 溅射：范围内其他敌人吃满额
        if (tw.splash>0){
          const sr = tw.splash*CELL;
          for (const en of g.enemies){
            if (en===target || en.dead) continue;
            if (window.dist(en.x, en.y, target.x, target.y) <= sr){
              en.hp -= shot;
              if (tw.slow>0) en.slowT = 1.0;
              if (en.hp<=0){ en.dead=true; window.onKill(g, en); }
            }
          }
        }
        tw.cd = FIRE_INTERVAL;
      }
    }
  }

  function updateHero(dt){
    const h = g.hero; if (!h || !h.alive) return;
    const hx = h.c*CELL+CELL/2, hy = h.r*CELL+CELL/2;
    const radius = h.radius*CELL;
    let stuckN = 0;
    for (const en of g.enemies){
      if (en.dead) continue;
      const d = window.dist(en.x, en.y, hx, hy);
      if (d <= radius){
        h.hp -= 4*dt;
        en.hp -= h.dps*dt;
        if (en.hp<=0){ en.dead=true; window.onKill(g, en); }
        if (stuckN < h.stickCount){ en.stuck = true; stuckN++; }
      }
    }
    for (const en of g.enemies) if (window.dist(en.x, en.y, hx, hy) > radius) en.stuck = false;
    if (h.hp <= 0){ h.alive = false; flash('英雄阵亡，可花费复活'); showHeroPanel(h); }
  }

  // ---------- 渲染 ----------
  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!g) return;
    for (let r=0;r<window.CFG.ROWS;r++) for (let c=0;c<window.CFG.COLS;c++){
      const v = g.map.grid[r][c];
      ctx.fillStyle = v===1 ? '#3a3a55' : (v===9 ? '#554' : '#2b2b40');
      ctx.fillRect(c*CELL, r*CELL, CELL-1, CELL-1);
    }
    // 起点/终点图标
    ctx.font='28px serif';
    ctx.fillText('🚪', g.map.start[1]*CELL+10, g.map.start[0]*CELL+38);
    ctx.fillText('🏰', g.map.end[1]*CELL+10, g.map.end[0]*CELL+38);

    // 选中实体的高亮范围
    if (selected){
      ctx.strokeStyle='rgba(255,230,120,.7)'; ctx.lineWidth=2;
      if (selected.kind==='tower'){
        const tw = selected.ref;
        ctx.beginPath(); ctx.arc(tw.c*CELL+CELL/2, tw.r*CELL+CELL/2, tw.range*CELL, 0, 7); ctx.stroke();
      } else if (selected.kind==='hero'){
        const h = selected.ref;
        ctx.beginPath(); ctx.arc(h.c*CELL+CELL/2, h.r*CELL+CELL/2, h.radius*CELL, 0, 7); ctx.stroke();
      }
      ctx.lineWidth=1;
    }

    for (const tw of g.towers){ ctx.font='26px serif'; ctx.fillText(tw.emoji, tw.c*CELL+12, tw.r*CELL+36); }
    if (g.hero){
      ctx.font='26px serif';
      ctx.fillText(g.hero.emoji, g.hero.c*CELL+12, g.hero.r*CELL+36);
      ctx.strokeStyle='rgba(120,200,255,.4)';
      ctx.beginPath(); ctx.arc(g.hero.c*CELL+CELL/2, g.hero.r*CELL+CELL/2, g.hero.radius*CELL, 0, 7); ctx.stroke();
    }
    for (const en of g.enemies){
      ctx.font='22px serif'; ctx.fillText(en.emoji, en.x-10, en.y+8);
      ctx.fillStyle='#f55'; ctx.fillRect(en.x-12, en.y-14, 24*(en.hp/en.maxHp), 3); ctx.fillStyle='#000';
    }
    renderHUD();
  }

  function renderHUD(){
    const hud = document.getElementById('hud');
    if (!g) return;
    hud.textContent = `💰${g.gold}  ❤️${g.baseHp}  🌊${g.wave}/${window.CFG.WAVES}  难度:${g.diffCfg.label}`;
  }

  function showEnd(win){
    const ov = document.getElementById('overlay');
    ov.className = 'overlay show';
    ov.innerHTML = `<h1>${win?'🎉 胜利!':'💥 失败'}</h1>`+
      `<button onclick="location.reload()">重新开始</button>`;
  }

  // ---------- 主循环 ----------
  function loop(now){
    const dt = Math.min(0.05, (now-last)/1000); last = now;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  initMenu();
  requestAnimationFrame(loop);
})();

// main.js —— 主循环、输入、渲染、HUD，打通可玩闭环
// 依赖全局（浏览器）：CFG, generateMap, canPlace, TOWER_TYPES, makeTower, upgradeTower,
// upgradeCost, spawnWave, makeEnemy, makeHero, upgradeHero, heroUpgradeCost, reviveHero,
// GameState, createGame, startNextWave, onKill, grantWaveReward, dist
(function(){
  'use strict';

  const CELL = window.CFG.CELL;
  const FIRE_INTERVAL = 0.5;
  // 出口/目标图标的统一缩放：按方格尺寸等比缩放（留边距、不变形），
  // 出口与目标共用同一比例与对齐方式，确保视觉一致。
  const ICON_SCALE = 0.72;
  const ICON_FONT = Math.round(CELL * ICON_SCALE);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let g = null;
  let last = performance.now();
  let spawnTimer = 0;

  // 选中用于升级/出售的实体（塔或英雄）
  let selected = null; // { kind:'tower'|'hero', ref }

  // ---------- 视觉特效层 ----------
  const projectiles = [];   // 飞行中的投射物
  const hitEffects  = [];   // 命中爆点
  const particles   = [];   // 爆点粒子
  const lasers      = [];   // 即时激光/电弧
  const floats      = [];   // 飘字（+gold 等）
  let countdown = 0;        // 开局/波次倒计时
  let countdownLastSec = -1;// 上一次播报过的整秒数
  let waveBanner = null;    // 波次横幅
  let mouseGrid  = null;    // 鼠标在 canvas 内的格子坐标

  // 障碍物 emoji 池（每片连通的障碍区域分配同一种）
  const OBSTACLE_EMOJIS = ['⛰️', '🗻', '🌋', '🌲', '🌵', '🪨', '🌊'];

  // 给每个连通的障碍区域（非路面）分配一个固定的 emoji
  function assignRegionEmojis(grid){
    const R = window.CFG.ROWS, C = window.CFG.COLS;
    const out = [];
    for (let r=0;r<R;r++) out.push(new Array(C).fill(null));
    const visited = [];
    for (let r=0;r<R;r++) visited.push(new Array(C).fill(false));
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        if (grid[r][c] !== 0 || visited[r][c]) continue;
        // BFS 该连通障碍区域
        const cells = [];
        const q = [[r,c]];
        visited[r][c] = true;
        let qi = 0;
        while (qi < q.length){
          const [cr, cc] = q[qi++];
          cells.push([cr, cc]);
          for (const [dr, dc] of dirs){
            const nr=cr+dr, nc=cc+dc;
            if (nr<0||nc<0||nr>=R||nc>=C) continue;
            if (grid[nr][nc] !== 0 || visited[nr][nc]) continue;
            visited[nr][nc] = true;
            q.push([nr, nc]);
          }
        }
        const emoji = window.choice(OBSTACLE_EMOJIS);
        for (const [cr, cc] of cells) out[cr][cc] = emoji;
      }
    }
    return out;
  }

  // ---------- 寻路：基于路面格的 BFS 距离场 ----------
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
        if (grid[nr][nc]!==1) continue;
        if (field[nr][nc] !== Infinity) continue;
        field[nr][nc] = field[r][c] + 1;
        q.push([nr,nc]);
      }
    }
    return field;
  }

  // 给定当前格与来源格，返回下一个要走的路面格（岔路随机选）
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
    ov.innerHTML = '<h1>🎮 Emoji 塔防</h1>'+
      '<p>选择难度开始游戏</p>'+
      '<div class="diff-buttons">'+
      '<button onclick="startGame(\'easy\')">🌱 保守</button>'+
      '<button onclick="startGame(\'normal\')">⚔️ 标准</button>'+
      '<button onclick="startGame(\'hard\')">💀 硬核</button>'+
      '</div>';
  }

  window.startGame = function(diff){
    SFX.ensure();                          // 解锁 AudioContext
    document.getElementById('overlay').className = 'overlay';
    g = window.createGame(diff);
    g.map.grid[g.map.start[0]][g.map.start[1]] = 1;
    g.map.grid[g.map.end[0]][g.map.end[1]] = 1;
    g.distField = buildDistField(g.map.grid, g.map.end);
    g.regionEmoji = assignRegionEmojis(g.map.grid);  // 给每片障碍区域分配 emoji
    selected = null;
    countdown = 3.5;
    countdownLastSec = -1;
    window.startNextWave(g);               // 排好第一波，生成由倒计时门控
    buildTowerBar();
    renderHUD();
  };

  // ---------- 塔选择栏 ----------
  function buildTowerBar(){
    const bar = document.getElementById('towerbar');
    bar.innerHTML = '';
    for (const k in window.TOWER_TYPES){
      const t = window.TOWER_TYPES[k];
      const b = document.createElement('button');
      b.className = 'tower-btn' + (g && g.selectedTowerType===k ? ' sel':'');
      b.type = 'button';
      b.innerHTML = '<span class="tower-emoji">'+t.emoji+'</span>'+
                    '<span>'+t.name+'</span>'+
                    '<span class="tower-cost">💰'+t.cost+'</span>';
      b.onclick = ()=>{
        if (!g) return;
        g.selectedTowerType = (g.selectedTowerType===k ? null : k);
        selected = null;
        hidePopup();
        buildTowerBar();
      };
      bar.appendChild(b);
    }
  }

  // ---------- 鼠标在 canvas 中的位置（CSS 缩放下也准确）----------
  function getCellFromEvent(e){
    const rect = canvas.getBoundingClientRect();
    const cellW = rect.width  / window.CFG.COLS;
    const cellH = rect.height / window.CFG.ROWS;
    const c = Math.floor((e.clientX - rect.left) / cellW);
    const r = Math.floor((e.clientY - rect.top)  / cellH);
    return {r, c};
  }

  // ---------- 点击：放置 / 选中 ----------
  canvas.addEventListener('click', (e)=>{
    if (!g || g.state!==window.GameState.PLAYING) return;
    const {r, c} = getCellFromEvent(e);
    if (r<0||c<0||r>=window.CFG.ROWS||c>=window.CFG.COLS) return;

    const tw = g.towers.find(t=>t.r===r && t.c===c);
    if (tw){ selected = { kind:'tower', ref:tw }; showTowerPopup(tw); return; }
    if (g.hero && g.hero.r===r && g.hero.c===c){
      selected = { kind:'hero', ref:g.hero }; showHeroPopup(g.hero); return;
    }

    if (g.selectedTowerType){
      tryPlaceTower(r,c);
      return;
    }
    // 点击空地：关闭弹窗，取消选中
    if (selected) selected = null;
    hidePopup();
    // 放置英雄（免费、唯一）
    if (g.map.grid[r][c]===1 && !g.hero){
      if (!window.canPlace(g.map, r, c)){ flash('英雄会堵死通路'); return; }
      g.hero = window.makeHero(r,c);
      g.map.grid[r][c] = 9;
      selected = { kind:'hero', ref:g.hero };
      showHeroPopup(g.hero);
    }
  });

  canvas.addEventListener('mousemove', (e)=>{
    if (!g) return;
    const {r, c} = getCellFromEvent(e);
    mouseGrid = (r>=0 && c>=0 && r<window.CFG.ROWS && c<window.CFG.COLS) ? {r,c} : null;
  });
  canvas.addEventListener('mouseleave', ()=>{ mouseGrid = null; });

  function tryPlaceTower(r,c){
    const def = window.TOWER_TYPES[g.selectedTowerType];
    if (g.map.grid[r][c]!==1){ flash('此处不可建造'); return; }
    if (!window.canPlace(g.map, r, c)){ flash('会减少通路数量'); return; }
    if (g.gold < def.cost){ flash('金币不足'); return; }
    g.gold -= def.cost;
    const tw = window.makeTower(g.selectedTowerType, r, c);
    g.towers.push(tw);
    g.towerBuildHistory.push(tw.type);  // P1.2: 建塔历史
    g.map.grid[r][c] = 9;
    selected = { kind:'tower', ref:tw };
    showTowerPopup(tw);
    SFX.place();
    renderHUD();
  }

  function flash(msg){
    const el = document.getElementById('flash');
    if (el){
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(flash._t);
      flash._t = setTimeout(()=>{ el.classList.remove('show'); }, 1200);
    }
  }

  function showWaveBanner(wave){
    waveBanner = { wave, life: 1.6, maxLife: 1.6 };
  }

  // ---------- 弹窗浮层（点击塔/英雄时出现）----------
  const popupEl = document.getElementById('popup');

  function hidePopup(){
    popupEl.classList.remove('show');
    popupEl.innerHTML = '';
  }

  function positionPopup(r, c){
    const canvasRect = canvas.getBoundingClientRect();
    const areaRect = document.getElementById('canvas-area').getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    const tx = (canvasRect.left - areaRect.left) + (c * CELL + CELL/2) * scaleX;
    const ty = (canvasRect.top  - areaRect.top ) + (r * CELL + CELL/2) * scaleY;
    const pw = 230, ph = 260;
    const aw = areaRect.width, ah = areaRect.height;
    // 优先出现在右侧，空间不够时换左侧
    let left = tx + CELL * scaleX + 10;
    if (left + pw > aw - 6) left = tx - pw - CELL * scaleX - 10;
    left = Math.max(4, Math.min(aw - pw - 4, left));
    let top  = ty - ph / 2;
    top  = Math.max(4, Math.min(ah - ph - 4, top));
    popupEl.style.left = Math.round(left) + 'px';
    popupEl.style.top  = Math.round(top)  + 'px';
  }

  function showTowerPopup(tw){
    const info = [
      { l:'DPS',  v:tw.dps },
      { l:'射程', v:tw.range+' 格' },
      { l:'对空', v:tw.hitsAir?'✅':'❌' },
      { l:'溅射', v:tw.splash>0?tw.splash+' 格':'-' },
      { l:'减速', v:tw.slow>0?'✓':'-' },
      { l:'dot',  v:tw.dot>0?tw.dot:'-' },
    ];
    const uc = window.upgradeCost(tw);
    const refund = Math.round(tw.cost * 0.5);
    let h = `<div class="popup-title">${tw.emoji} ${tw.name} Lv.${tw.level}</div>`;
    for (const {l,v} of info) h += `<div class="popup-info"><span class="label">${l}:</span>${v}</div>`;
    h += `<button class="popup-btn popup-upgrade" ${g.gold<uc?'disabled':''}>⬆️ 升级 (💰${uc})</button>`;
    h += `<button class="popup-btn popup-sell">💰 出售 (退${refund})</button>`;
    popupEl.innerHTML = h;
    positionPopup(tw.r, tw.c);
    popupEl.classList.add('show');
    // 绑定按钮事件
    const upBtn = popupEl.querySelector('.popup-upgrade');
    if (upBtn) upBtn.onclick = ()=>{ if (g.gold<uc) return; g.gold-=uc; window.upgradeTower(tw); flash('已升级'); SFX.upgrade(); renderHUD(); showTowerPopup(tw); };
    const selBtn = popupEl.querySelector('.popup-sell');
    if (selBtn) selBtn.onclick = ()=>{ g.gold+=refund; g.map.grid[tw.r][tw.c]=1; g.towers=g.towers.filter(t=>t!==tw); if (selected&&selected.ref===tw) selected=null; hidePopup(); renderHUD(); flash('已出售'); SFX.sell(); };
  }

  function showHeroPopup(h){
    const info = [
      { l:'等级', v:h.level },
      { l:'HP',   v:Math.round(h.hp)+'/'+h.maxHp },
      { l:'DPS',  v:h.dps },
      { l:'范围', v:h.radius+' 格' },
      { l:'定身', v:h.stickCount+' 人' },
    ];
    const uc = window.heroUpgradeCost(h);
    let ht = `<div class="popup-title">${h.emoji} 英雄 Lv.${h.level}</div>`;
    for (const {l,v} of info) ht += `<div class="popup-info"><span class="label">${l}:</span>${v}</div>`;
    ht += `<button class="popup-btn popup-upgrade" ${g.gold<uc?'disabled':''}>⬆️ 升级 (💰${uc})</button>`;
    if (!h.alive){
      ht += `<button class="popup-btn popup-revive" ${g.gold<h.reviveCost?'disabled':''}>💖 复活 (💰${h.reviveCost})</button>`;
    } else {
      ht += `<div class="popup-info" style="color:var(--success);font-weight:600;padding-top:6px;">✨ 存活中</div>`;
    }
    popupEl.innerHTML = ht;
    positionPopup(h.r, h.c);
    popupEl.classList.add('show');
    const upBtn = popupEl.querySelector('.popup-upgrade');
    if (upBtn) upBtn.onclick = ()=>{ if (g.gold<uc) return; g.gold-=uc; window.upgradeHero(h); flash('英雄已升级'); SFX.upgrade(); renderHUD(); showHeroPopup(h); };
    const revBtn = popupEl.querySelector('.popup-revive');
    if (revBtn) revBtn.onclick = ()=>{ if (g.gold<h.reviveCost) return; g.gold-=h.reviveCost; window.reviveHero(h); flash('英雄已复活'); SFX.revive(); renderHUD(); showHeroPopup(h); };
  }

  // ---------- 伤害应用（投射物命中或即时）----------
  function applyTowerDamage(target, tw, shot, hitX, hitY){
    if (!target || target.dead) return;
    let anyKill = false;
    if (target.armor>0 && tw.splash===0) target.hp -= shot*(1-target.armor);
    else target.hp -= shot;
    if (tw.slow>0) target.slowT = 1.0;
    if (tw.dot>0) target.hp -= tw.dot;
    if (target.hp<=0){
      const gold = target.gold;
      target.dead = true;
      spawnFloat(target.x, target.y - 16, '+'+gold+'💰', '#FFB300');
      window.onKill(g, target);
      anyKill = true;
    }
    // 溅射：范围内其他敌人吃满额
    if (tw.splash > 0){
      const sr = tw.splash * CELL;
      for (const en of g.enemies){
        if (en === target || en.dead) continue;
        if (window.dist(en.x, en.y, hitX, hitY) <= sr){
          en.hp -= shot;
          if (tw.slow>0) en.slowT = 1.0;
          if (en.hp<=0){
            const g2 = en.gold;
            en.dead = true;
            spawnFloat(en.x, en.y - 16, '+'+g2+'💰', '#FFB300');
            window.onKill(g, en);
            anyKill = true;
          }
        }
      }
    }
    // 每次开火只播一次音效
    if (anyKill) SFX.kill(); else SFX.hit();
  }

  function fireTower(tw, target, fromX, fromY){
    SFX.fire(tw.type);
    const shot = tw.dps * FIRE_INTERVAL;
    if (tw.instantHit){
      // 电塔 / 狙塔：即时命中 + 视觉爆点
      applyTowerDamage(target, tw, shot, target.x, target.y);
      spawnHitEffect(target.x, target.y, tw.projColor, tw.splash || 0, tw.projType);
      if (tw.projType === 'laser'){
        spawnLaser(fromX, fromY, target.x, target.y, tw.projColor);
      } else if (tw.projType === 'bolt'){
        spawnLaser(fromX, fromY, target.x, target.y, tw.projColor);
      }
    } else {
      // 箭 / 火 / 冰 / 炮：发射可视投射物
      const dx = target.x - fromX, dy = target.y - fromY;
      const angle = Math.atan2(dy, dx);
      projectiles.push({
        x: fromX, y: fromY,
        tx: target.x, ty: target.y,
        target, tw, shot,
        type: tw.projType,
        color: tw.projColor,
        speed: tw.projSpeed,
        angle,
        arrived: false
      });
    }
  }

  // ---------- 视觉特效更新 ----------
  function updateProjectiles(dt){
    for (const p of projectiles){
      if (p.arrived) continue;
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step){
        p.x = p.tx; p.y = p.ty;
        p.arrived = true;
        if (p.target && !p.target.dead){
          applyTowerDamage(p.target, p.tw, p.shot, p.tx, p.ty);
        }
        spawnHitEffect(p.tx, p.ty, p.color, p.tw.splash || 0, p.type);
      } else {
        p.x += dx/d*step; p.y += dy/d*step;
        p.angle = Math.atan2(dy, dx);
      }
    }
    while (projectiles.length && projectiles[0].arrived) projectiles.shift();
  }

  function spawnHitEffect(x, y, color, splash, type){
    hitEffects.push({ x, y, color, splash: splash || 0, type, life: 0.45, maxLife: 0.45 });
    for (let i=0;i<7;i++){
      const a = (i / 7) * Math.PI * 2 + Math.random()*0.4;
      const sp = 60 + Math.random()*70;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color,
        life: 0.35 + Math.random()*0.15,
        maxLife: 0.5,
        size: 1.5 + Math.random()*2
      });
    }
  }

  function updateHitEffects(dt){
    for (const e of hitEffects) e.life -= dt;
    let i = 0;
    while (i < hitEffects.length){
      if (hitEffects[i].life <= 0) hitEffects.splice(i,1);
      else i++;
    }
    for (const p of particles){
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    let j = 0;
    while (j < particles.length){
      if (particles[j].life <= 0) particles.splice(j,1);
      else j++;
    }
  }

  function spawnLaser(x1, y1, x2, y2, color){
    lasers.push({ x1, y1, x2, y2, color, life: 0.22, maxLife: 0.22 });
  }
  function updateLasers(dt){
    let i = 0;
    while (i < lasers.length){
      lasers[i].life -= dt;
      if (lasers[i].life <= 0) lasers.splice(i,1);
      else i++;
    }
  }

  function spawnFloat(x, y, text, color){
    floats.push({ x, y, text, color, life: 1.0, maxLife: 1.0, vy: -42 });
  }
  function updateFloats(dt){
    for (const f of floats){
      f.life -= dt;
      f.y += f.vy * dt;
    }
    let i = 0;
    while (i < floats.length){
      if (floats[i].life <= 0) floats.splice(i,1);
      else i++;
    }
  }

  // ---------- 更新 ----------
  function update(dt){
    if (!g || g.state !== window.GameState.PLAYING) return;

    // 倒计时期间冻结生成与敌人移动（允许点击摆放）
    if (countdown > 0){
      countdown -= dt;
      updateProjectiles(dt);
      updateHitEffects(dt);
      updateLasers(dt);
      updateFloats(dt);
      // 整秒切分时播 tick；归零时播 go + 波次横幅
      const sec = Math.ceil(countdown);
      if (sec >= 1 && sec <= 3 && sec !== countdownLastSec){
        SFX.countdownTick();
        countdownLastSec = sec;
      }
      if (countdown <= 0 && countdownLastSec > 0){
        SFX.countdownGo();
        SFX.waveStart();
        showWaveBanner(g.wave);
        countdownLastSec = 0;
      }
      return;
    }

    spawnTimer -= dt;
    if (g.spawnQueue.length && spawnTimer<=0){
      const type = g.spawnQueue.shift();
      const en = window.makeEnemy(type, g.wave, g.diff);
      const [sr,sc] = g.map.start;
      en.cr = sr; en.cc = sc; en.fr = -1; en.fc = -1;
      en.x = sc*CELL+CELL/2; en.y = sr*CELL+CELL/2;
      const first = nextStep(g.distField, g.map.grid, sr, sc, -1, -1);
      en.nr = first ? first[0] : sr; en.nc = first ? first[1] : sc;
      g.enemies.push(en);
      spawnTimer = 0.6;
    }
    updateEnemies(dt);
    updateTowers(dt);
    updateHero(dt);
    updateProjectiles(dt);
    updateHitEffects(dt);
    updateLasers(dt);
    updateFloats(dt);

    if (waveBanner){ waveBanner.life -= dt; if (waveBanner.life <= 0) waveBanner = null; }

    if (g.spawnQueue.length===0 && g.enemies.length===0){
      window.grantWaveReward(g);
      if (g.wave >= window.CFG.WAVES){
        g.state = window.GameState.WON;
        showEnd(true);
      } else {
        window.startNextWave(g);
        showWaveBanner(g.wave);
        SFX.waveStart();
      }
    }
  }

  function cellCenter(r,c){ return [c*CELL+CELL/2, r*CELL+CELL/2]; }

  // 在方格正中央绘制一个按 ICON_SCALE 等比缩放的 emoji 图标（出口/目标统一使用）。
  // 始终保持原始比例（emoji 为方形字形，font 渲染天然不变形），
  // 并以格子中心点 (c*CELL+CELL/2, r*CELL+CELL/2) 为对齐基准，确保精确居中。
  function drawCellIcon(emoji, r, c, fontPx){
    const cx = c*CELL + CELL/2, cy = r*CELL + CELL/2;
    ctx.save();
    ctx.font = fontPx + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);
    ctx.restore();
  }

  // 在方格内绘制石塔：梯形塔基 + 梯形塔身（右侧阴影）+ 顶部垛口，
  // 原 emoji 图标置于塔顶正中。升级后按等级变化以区分：塔身更壮（更宽）、
  // 垛口更多、塔顶加等级色带、塔基显示等级圆点。所有尺寸按 CELL 等比。
  const TOWER_STONE  = '#928d83';  // 塔身石色
  const TOWER_STONE_D= '#5d5a54';  // 塔基石色（更深）
  const TOWER_MERLON = '#857f74';  // 垛口石色
  const TOWER_LINE  = '#2b2a27';  // 描边
  // 等级装饰色带（塔顶领圈）：L1 素石无带，L2+ 逐级提亮
  const LV_TRIM = [null, null, '#b5793a', '#9fb4c8', '#ffcf4d', '#5fe1ff', '#ff6ad5'];
  function drawTower(tw, r, c){
    const cx = c*CELL + CELL/2;
    const cellTop = r*CELL, cellBot = r*CELL + CELL;
    const mTop = 3, mBot = 4;                 // 上下留白
    const emojiSize = Math.round(CELL * 0.40);
    const emojiCy = cellTop + mTop + emojiSize*0.5;   // emoji 垂直中心

    // 石塔从 emoji 之下延伸到 cellBot-mBot
    const twBottom = cellBot - mBot;
    const twTop = emojiCy + emojiSize*0.5;       // 塔顶（垛口上沿）对齐 emoji 字框下沿，emoji 干脆坐在塔顶
    const twH = twBottom - twTop;
    // 等级因子：塔身随等级变壮（更宽），封顶避免溢出方格
    const lv = Math.max(1, tw.level|0);
    const grow = Math.min((lv-1) * 0.012, 0.06);
    const baseHalf = CELL * (0.27 + grow);     // 塔基半宽（最宽，随等级增大）
    const topHalf  = CELL * (0.17 + grow);     // 塔身顶半宽（更窄 → 梯形）
    const trim = LV_TRIM[Math.min(lv, LV_TRIM.length-1)] || LV_TRIM[LV_TRIM.length-1];
    const baseY = twBottom - twH*0.20;         // 塔基 / 塔身分界
    const merlonY = twTop, merlonH = twH * 0.24;  // 垛口带
    const mCount = Math.min(2 + lv, 6);           // 垛口数随等级增加（2+Lv，封顶6）

    ctx.save();

    // —— 塔基（最宽的梯形底座）——
    ctx.fillStyle = TOWER_STONE_D; ctx.strokeStyle = TOWER_LINE; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - baseHalf, twBottom);
    ctx.lineTo(cx + baseHalf, twBottom);
    ctx.lineTo(cx + topHalf,   baseY);
    ctx.lineTo(cx - topHalf,   baseY);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // —— 塔身（上窄下宽的梯形）——
    ctx.fillStyle = TOWER_STONE;
    ctx.beginPath();
    ctx.moveTo(cx - topHalf, baseY);
    ctx.lineTo(cx + topHalf, baseY);
    ctx.lineTo(cx + topHalf*0.86, merlonY + merlonH);
    ctx.lineTo(cx - topHalf*0.86, merlonY + merlonH);
    ctx.closePath(); ctx.fill();
    // 右侧阴影增加立体感
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.lineTo(cx + topHalf, baseY);
    ctx.lineTo(cx + topHalf*0.86, merlonY + merlonH);
    ctx.lineTo(cx, merlonY + merlonH);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = TOWER_LINE; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx - topHalf, baseY);
    ctx.lineTo(cx + topHalf, baseY);
    ctx.lineTo(cx + topHalf*0.86, merlonY + merlonH);
    ctx.lineTo(cx - topHalf*0.86, merlonY + merlonH);
    ctx.closePath(); ctx.stroke();

    // —— 顶部垛口（雉堞），数量随等级增加 ——
    const bandW = topHalf * 1.72;            // 垛口带总宽（= 塔身顶宽）
    const gap = bandW / mCount, mw = gap * 0.62;
    ctx.fillStyle = TOWER_MERLON;
    for (let i=0;i<mCount;i++){
      const mx = cx - bandW/2 + i*gap + (gap-mw)/2;
      ctx.fillRect(mx, merlonY, mw, merlonH);
      ctx.strokeRect(mx, merlonY, mw, merlonH);
    }

    // —— 等级色带：塔顶一道随等级提亮的装饰领圈（L1 无）——
    if (trim){
      const by = merlonY + merlonH + 1.2;
      const bh = Math.max(2, twH*0.10);
      const halfB = topHalf*0.86;
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.moveTo(cx - halfB, by + bh);
      ctx.lineTo(cx + halfB, by + bh);
      ctx.lineTo(cx + halfB*0.82, by);
      ctx.lineTo(cx - halfB*0.82, by);
      ctx.closePath(); ctx.fill();
    }

    // —— 等级圆点：塔基上显示 lv 个小点（精确读级，L1 为浅石色）——
    const pipR = Math.max(1.1, CELL*0.035);
    const pipGap = pipR*2 + 1.6;
    const pips = Math.min(lv, 6);
    const py = baseY + (twBottom-baseY)*0.5;
    const startX = cx - (pips-1)*pipGap/2;
    ctx.fillStyle = trim || '#ded7c8';
    for (let i=0;i<pips;i++){
      ctx.beginPath();
      ctx.arc(startX + i*pipGap, py, pipR, 0, 7);
      ctx.fill();
    }
    if (lv > 6){ // 超高等级补数字
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(CELL*0.22) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(lv), cx, py);
    }

    // —— emoji 置于塔顶正中（垛口之上）——
    ctx.font = emojiSize + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tw.emoji, cx, emojiCy);

    ctx.restore();
  }

  function updateEnemies(dt){
    const MOVE = 0.6;
    for (const en of g.enemies){
      if (en.dead) continue;
      let sp = en.baseSpeed;
      if (en.slowT>0){ sp *= 0.5; en.slowT -= dt; }
      if (en.stuck){ sp = 0; }
      const [tx,ty] = cellCenter(en.nr, en.nc);
      const dx = tx-en.x, dy = ty-en.y, d = Math.hypot(dx,dy);
      const step = sp*CELL*dt*MOVE;
      if (d > step){
        en.x += dx/d*step; en.y += dy/d*step;
      } else {
        en.x = tx; en.y = ty;
        en.fr = en.cr; en.fc = en.cc;
        en.cr = en.nr; en.cc = en.nc;
        if (en.cr===g.map.end[0] && en.cc===g.map.end[1]){
          g.baseHp--; en.dead = true;
          // ---- P1.2 统计 ----
          g.leaks++;
          g.leaksPerWave[g.wave] = (g.leaksPerWave[g.wave] || 0) + 1;
          // ---- end ----
          spawnFloat(en.x, en.y, '-1❤️', '#F56565');
          SFX.baseHit();
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
    for (const tw of g.towers){
      tw.cd -= dt;
      // 修复[原因3]：浮点容差。cd 减到接近 0 时（如 6.9e-17）视为就绪，
      // 避免残留极小正值导致 if(cd>0) 误判、每轮多等一帧（60fps 下开火率降 3%）。
      if (tw.cd > 1e-6) continue;
      tw.cd = 0;  // 归零，彻底消除浮点累积误差
      let target=null, best=Infinity;
      let airInRange = false;  // 是否有"被对空规则跳过且在范围内"的空中敌人（UX 反馈用）
      const txc = tw.c*CELL+CELL/2, tyc = tw.r*CELL+CELL/2;
      for (const en of g.enemies){
        if (en.dead) continue;
        const d = window.dist(en.x, en.y, txc, tyc);
        if (d > tw.range*CELL) continue;          // 范围外：跳过（原因1：距离判定正确）
        if (en.air && !tw.hitsAir){ airInRange = true; continue; }  // 原因2：对空规则（设计行为）
        if (d < best){ best=d; target=en; }        // 选最近的有效目标
      }
      // 修复[原因2]：非对空塔有空中敌人在范围内但无地面目标时，标记压制状态供渲染反馈。
      // 不改变任何战斗逻辑——仅让玩家理解"塔为何不开火"。
      tw.suppressedAir = (!target && airInRange);
      if (target){
        // 修复[原因3 硬化]：先重置冷却再开火，确保即使 fire 路径异常也不会每帧重试导致 cd 永不重置。
        tw.cd = FIRE_INTERVAL;
        fireTower(tw, target, txc, tyc);
      }
    }
  }

  function updateHero(dt){
    const h = g.hero;
    if (!h || !h.alive){
      for (const en of g.enemies) en.stuck = false;
      return;
    }
    const hx = h.c*CELL+CELL/2, hy = h.r*CELL+CELL/2;
    const radius = h.radius*CELL;
    let stuckN = 0;
    let anyKill = false;
    for (const en of g.enemies){
      if (en.dead) continue;
      const d = window.dist(en.x, en.y, hx, hy);
      if (d <= radius){
        h.hp -= 4*dt;
        en.hp -= h.dps*dt;
        if (en.hp<=0){
          const g2 = en.gold;
          en.dead=true;
          spawnFloat(en.x, en.y - 16, '+'+g2+'💰', '#FFB300');
          window.onKill(g, en);
          anyKill = true;
        }
        if (stuckN < h.stickCount){ en.stuck = true; stuckN++; }
      }
    }
    for (const en of g.enemies) if (window.dist(en.x, en.y, hx, hy) > radius) en.stuck = false;
    if (h.hp <= 0){ h.alive = false; flash('英雄阵亡，可花费复活'); showHeroPopup(h); }
    if (anyKill) SFX.kill();
  }

  // ---------- 渲染 ----------
  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!g) return;
    // 网格
    for (let r=0;r<window.CFG.ROWS;r++) for (let c=0;c<window.CFG.COLS;c++){
      const v = g.map.grid[r][c];
      ctx.fillStyle = v===1 ? '#3a3a55' : (v===9 ? '#554' : '#2b2b40');
      ctx.fillRect(c*CELL, r*CELL, CELL-1, CELL-1);
    }
    // 障碍区域 emoji（每片连通障碍区域一种，整片统一；可通行区不填充）
    if (g.regionEmoji){
      ctx.save();
      ctx.font = '34px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r=0;r<window.CFG.ROWS;r++){
        for (let c=0;c<window.CFG.COLS;c++){
          if (g.map.grid[r][c] !== 0) continue;
          const e = g.regionEmoji[r][c];
          if (e) ctx.fillText(e, c*CELL + CELL/2, r*CELL + CELL/2 + 1);
        }
      }
      ctx.restore();
    }
    // 起点（怪物出口）／终点（目标）图标：统一缩放比例 + 方格正中央精确对齐
    drawCellIcon('🌫️', g.map.start[0], g.map.start[1], ICON_FONT);
    drawCellIcon('🏰', g.map.end[0],   g.map.end[1],   ICON_FONT);

    // 悬停预览：射程圆 + 放置格颜色提示
    renderHoverPreview();

    // 塔：石塔图形（塔基+塔身+垛口）+ 顶端 emoji
    for (const tw of g.towers){
      drawTower(tw, tw.r, tw.c);
      // 修复[原因2]：非对空塔被空中敌人压制时显示 ✈️ 提示（塔顶右上方）
      if (tw.suppressedAir){
        ctx.save();
        ctx.font='13px serif';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(performance.now()/220); // 呼吸闪烁
        ctx.fillText('✈️', tw.c*CELL+CELL-10, tw.r*CELL+9);
        ctx.restore();
      }
    }
    // 英雄
    if (g.hero){
      ctx.font='26px serif';
      ctx.fillText(g.hero.emoji, g.hero.c*CELL+12, g.hero.r*CELL+36);
      ctx.strokeStyle='rgba(120,200,255,.4)';
      ctx.beginPath(); ctx.arc(g.hero.c*CELL+CELL/2, g.hero.r*CELL+CELL/2, g.hero.radius*CELL, 0, 7); ctx.stroke();
    }

    // 投射物（在敌人下方：飞向敌人的途中）
    renderProjectiles();

    // 敌人 + 血条（居中绘制，大小按 HP 缩放）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const en of g.enemies){
      // 大小：18~40px，按 maxHp 平方根缩放，越强越大
      const size = Math.round(18 + Math.min(22, Math.sqrt(en.maxHp * 0.05) * 2));
      ctx.font = size + 'px serif';
      ctx.fillText(en.emoji, en.x, en.y);
      // 血条：宽度和位置随大小动态变化
      const barW = Math.round(size * 0.8);
      const barH = Math.max(3, Math.round(size * 0.08));
      const barY = en.y - size/2 - barH - 2;
      ctx.fillStyle = '#000';
      ctx.fillRect(en.x - barW/2 - 1, barY - 1, barW + 2, barH + 2);
      const ratio = Math.max(0, en.hp/en.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#48BB78' : (ratio > 0.25 ? '#FFD93D' : '#F56565');
      ctx.fillRect(en.x - barW/2, barY, barW * ratio, barH);
    }

    // 命中爆点 + 粒子
    renderHitEffects();
    // 激光 / 电弧
    renderLasers();

    // 选中实体的高亮范围（最上层）
    if (selected){
      ctx.strokeStyle='rgba(255,230,120,.85)'; ctx.lineWidth=2.5;
      if (selected.kind==='tower'){
        const tw = selected.ref;
        ctx.beginPath(); ctx.arc(tw.c*CELL+CELL/2, tw.r*CELL+CELL/2, tw.range*CELL, 0, 7); ctx.stroke();
      } else if (selected.kind==='hero'){
        const h = selected.ref;
        ctx.beginPath(); ctx.arc(h.c*CELL+CELL/2, h.r*CELL+CELL/2, h.radius*CELL, 0, 7); ctx.stroke();
      }
      ctx.lineWidth=1;
    }

    // 飘字
    renderFloats();
    // 波次横幅
    renderWaveBanner();
    // 倒计时
    renderCountdown();

    renderHUD();
  }

  function renderHoverPreview(){
    if (!g || !mouseGrid) return;
    // 鼠标位置预览格
    const {r, c} = mouseGrid;
    const placeable = (g.map.grid[r][c] === 1);
    let canFit = placeable;
    if (placeable && g.selectedTowerType){
      try { canFit = window.canPlace(g.map, r, c); } catch(_) { canFit = false; }
    }
    // 若已在该位置放了塔/英雄，则不显示预览
    const occupied = g.towers.some(t=>t.r===r && t.c===c) || (g.hero && g.hero.r===r && g.hero.c===c);

    if (!occupied && g.selectedTowerType){
      const t = window.TOWER_TYPES[g.selectedTowerType];
      // 射程圈
      ctx.save();
      ctx.strokeStyle = t.color;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c*CELL+CELL/2, r*CELL+CELL/2, t.range*CELL, 0, 7);
      ctx.stroke();
      // 预览格
      ctx.fillStyle = canFit ? 'rgba(78, 205, 196, 0.45)' : 'rgba(245, 101, 101, 0.45)';
      ctx.fillRect(c*CELL+2, r*CELL+2, CELL-5, CELL-5);
      // 边框
      ctx.strokeStyle = canFit ? '#4ECDC4' : '#F56565';
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.strokeRect(c*CELL+2, r*CELL+2, CELL-5, CELL-5);
      ctx.restore();

      // ---- P1.1 悬停文字标签 ----
      ctx.save();
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      const labelX = c * CELL + CELL / 2;
      const labelY = r * CELL - 8;
      const airLabel = t.hitsAir ? '🛬✓' : '🛬✗';
      const text = `射程${t.range}格 ${airLabel}`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(labelX - tw/2 - 6, labelY - 15, tw + 12, 22);
      ctx.fillStyle = t.hitsAir ? '#4ECDC4' : '#F56565';
      ctx.fillText(text, labelX, labelY);
      ctx.restore();
      // ---- end P1.1 ----
    }
  }

  function renderProjectiles(){
    for (const p of projectiles){
      if (p.arrived) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      switch (p.type){
        case 'arrow':
          ctx.strokeStyle = p.color;
          ctx.fillStyle = p.color;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-10, 0); ctx.lineTo(7, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(7, 0); ctx.lineTo(2, -4); ctx.lineTo(2, 4); ctx.closePath();
          ctx.fill();
          // 羽毛
          ctx.fillStyle = '#FFD93D';
          ctx.fillRect(-11, -3, 3, 6);
          break;
        case 'fire': {
          const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
          grad.addColorStop(0, '#FFF1A8');
          grad.addColorStop(0.4, '#FF6B1A');
          grad.addColorStop(1, 'rgba(255,107,26,0)');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
          ctx.fillStyle = '#FFEC8B';
          ctx.beginPath(); ctx.arc(-1, -1, 2.5, 0, 7); ctx.fill();
          break;
        }
        case 'ice':
          ctx.fillStyle = p.color;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(8, 0); ctx.lineTo(0, -5); ctx.lineTo(-8, 0); ctx.lineTo(0, 5); ctx.closePath();
          ctx.fill(); ctx.stroke();
          // 高光
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath(); ctx.arc(-2, -1, 1.5, 0, 7); ctx.fill();
          break;
        case 'ball':
          // 烟雾尾迹
          ctx.fillStyle = 'rgba(180,180,180,0.55)';
          ctx.beginPath(); ctx.arc(-11, 0, 5, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(200,200,200,0.35)';
          ctx.beginPath(); ctx.arc(-18, 0, 3, 0, 7); ctx.fill();
          // 炮弹
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fill();
          // 高光
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(-2, -2, 1.5, 0, 7); ctx.fill();
          // 引信火花
          ctx.fillStyle = '#FFD93D';
          ctx.beginPath(); ctx.arc(-4, -4, 1.5, 0, 7); ctx.fill();
          break;
      }
      ctx.restore();
    }
  }

  function renderHitEffects(){
    // 爆点圆环
    for (const e of hitEffects){
      const t = 1 - e.life / e.maxLife;
      const alpha = Math.max(0, 1 - t);
      const baseR = e.splash > 0 ? e.splash * CELL : 18;
      const radius = baseR * (0.35 + t * 0.85);
      ctx.save();
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = alpha * 0.9;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius, 0, 7);
      ctx.stroke();
      // 内圈高亮
      ctx.globalAlpha = alpha * 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius * 0.55, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
    // 粒子
    for (const p of particles){
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function renderLasers(){
    for (const l of lasers){
      const t = 1 - l.life / l.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t * 1.5);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 4;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
      // 白色高亮内芯
      ctx.globalAlpha = Math.max(0, 1 - t * 1.8);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderFloats(){
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats){
      const t = 1 - f.life / f.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function renderWaveBanner(){
    if (!waveBanner) return;
    const t = 1 - waveBanner.life / waveBanner.maxLife;
    const enter = Math.min(1, (1 - waveBanner.life / waveBanner.maxLife) * 4); // 0->1 快速入场
    const alpha = waveBanner.life < 0.4 ? waveBanner.life / 0.4 : 1;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(canvas.width/2, canvas.height * 0.32);
    ctx.scale(0.6 + 0.4 * enter, 0.6 + 0.4 * enter);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 56px system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#FF6B9D';
    ctx.strokeText('🌊 第 ' + waveBanner.wave + ' 波', 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText('🌊 第 ' + waveBanner.wave + ' 波', 0, 0);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#2D3748';
    ctx.fillText('敌人来袭！', 0, 40);
    ctx.restore();
  }

  function renderCountdown(){
    if (countdown <= 0) return;
    const n = Math.ceil(countdown);
    const text = n > 0 ? String(n) : '开始!';
    const t = countdown - Math.floor(countdown);
    const scale = 1.2 - t * 0.5;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.95;
    ctx.font = 'bold 120px system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#FF6B9D';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function renderHUD(){
    const hud = document.getElementById('hud');
    if (!g) return;
    hud.innerHTML =
      '<span class="hud-item gold">💰 '+g.gold+'</span>'+
      '<span class="hud-item hp">❤️ '+g.baseHp+'</span>'+
      '<span class="hud-item wave">🌊 '+g.wave+' / '+window.CFG.WAVES+'</span>'+
      '<span class="hud-item diff">🎯 '+g.diffCfg.label+'</span>';
  }

  function showEnd(win){
    const ov = document.getElementById('overlay');
    ov.className = 'overlay show';
    ov.innerHTML = `<h1>${win?'🎉 胜利!':'💥 失败'}</h1>`+
      `<p>${win?'恭喜守住所有 10 波！':'基地被攻破，再来一次吧'}</p>`+
      `<button onclick="location.reload()">🔄 重新开始</button>`;
    if (win) SFX.win(); else SFX.lose();
  }

  // ---------- 静音按钮 ----------
  function initMuteBtn(){
    const btn = document.createElement('button');
    btn.id = 'mute-btn';
    btn.className = 'mute-btn' + (SFX.isMuted() ? ' muted' : '');
    btn.type = 'button';
    btn.title = '切换音效';
    btn.innerHTML = SFX.isMuted() ? '🔇' : '🔊';
    btn.onclick = ()=>{
      SFX.ensure();                       // 首次点击也解锁音频
      const m = SFX.toggleMuted();
      btn.innerHTML = m ? '🔇' : '🔊';
      btn.classList.toggle('muted', m);
      flash(m ? '🔇 已静音' : '🔊 音效开启');
    };
    document.body.appendChild(btn);
  }

  // ---------- 主循环 ----------
  function loop(now){
    // 修复[原因3 硬化]：clamp 下界为 0，防止系统时钟回退（now<last）产生负 dt，
    // 负 dt 会让 tw.cd -= dt 变成 cd 递增，导致冷却被无限拉长（塔永久不开火）。
    const dt = Math.max(0, Math.min(0.05, (now-last)/1000)); last = now;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  initMuteBtn();
  initMenu();
  requestAnimationFrame(loop);
})();
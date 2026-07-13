// 胜负面板 panel: 胜利简单 + 失败复盘 (P1.2)
(function(){
  'use strict';

  function buildFailureHtml(g){
    const towerCount = {};
    for (const t of g.towerBuildHistory) towerCount[t] = (towerCount[t] || 0) + 1;
    const towerEntries = Object.entries(towerCount).sort((a,b) => b[1] - a[1]);
    const towerSummary = towerEntries.length > 0
      ? towerEntries.map(([k,v]) => {
          const t = window.TOWER_TYPES[k];
          return (t ? t.emoji : k) + '×' + v;
        }).join(' ')
      : '无';

    let maxLeakWave = 0, maxLeakCount = 0;
    for (const wStr in g.leaksPerWave) {
      const cnt = g.leaksPerWave[wStr];
      if (cnt > maxLeakCount) { maxLeakCount = cnt; maxLeakWave = Number(wStr); }
    }

    let hint = '';
    const noAirTower = towerEntries.length === 0
      || towerEntries.filter(([k]) => window.TOWER_TYPES[k] && window.TOWER_TYPES[k].hitsAir).length === 0;
    const noSplashTower = towerEntries.length === 0
      || towerEntries.filter(([k]) => window.TOWER_TYPES[k] && window.TOWER_TYPES[k].splash > 0).length === 0;
    if (noAirTower && g.leaks >= 3) hint = '提示: 缺少对空塔(⚡电塔/🎯狙塔/💣炮塔)，飞行怪拦不住';
    else if (g.wave >= 7 && noSplashTower && g.leaks >= 2) hint = '提示: 缺少范围塔(🔥火塔/💣炮塔)，重甲怪减伤严重';
    else if (g.leaks > 5) hint = '提示: 试试升级而非多建，或调整塔的位置';
    else if (g.leaks > 0) hint = '提示: 少量漏怪，注意波次节奏安排英雄';

    return '<h1>💥 失败 — 第 ' + g.wave + ' 波</h1>' +
      '<div class="end-stats">' +
      '<p>击杀: <b>' + g.kills + '</b> · 漏怪: <b>' + g.leaks + '</b>' +
      (maxLeakCount > 0 ? ' · 最高漏怪波: W' + maxLeakWave + '(' + maxLeakCount + '个)' : '') +
      '</p>' +
      '<p>塔系: ' + towerSummary + '</p>' +
      (hint ? '<p class="end-hint">💡 ' + hint + '</p>' : '') +
      '</div>' +
      '<div class="end-btns">' +
      '<button data-action="restart">🔄 再来一局</button>' +
      '<button data-action="change-diff">📋 换难度</button>' +
      '</div>';
  }

  function createEndPanel(){
    let parent = null;
    function show(win, g){
      if (!parent) return;
      parent.className = 'overlay show';
      if (win) {
        parent.innerHTML = '<h1>🎉 胜利!</h1>' +
          '<p>恭喜守住所有 ' + g.wave + ' 波！</p>' +
          '<div class="end-btns">' +
          '<button data-action="restart">🔄 再来一局</button>' +
          '</div>';
      } else {
        parent.innerHTML = buildFailureHtml(g);
      }
      parent.querySelectorAll('[data-action]').forEach(btn => {
        btn.onclick = () => window.ui.emit(window.ui.actions.END_REPLAY, { action: btn.dataset.action });
      });
    }
    function hide(){
      if (!parent) return;
      parent.className = 'overlay';
    }
    return {
      mount(parentEl){ parent = parentEl; },
      show,
      hide,
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createEndPanel };
  } else {
    window.createEndPanel = createEndPanel;
  }
})();

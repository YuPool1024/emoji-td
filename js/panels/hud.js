// 顶部 HUD panel: 金币 / 血量 / 波数 / 难度（预备加 P2.3 倍速/暂停）
(function(){
  'use strict';

  function createHudPanel(){
    let parent = null;
    let lastSig = '';
    function render(state){
      if (!parent || !state || !state.game) return;
      const g = state.game;
      const sig = (g.gold || 0) + '|' + (g.baseHp || 0) + '|' + (g.wave || 0) + '|' +
        (g.diffCfg ? g.diffCfg.label : '') + '|' + !!state.paused + '|' + (state.speedMul || 1);
      if (sig === lastSig) return;
      lastSig = sig;

      const status = state.paused
        ? '<span class="hud-item pause">⏸ 暂停</span>'
        : (state.speedMul && state.speedMul !== 1
            ? '<span class="hud-item speed">×' + state.speedMul + '</span>'
            : '');
      parent.innerHTML =
        '<span class="hud-item gold">💰 ' + g.gold + '</span>' +
        '<span class="hud-item hp">❤️ ' + g.baseHp + '</span>' +
        '<span class="hud-item wave">🌊 ' + g.wave + ' / ' + window.CFG.WAVES + '</span>' +
        '<span class="hud-item diff">🎯 ' + (g.diffCfg ? g.diffCfg.label : '') + '</span>' +
        status;
    }
    return {
      mount(parentEl){ parent = parentEl; },
      update(state){ render(state); },
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createHudPanel };
  } else {
    window.createHudPanel = createHudPanel;
  }
})();

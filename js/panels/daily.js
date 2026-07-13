// 每日挑战
(function(){
  'use strict';

  // mulberry32 PRNG
  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function todaySeed(){
    var d = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD UTC
    var n = 0;
    for (var i = 0; i < d.length; i++) n = n * 31 + d.charCodeAt(i);
    return n >>> 0;
  }

  function remainingTimeString(){
    var now = Date.now();
    var tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    var ms = tomorrow.getTime() - now;
    if (ms <= 0) return '即将刷新';
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    return '剩余 ' + h + 'h ' + m + 'm';
  }

  function createDailyPanel(){
    var parent = null;
    function show(){
      if (!parent) return;
      var seed = todaySeed();
      parent.className = 'overlay show';
      parent.innerHTML = '<h1>🎲 每日挑战</h1>' +
        '<div class="end-stats" style="text-align:center;">' +
        '<p>今日种子: <b>' + seed + '</b></p>' +
        '<p>' + remainingTimeString() + '</p>' +
        '</div>' +
        '<div class="end-btns">' +
        '<button data-action="start-daily">🎲 开始</button>' +
        '<button data-action="back">返回</button>' +
        '</div>';
      parent.querySelector('[data-action="start-daily"]').onclick = function(){
        window._dailySeed = seed;
        if (typeof window._setGlobalRng === 'function') window._setGlobalRng(mulberry32(seed));
        if (window.startGame) window.startGame('normal');  // 每日挑战用 normal 难度
      };
      parent.querySelector('[data-action="back"]').onclick = function(){ if (window.ui) window.ui.emit(window.ui.actions.SHOW_MAIN_MENU); };
    }
    return {
      mount: function(parentEl){ parent = parentEl; },
      show: show,
      todaySeed: todaySeed,
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createDailyPanel: createDailyPanel, todaySeed: todaySeed, mulberry32: mulberry32 };
  } else {
    window.createDailyPanel = createDailyPanel;
    window.todaySeed = todaySeed;
    window.mulberry32 = mulberry32;
  }
})();

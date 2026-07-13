// 英雄选择面板（主菜单）
(function(){
  'use strict';

  function getUnlocked(){
    try{ return JSON.parse(localStorage['td_achievements'])||[]; }catch(e){ return []; }
  }

  function createHeroSelectPanel(){
    var parent = null;
    function show(){
      if (!parent || !window.HERO_TYPES) return;
      var unlocked = getUnlocked();
      var selected = window._selectedHeroType || 'warrior';
      var html = '<h1>🦸 选择英雄</h1><div class="hero-list">';
      for (var key in window.HERO_TYPES){
        var h = window.HERO_TYPES[key];
        var canUse = !h.unlock || unlocked.indexOf(h.unlock) !== -1;
        var isSel = selected === key;
        html += '<div class="hero-card' + (isSel ? ' hero-sel' : '') + (canUse ? '' : ' hero-locked') + '" data-hero="' + key + '">' +
          '<div class="hero-icon">' + h.emoji + '</div>' +
          '<div class="hero-info"><b>' + (key==='warrior'?'战士':(key==='mage'?'法师':'猎人')) + '</b><br>' +
          '<small>' + h.desc + '</small></div>' +
          (!canUse ? '<div class="hero-lock">🔒 成就解锁</div>' : '') +
          '</div>';
      }
      html += '</div><div class="end-btns"><button data-action="back">返回</button></div>';
      parent.className = 'overlay show';
      parent.innerHTML = html;
      // 英雄卡片点击
      parent.querySelectorAll('[data-hero]').forEach(function(card){
        card.onclick = function(){
          var heroKey = this.dataset.hero;
          var hh = window.HERO_TYPES[heroKey];
          if (hh && !hh.unlock || (hh && hh.unlock && unlocked.indexOf(hh.unlock) !== -1)){
            window._selectedHeroType = heroKey;
            if (parent) show();  // 刷新面板
            if (window.ui) window.ui.toast('已选择 ' + (heroKey==='warrior'?'战士':(heroKey==='mage'?'法师':'猎人')), 800);
          } else {
            if (window.ui) window.ui.toast('🔒 需要成就解锁', 1200);
          }
        };
      });
      parent.querySelector('[data-action="back"]').onclick = function(){ if (panels && panels.menu) panels.menu.show(); };
    }
    return {
      mount: function(parentEl){ parent = parentEl; },
      show: show,
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createHeroSelectPanel: createHeroSelectPanel };
  } else {
    window.createHeroSelectPanel = createHeroSelectPanel;
  }
})();

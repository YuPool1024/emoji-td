// 成就系统
(function(){
  'use strict';

  var ACHIEVEMENTS = [
    { id:'first_win', name:'首次通关', desc:'任意难度通关', emoji:'🏆', check:function(g){ return g && g.state === 'won'; } },
    { id:'hard_clear', name:'硬核征服', desc:'硬核通关', emoji:'🥇', check:function(g){ return g && g.state === 'won' && g.diff === 'hard'; } },
    { id:'tactic_air', name:'制空', desc:'一局击杀 ≥30 飞行怪', emoji:'✈️', check:function(g){ return g && g.airKills >= 30; } },
    { id:'tactic_armor', name:'破甲', desc:'一局击杀 ≥20 重甲怪', emoji:'🛡️', check:function(g){ return g && g.armorKills >= 20; } },
    { id:'full_comp', name:'全职业', desc:'一局集齐 6 种塔', emoji:'🌟', check:function(g){
        if (!g) return false; var s = new Set(g.towerBuildHistory); return s.size >= 6;
    }},
    { id:'completionist', name:'集邮', desc:'解锁全部塔的 tier-3', emoji:'💎', check:function(g){
        if (!g) return false; var tier3 = new Set(g.towers.filter(function(t){ return t.level >= 3; }).map(function(t){ return t.type; })); return tier3.size >= 6;
    }},
    { id:'pacifist', name:'零漏', desc:'通关且漏怪 = 0', emoji:'🎯', check:function(g){ return g && g.state === 'won' && g.leaks === 0; }},
    { id:'speedrun', name:'神速', desc:'硬核通关 ≤ 8 分钟', emoji:'⚡', check:function(g){ return g && g.state === 'won' && g.diff === 'hard' && g.duration <= 480; }},
    { id:'tower_of_life', name:'不死之塔', desc:'通关且英雄未死', emoji:'❤️', check:function(g){
        if (!g || g.state !== 'won') return false; return g.hero && g.hero.alive;
    }},
  ];

  function loadAchievements(){
    try { return JSON.parse(localStorage['td_achievements']) || []; } catch(e) { return []; }
  }
  function saveAchievements(list){
    localStorage['td_achievements'] = JSON.stringify(list);
  }

  function checkUnlocks(g){
    var unlocked = loadAchievements();
    var newOnes = [];
    for (var i = 0; i < ACHIEVEMENTS.length; i++){
      var a = ACHIEVEMENTS[i];
      if (unlocked.indexOf(a.id) === -1 && a.check(g)){
        unlocked.push(a.id);
        newOnes.push(a);
      }
    }
    if (newOnes.length) saveAchievements(unlocked);
    return newOnes;
  }

  function createAchievementsPanel(){
    var parent = null;
    function show(){
      if (!parent) return;
      var unlocked = loadAchievements();
      var html = '<h1>🏆 成就 <span style="font-size:16px;opacity:0.7;">' + unlocked.length + '/' + ACHIEVEMENTS.length + '</span></h1>';
      html += '<div class="end-stats" style="margin:8px 0;">';
      for (var i = 0; i < ACHIEVEMENTS.length; i++){
        var a = ACHIEVEMENTS[i];
        var done = unlocked.indexOf(a.id) !== -1;
        html += '<div class="ach-item' + (done ? ' ach-done' : ' ach-locked') + '">' +
          '<span class="ach-icon">' + (done ? a.emoji : '🔒') + '</span>' +
          '<span class="ach-detail"><b>' + a.name + '</b><br><small>' + a.desc + '</small></span>' +
          '</div>';
      }
      html += '</div>';
      html += '<div class="end-btns"><button data-action="back-menu">返回</button></div>';
      parent.className = 'overlay show';
      parent.innerHTML = html;
      parent.querySelector('[data-action="back-menu"]').onclick = function(){ if (window.ui) window.ui.emit(window.ui.actions.SHOW_MAIN_MENU); };
    }
    return {
      mount: function(parentEl){ parent = parentEl; },
      show: show,
      checkUnlocks: checkUnlocks,
      getProgress: function(){ return loadAchievements().length + '/' + ACHIEVEMENTS.length; },
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createAchievementsPanel: createAchievementsPanel, ACHIEVEMENTS: ACHIEVEMENTS, checkUnlocks: checkUnlocks };
  } else {
    window.createAchievementsPanel = createAchievementsPanel;
  }
})();

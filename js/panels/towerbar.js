// 塔栏 panel: 6 种塔按钮 + 克制标签
(function(){
  'use strict';

  function createTowerbarPanel(){
    let parent = null;
    let lastSelected = null;
    function render(selectedTowerType){
      if (!parent) return;
      if (selectedTowerType === lastSelected) return;
      lastSelected = selectedTowerType;
      parent.innerHTML = '';
      for (const k in window.TOWER_TYPES){
        const t = window.TOWER_TYPES[k];
        const b = document.createElement('button');
        b.className = 'tower-btn' + (selectedTowerType === k ? ' sel' : '');
        b.type = 'button';
        const airTag = t.hitsAir ? '<span class="tag tag-green">🛬✓</span>'
                                 : '<span class="tag tag-red">🛬✗</span>';
        const armorTag = t.splash > 0 ? '<span class="tag tag-green">🛡️✓</span>'
                                       : '<span class="tag tag-red">🛡️✗</span>';
        b.innerHTML = '<span class="tower-emoji">' + t.emoji + '</span>' +
          '<span>' + t.name + '</span>' +
          '<span class="tower-cost">💰' + t.cost + '</span>' +
          '<span class="tower-tags">' + airTag + armorTag + '</span>';
        b.onclick = () => window.ui.emit(window.ui.actions.TOWER_SELECT, { type: k });
        parent.appendChild(b);
      }
    }
    return {
      mount(parentEl){ parent = parentEl; },
      update(state){ render(state && state.selectedTowerType); },
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createTowerbarPanel };
  } else {
    window.createTowerbarPanel = createTowerbarPanel;
  }
})();

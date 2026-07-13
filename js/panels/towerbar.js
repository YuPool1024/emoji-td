// 塔栏 panel: 6 种塔按钮 + 克制标签 + 英雄部署按钮
(function(){
  'use strict';

  function createTowerbarPanel(){
    let parent = null;
    let lastSig = '';

    function render(selectedTowerType, selectedHeroType, heroDeployed){
      if (!parent) return;
      const sig = (selectedTowerType || '') + '|' + (selectedHeroType || '') + '|' + (heroDeployed ? '1' : '0');
      if (sig === lastSig) return;
      lastSig = sig;

      parent.innerHTML = '';

      // 6 种塔按钮
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

      // 英雄部署按钮
      const heroType = window._selectedHeroType || 'warrior';
      const hInfo = window.HERO_TYPES[heroType];
      const heroBtn = document.createElement('button');
      heroBtn.className = 'tower-btn hero-deploy-btn' + (selectedHeroType ? ' sel' : '');
      heroBtn.type = 'button';
      if (heroDeployed) {
        heroBtn.disabled = true;
        heroBtn.innerHTML = (hInfo ? hInfo.emoji : '🦸') + ' 已部署';
      } else {
        heroBtn.innerHTML = (hInfo ? hInfo.emoji : '🦸') + ' 部署' + (hInfo ? ' ' + (heroType === 'warrior' ? '战士' : heroType === 'mage' ? '法师' : '猎人') : '');
        heroBtn.onclick = () => window.ui.emit(window.ui.actions.DEPLOY_HERO, {});
      }
      parent.appendChild(heroBtn);
    }

    return {
      mount(parentEl){ parent = parentEl; },
      update(state){
        if (!state) return;
        render(state.selectedTowerType, state.selectedHeroType, state.heroDeployed);
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createTowerbarPanel };
  } else {
    window.createTowerbarPanel = createTowerbarPanel;
  }
})();

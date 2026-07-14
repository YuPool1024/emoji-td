// 新手引导卡 panel: 3 张轮播
(function(){
  'use strict';

  const CARDS = [
    '👋 选塔 → 点格子放塔（至少留一条路给敌人走）',
    '🦸 选塔时直接点空地 → 部署英雄（范围持续攻击+定身）',
    '🛰️ 切硬核前，记得：电/狙/炮 可打飞行，重甲需要持续伤害',
  ];

  function createOnboardingPanel(){
    let parent = null;
    let timer = null;
    let currentIdx = 0;
    let onDone = null;

    function render(){
      if (!parent) return;
      const dots = CARDS.map((_, i) =>
        '<span class="dot' + (i === currentIdx ? ' active' : '') + '"></span>'
      ).join('');
      const isLast = currentIdx >= CARDS.length - 1;
      parent.innerHTML = '<div class="onboard-card">' +
        '<div class="onboard-text">' + CARDS[currentIdx] + '</div>' +
        '<div class="onboard-dots">' + dots + '</div>' +
        '<button class="onboard-skip">' + (isLast ? '👁 我已了解' : '跳过') + '</button>' +
        '</div>';
      parent.classList.add('show');
      const skipBtn = parent.querySelector('.onboard-skip');
      if (skipBtn) skipBtn.onclick = () => finish();
    }

    function next(){
      currentIdx++;
      if (currentIdx >= CARDS.length) { finish(); return; }
      render();
    }

    function finish(){
      clearInterval(timer);
      timer = null;
      if (parent) parent.classList.remove('show');
      if (onDone) { const cb = onDone; onDone = null; cb(); }
    }

    function start(onDoneCb){
      if (!parent) return;
      onDone = onDoneCb || null;
      currentIdx = 0;
      render();
      timer = setInterval(next, 2500);
    }

    function hide(){
      clearInterval(timer);
      timer = null;
      if (parent) parent.classList.remove('show');
      onDone = null;
    }

    return {
      mount(parentEl){ parent = parentEl; },
      start,
      hide,
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createOnboardingPanel };
  } else {
    window.createOnboardingPanel = createOnboardingPanel;
  }
})();

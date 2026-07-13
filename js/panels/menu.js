// 主菜单 panel: 难度选择
(function(){
  'use strict';

  function createMenuPanel(){
    let parent = null;
    function show(){
      if (!parent) return;
      parent.className = 'overlay show';
      parent.innerHTML = '<h1>🎮 Emoji 塔防</h1>' +
        '<p>选择难度开始游戏</p>' +
        '<div class="diff-buttons">' +
        '<button data-diff="easy">🌱 保守</button>' +
        '<button data-diff="normal">⚔️ 标准</button>' +
        '<button data-diff="hard">💀 硬核</button>' +
        '</div>';
      const btns = parent.querySelectorAll('[data-diff]');
      btns.forEach(btn => {
        btn.onclick = () => window.ui.emit(window.ui.actions.START_GAME, { diff: btn.dataset.diff });
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
    module.exports = { createMenuPanel };
  } else {
    window.createMenuPanel = createMenuPanel;
  }
})();

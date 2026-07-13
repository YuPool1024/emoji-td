// 短时提示 panel - 包装 ui.toast
(function(){
  'use strict';

  function createToastPanel(){
    let parent = null;
    function show(msg, dur){
      if (!parent) return;
      parent.textContent = msg;
      parent.classList.add('show');
      clearTimeout(show._t);
      show._t = setTimeout(() => parent.classList.remove('show'), dur || 1200);
    }
    return {
      mount(parentEl){ parent = parentEl; },
      show,
      isMounted(){ return !!parent; },
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createToastPanel };
  } else {
    window.createToastPanel = createToastPanel;
  }
})();

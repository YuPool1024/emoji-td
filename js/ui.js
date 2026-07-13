// 通用 UI 工具 + action 事件总线
(function(){
  'use strict';

  const actions = {
    START_GAME: 'START_GAME',
    PLACE_TOWER: 'PLACE_TOWER',
    TOWER_SELECT: 'TOWER_SELECT',
    UPGRADE_TOWER: 'UPGRADE_TOWER',
    SELL_TOWER: 'SELL_TOWER',
    UPGRADE_HERO: 'UPGRADE_HERO',
    REVIVE_HERO: 'REVIVE_HERO',
    END_REPLAY: 'END_REPLAY',
    TOGGLE_MUTE: 'TOGGLE_MUTE',
    SHOW_ACHIEVEMENTS: 'SHOW_ACHIEVEMENTS',  // P3.1
    SHOW_HERO_SELECT: 'SHOW_HERO_SELECT',    // P3.4
    // P2.2 tier-3
    SHOW_TIER3_CONFIRM: 'SHOW_TIER3_CONFIRM',
    TIER3_UPGRADE: 'TIER3_UPGRADE',
    CANCEL_TIER3: 'CANCEL_TIER3',
  };

  const handlers = new Map();

  function on(action, handler){
    if (!handlers.has(action)) handlers.set(action, []);
    handlers.get(action).push(handler);
  }

  function emit(action, payload){
    const list = handlers.get(action) || [];
    for (const h of list) {
      try { h(payload); } catch(e) { console.error(`ui handler error [${action}]:`, e); }
    }
  }

  function toast(msg, dur = 1200){
    const el = document.getElementById('flash');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), dur);
  }

  function modal(opts){
    const ov = document.getElementById('overlay');
    if (!ov) return { close(){} };
    const oldClass = ov.className;
    const oldHtml = ov.innerHTML;
    ov.className = 'overlay show';
    ov.innerHTML = opts.html;
    let closed = false;
    return {
      close(){
        if (closed) return;
        closed = true;
        ov.className = oldClass;
        ov.innerHTML = oldHtml;
        if (opts.onClose) opts.onClose();
      }
    };
  }

  function confirmDialog(opts){
    return new Promise(resolve => {
      const ov = document.getElementById('overlay');
      if (!ov) return resolve(false);
      const oldClass = ov.className;
      const oldHtml = ov.innerHTML;
      ov.className = 'overlay show confirm-mode';
      ov.innerHTML = '<div class="confirm-modal">' +
        '<p>' + opts.message + '</p>' +
        '<div class="confirm-btns">' +
        '<button class="confirm-no">' + (opts.noText || '取消') + '</button>' +
        '<button class="confirm-yes">' + (opts.yesText || '确认') + '</button>' +
        '</div>' +
        '</div>';
      const yesBtn = ov.querySelector('.confirm-yes');
      const noBtn = ov.querySelector('.confirm-no');
      const close = (result) => {
        ov.className = oldClass;
        ov.innerHTML = oldHtml;
        resolve(result);
      };
      if (yesBtn) yesBtn.onclick = () => close(true);
      if (noBtn) noBtn.onclick = () => close(false);
    });
  }

  const api = { on, emit, toast, modal, confirm: confirmDialog, actions };

  if (typeof module !== 'undefined' && module.exports){
    module.exports = api;
  } else {
    window.ui = api;
  }
})();

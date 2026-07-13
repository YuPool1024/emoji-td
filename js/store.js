// 轻量发布订阅 store (微任务合并 notify)
(function(){
  let state = {};
  const listeners = new Set();
  let scheduledNotify = false;

  function getState(){ return state; }

  function setState(partial){
    const next = typeof partial === 'function' ? partial(state) : partial;
    if (next === null || next === undefined) return;
    state = Object.assign({}, state, next);
    scheduleNotify();
  }

  function scheduleNotify(){
    if (scheduledNotify) return;
    scheduledNotify = true;
    Promise.resolve().then(() => {
      scheduledNotify = false;
      for (const l of listeners) {
        try { l(state); } catch(e){ console.error('store listener err:', e); }
      }
    });
  }

  function subscribe(listener){
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function select(selector){ return selector(state); }

  const api = { getState, setState, subscribe, select };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.store = api;
})();

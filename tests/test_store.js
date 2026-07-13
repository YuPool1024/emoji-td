var assert = require('assert');

// 模拟 store（不依赖 document/浏览器）
(async () => {
  let state = {};
  const listeners = new Set();
  let scheduledNotify = false;
  function getState(){ return state; }
  function setState(partial){
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = Object.assign({}, state, next);
    if (scheduledNotify) return;
    scheduledNotify = true;
    Promise.resolve().then(() => {
      scheduledNotify = false;
      for (const l of listeners) l(state);
    });
  }
  function subscribe(l){ listeners.add(l); return () => listeners.delete(l); }
  const store = { getState, setState, subscribe };

  // 基本读写
  store.setState({a: 1});
  assert.strictEqual(store.getState().a, 1);

  // 函数式更新
  store.setState(prev => ({a: prev.a * 2}));
  await new Promise(r => setImmediate(r));
  assert.strictEqual(store.getState().a, 2);

  // subscribe / unsubscribe
  let count = 0;
  const unsub = store.subscribe(() => count++);
  store.setState({b: 1});
  await new Promise(r => setImmediate(r));
  assert.strictEqual(count, 1);
  unsub();
  store.setState({b: 2});
  await new Promise(r => setImmediate(r));
  assert.strictEqual(count, 1);

  console.log('ALL STORE TESTS PASS');
})();

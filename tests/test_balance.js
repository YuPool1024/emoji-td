const B = require('../js/balance.js');
const diffs = ['easy','normal','hard'];
for (const d of diffs){
  const r = B.evaluate(d, 10);
  if (r.score <= 1) throw new Error('FAIL: '+d+' 第10波不可通关 score='+r.score);
  if (r.score > 3) throw new Error('FAIL: '+d+' 过松 score='+r.score);
  console.log(d, '波10 所需DPS='+r.reqDps.toFixed(0), '可达DPS='+r.achDps.toFixed(0), '平衡分='+r.score.toFixed(2));
}
console.log('ALL BALANCE TESTS PASS');

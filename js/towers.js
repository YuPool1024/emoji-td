const TOWER_TYPES = {
  arrow:  { emoji:'🏹', name:'箭塔', cost:50,  range:2.2, dps:14, splash:0,   hitsAir:false, slow:0,   color:'#9cd' },
  tesla:  { emoji:'⚡', name:'电塔', cost:90,  range:1.8, dps:18, splash:1.2, hitsAir:true,  slow:0,   color:'#fd6' },
  sniper: { emoji:'🎯', name:'狙塔', cost:120, range:5.0, dps:40, splash:0,   hitsAir:true,  slow:0,   color:'#f88' },
  flame:  { emoji:'🔥', name:'火塔', cost:80,  range:1.5, dps:22, splash:0.8, hitsAir:false, slow:0,   color:'#f73', dot:6 },
  frost:  { emoji:'❄️', name:'冰塔', cost:70,  range:1.8, dps:4,  splash:1.0, hitsAir:true,  slow:0.5, color:'#6cf' },
  cannon: { emoji:'💣', name:'炮塔', cost:110, range:2.0, dps:30, splash:1.5, hitsAir:true,  slow:0,   color:'#888' },
};

function makeTower(type, r, c){
  const t = TOWER_TYPES[type];
  return { type, r, c, emoji:t.emoji, name:t.name, cost:t.cost,
           range:t.range, dps:t.dps, splash:t.splash||0, hitsAir:!!t.hitsAir,
           slow:t.slow||0, dot:t.dot||0, level:1, cd:0 };
}

// 升级：提升dps与range，花费递增
function upgradeTower(tw){
  tw.level++;
  tw.dps = Math.round(tw.dps * 1.35);
  tw.range = +(tw.range * 1.1).toFixed(2);
  return tw;
}
function upgradeCost(tw){ return Math.round(tw.cost * 0.8 * tw.level); }

if (typeof module!=='undefined') module.exports = { TOWER_TYPES, makeTower, upgradeTower, upgradeCost };

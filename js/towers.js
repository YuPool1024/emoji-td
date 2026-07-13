const TOWER_TYPES = {
  // [P9] 每塔拆分为 damage (单次伤害) + fireInterval (攻击间隔秒)
  //   实时 dps = damage / fireInterval; 高频低伤 vs 低频高伤 体现塔定位
  arrow:  { emoji:'🏹', name:'箭塔', cost:50,  range:2.2, damage:7,  fireInterval:0.50, splash:0,   hitsAir:false, slow:0,   color:'#9cd',
            projType:'arrow', projColor:'#8B4513', projSpeed:620, instantHit:false,
            tier3:{cost:150, perk:'triple', perkName:'三连射'} },
  tesla:  { emoji:'⚡', name:'电塔', cost:90,  range:1.8, damage:9,  fireInterval:0.40, splash:1.2, hitsAir:true,  slow:0,   color:'#fd6',
            projType:'bolt',  projColor:'#FFE74C', projSpeed:1800, instantHit:true,
            tier3:{cost:270, perk:'chain',  perkName:'链式闪电'} },
  sniper: { emoji:'🎯', name:'狙塔', cost:120, range:5.0, damage:25, fireInterval:1.20, splash:0,   hitsAir:true,  slow:0,   color:'#f88',
            projType:'laser', projColor:'#FF3E96', projSpeed:2400, instantHit:true,
            tier3:{cost:360, perk:'pierce', perkName:'穿透射击'} },
  flame:  { emoji:'🔥', name:'火塔', cost:80,  range:1.5, damage:8,  fireInterval:0.45, splash:0.8, hitsAir:false, slow:0,   color:'#f73', dot:6,
            projType:'fire',  projColor:'#FF6B1A', projSpeed:420, instantHit:false,
            tier3:{cost:240, perk:'dot',    perkName:'真 DoT'} },
  frost:  { emoji:'❄️', name:'冰塔', cost:70,  range:1.8, damage:3,  fireInterval:0.80, splash:1.0, hitsAir:true,  slow:0.5, color:'#6cf',
            projType:'ice',   projColor:'#7FE0FF', projSpeed:520, instantHit:false,
            tier3:{cost:210, perk:'freeze', perkName:'群冻'} },
  cannon: { emoji:'💣', name:'炮塔', cost:110, range:2.0, damage:24, fireInterval:0.90, splash:1.5, hitsAir:true,  slow:0,   color:'#888',
            projType:'ball',  projColor:'#2A2A2A', projSpeed:480, instantHit:false,
            tier3:{cost:330, perk:'spread', perkName:'散射'} },
};

function makeTower(type, r, c){
  const t = TOWER_TYPES[type];
  return { type, r, c, emoji:t.emoji, name:t.name, cost:t.cost,
           range:t.range, damage:t.damage, fireInterval:t.fireInterval,
           splash:t.splash||0, hitsAir:!!t.hitsAir,
           slow:t.slow||0, dot:t.dot||0, level:1, cd:0,
           projType:t.projType, projColor:t.projColor, projSpeed:t.projSpeed, instantHit:!!t.instantHit,
           perk:null };
}

// 升级：单发伤害 +35%, 频率加快 15% (fireInterval ×0.85), 射程 +10%
// L2→3: 终极升级（直接应用 tier3 效果, 无需二次确认）
function upgradeTower(tw){
  const t = TOWER_TYPES[tw.type];
  if (tw.level === 2 && t.tier3){
    applyTier3(tw);
    return;
  }
  tw.level++;
  tw.damage = Math.round(tw.damage * 1.35);
  tw.fireInterval = +(tw.fireInterval * 0.85).toFixed(3);   // 攻击更快
  tw.range = +(tw.range * 1.1).toFixed(2);
}

// 下一级升级的真实费用（L1→2 普通价; L2→3 即 tier3.cost）
function upgradeCost(tw){
  const t = TOWER_TYPES[tw.type];
  if (tw.level === 2 && t.tier3) return t.tier3.cost;
  return Math.round(t.cost * 0.8 * tw.level);
}

// 终极升级（跳过 upgradeTower 直接生效）：伤害额外 50%, 频率再快 15%, 射程 +15%
function applyTier3(tw){
  const t = TOWER_TYPES[tw.type];
  if (!t.tier3) return false;
  tw.level = 3;
  tw.perk = t.tier3.perk;
  tw.damage = Math.round(tw.damage * 1.5);                 // 升级后 dmg × 1.5
  tw.fireInterval = +(tw.fireInterval * 0.85).toFixed(3);   // 频率再快 15%
  tw.range = +(tw.range * 1.15).toFixed(2);
  return true;
}

if (typeof module!=='undefined') module.exports = { TOWER_TYPES, makeTower, upgradeTower, upgradeCost, applyTier3 };
else { window.TOWER_TYPES = TOWER_TYPES; window.makeTower = makeTower; window.upgradeTower = upgradeTower; window.upgradeCost = upgradeCost; window.applyTier3 = applyTier3; }

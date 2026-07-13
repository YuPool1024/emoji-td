// P3.4: 多英雄
var HERO_TYPES = {
  warrior: { emoji:'🦸', hp:120, maxHp:120, radius:1.6, stickCount:2, dps:30, reviveCost:60, unlock:null, desc:'群定身+中等 DPS' },
  mage:    { emoji:'🧙', hp:80,  maxHp:80,  radius:2.0, stickCount:0, dps:20, reviveCost:80, unlock:'full_comp', desc:'范围真 DoT + 减速', dot:10 },
  hunter:  { emoji:'🏹', hp:100, maxHp:100, radius:4.0, stickCount:2, dps:50, reviveCost:100, unlock:'pacifist', desc:'单体高爆发 + 长程' },
};

function makeHero(type, r, c){
  type = type || 'warrior';
  var h = HERO_TYPES[type] || HERO_TYPES.warrior;
  return { type:type, r, c, emoji:h.emoji, level:1, hp:h.hp, maxHp:h.maxHp,
           radius:h.radius, stickCount:h.stickCount, dps:h.dps, alive:true, reviveCost:h.reviveCost,
           attackCd:0, reviveTimer:-1, dot:h.dot||0 };
}

function upgradeHero(h){
  h.level++;
  h.stickCount = 1 + h.level;
  h.radius = +(h.radius + 0.2).toFixed(2);
  h.maxHp = Math.round(h.maxHp * 1.3); h.hp = h.maxHp;
  h.dps = Math.round(h.dps * 1.25);
  return h;
}
function heroUpgradeCost(h){ return 50 * h.level; }

// instant=false → 自动半血复活; instant=true → 手动半血复活(花费金币, 立即)
// 设计决策: 手动/自动统一半血,避免玩家干等 60s 白嫖。手动复活的优势在于"立即恢复",而非"血量更多"
function reviveHero(h, instant){
  h.alive = true;
  h.hp = Math.max(1, Math.round(h.maxHp * 0.5));  // 统一半血 [PLACEHOLDER]
  h.reviveTimer = -1;
  // 兼容旧调用方（不传 instant）
  if (instant === undefined) instant = true;
  return h;
}

if (typeof module!=='undefined') module.exports = { HERO_TYPES, makeHero, upgradeHero, heroUpgradeCost, reviveHero };
else { window.HERO_TYPES = HERO_TYPES; window.makeHero = makeHero; window.upgradeHero = upgradeHero; window.heroUpgradeCost = heroUpgradeCost; window.reviveHero = reviveHero; }

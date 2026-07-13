function makeHero(r, c){
  return { r, c, emoji:'🦸', level:1, hp:120, maxHp:120, radius:1.6,
           stickCount:2,        // = 1 + level
           dps:30, alive:true, reviveCost:60, attackCd:0,
           reviveTimer: -1 };   // P1.3: -1=alive, >0=counting down in seconds, 0=auto-revive ready
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

if (typeof module!=='undefined') module.exports = { makeHero, upgradeHero, heroUpgradeCost, reviveHero };
else { window.makeHero = makeHero; window.upgradeHero = upgradeHero; window.heroUpgradeCost = heroUpgradeCost; window.reviveHero = reviveHero; }

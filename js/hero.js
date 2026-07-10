function makeHero(r, c){
  return { r, c, emoji:'🦸', level:1, hp:120, maxHp:120, radius:1.6,
           stickCount:2,        // = 1 + level
           dps:30, alive:true, reviveCost:60, attackCd:0 };
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
function reviveHero(h){ h.alive=true; h.hp=h.maxHp; }

if (typeof module!=='undefined') module.exports = { makeHero, upgradeHero, heroUpgradeCost, reviveHero };

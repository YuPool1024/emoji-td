// 特殊波次配方: 6 种 recipe
(function(){
  const WAVE_RECIPES = {
    swarm: {
      1: [{family:'swarm', tier:'normal', count:1.0}],
      2: [{family:'swarm', tier:'normal', count:1.0}],
      3: [{family:'swarm', tier:'normal', count:1.0}],
    },
    swarm_reinforce: {
      4: [
        {family:'swarm', tier:'normal', count:1.5},
        {family:'swarm', tier:'elite', count:0.2},
      ],
    },
    elite_rush: {
      5: [
        {family:'demon', tier:'elite', count:1.0},
        {family:'deep', tier:'elite', count:1.0},
        {family:'swarm', tier:'elite', count:0.5},
        {family:'demon', tier:'boss', count:0.1},
      ],
    },
    standard: {
      6: [{family:'swarm', tier:'normal', count:1.0}],
      7: [{family:'swarm', tier:'normal', count:1.0}],
      8: [{family:'swarm', tier:'normal', count:1.0}],
    },
    armor_break: {
      9: [
        {family:'demon', tier:'normal', count:2.0},
        {family:'demon', tier:'elite', count:0.3},
      ],
    },
    finale: {
      10: [
        {family:'swarm', tier:'normal', count:1.5},
        {family:'demon', tier:'elite', count:1.0},
        {family:'deep', tier:'elite', count:1.0},
        {family:'demon', tier:'boss', count:0.2},
      ],
    },
  };

  const RECIPE_DISPLAY = {
    swarm: '🪖 虫群来袭',
    swarm_reinforce: '⚠️ 虫群增援',
    elite_rush: '👑 精英海来了',
    standard: '🛡️ 标准波',
    armor_break: '🔨 破甲时刻',
    finale: '💥 最终决战',
  };

  function getRecipeForWave(w){
    for (const recipeId in WAVE_RECIPES){
      if (WAVE_RECIPES[recipeId][w]){
        return { recipeId, slots: WAVE_RECIPES[recipeId][w] };
      }
    }
    return { recipeId: 'swarm', slots: [{family:'swarm', tier:'normal', count:1.0}] };
  }

  const api = { WAVE_RECIPES, RECIPE_DISPLAY, getRecipeForWave };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { window.WAVE_RECIPES = WAVE_RECIPES; window.RECIPE_DISPLAY = RECIPE_DISPLAY; window.getRecipeForWave = getRecipeForWave; }
})();

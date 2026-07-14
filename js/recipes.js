// 特殊波次配方: 6 种 recipe
(function(){
  // 每波敌人数曲线（normal 档目标 ≈ 3→4→5→6→8→8→9→11→11→15，随波次平滑递增）。
  // slot.count 是「基础敌人数」，实际数 = round(count × m × (1+0.12(w-1)) × lateBonus)（见 enemies.js spawnWave）。
  // 注意：ENEMY_FAMILIES 上的 count 字段已删除（死字段），本处 count 即绝对基础数。
  // 设计约束：早期不再空（修复「1 敌」违和）；总量贴近原版上限，避免比基线更难（后期不可通关是独立平衡问题，见 sim_playthrough）。
  const WAVE_RECIPES = {
    swarm: {
      1: [{family:'swarm', tier:'normal', count:3.0}],
      2: [{family:'swarm', tier:'normal', count:3.6}],
      3: [{family:'swarm', tier:'normal', count:4.0}],
    },
    swarm_reinforce: {
      4: [
        {family:'swarm', tier:'normal', count:3.7},
        {family:'swarm', tier:'elite', count:0.74},
      ],
    },
    elite_rush: {
      5: [
        {family:'demon', tier:'elite', count:1.2},
        {family:'deep', tier:'elite', count:1.2},
        {family:'swarm', tier:'elite', count:1.8},
        {family:'demon', tier:'boss', count:0.68},
      ],
    },
    standard: {
      6: [{family:'swarm', tier:'normal', count:5.0}],
      7: [{family:'swarm', tier:'normal', count:4.9}],
      8: [{family:'swarm', tier:'normal', count:5.2}],
    },
    armor_break: {
      9: [
        {family:'demon', tier:'normal', count:3.7},
        {family:'demon', tier:'elite', count:0.37},
      ],
    },
    finale: {
      10: [
        {family:'swarm', tier:'normal', count:3.6},
        {family:'demon', tier:'elite', count:0.6},
        {family:'deep', tier:'elite', count:0.33},
        {family:'demon', tier:'boss', count:0.33},
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

// 操作弹窗 panel: 塔升级/出售, 英雄升级/复活
(function(){
  'use strict';

  function createPopupPanel(){
    let parent = null;

    function positionPopup(r, c){
      if (!parent) return;
      const canvas = document.getElementById('game');
      const area = document.getElementById('canvas-area');
      if (!canvas || !area) return;
      const cr = canvas.getBoundingClientRect();
      const ar = area.getBoundingClientRect();
      const sx = cr.width / canvas.width;
      const sy = cr.height / canvas.height;
      const left = (c * 50 + 50) * sx + (cr.left - ar.left);
      const top = (r * 50 + 50) * sy + (cr.top - ar.top);
      parent.style.left = Math.round(left) + 'px';
      parent.style.top = Math.round(top) + 'px';
    }

    function show(kind, ref, opts){
      if (!parent) return;
      const g = window._gameRef || (window.ui && window.ui._gameRef);
      if (!g) return;
      opts = opts || {};
      let html = '';

      if (kind === 'tower') {
        const tw = ref;
        const info = [
          { l: 'DPS', v: tw.dps },
          { l: '射程', v: tw.range + ' 格' },
          { l: '对空', v: tw.hitsAir ? '✓' : '✗' },
          { l: '溅射', v: tw.splash || 0 },
          { l: '减速', v: tw.slow || 0 },
          { l: 'dot', v: tw.dot || 0 },
        ];
        const uc = window.upgradeCost(tw);
        const refund = Math.round(tw.cost * 0.5);
        html = '<div class="popup-title">' + tw.emoji + ' ' + tw.name + ' Lv.' + tw.level + '</div>';
        for (const item of info) {
          html += '<div class="popup-info"><span class="label">' + item.l + ':</span>' + item.v + '</div>';
        }
        html += '<button class="popup-btn popup-upgrade" ' + (g.gold < uc ? 'disabled' : '') + '>⬆️ 升级 (💰' + uc + ')</button>';
        html += '<button class="popup-btn popup-sell">💰 出售 (退' + refund + ')</button>';
      } else if (kind === 'hero' || kind === 'hero-dead') {
        const h = ref;
        const info = [
          { l: '等级', v: h.level },
          { l: 'HP', v: Math.round(h.hp) + '/' + h.maxHp },
          { l: 'DPS', v: h.dps },
          { l: '范围', v: h.radius + ' 格' },
          { l: '定身', v: h.stickCount + ' 人' },
        ];
        const uc = window.heroUpgradeCost(h);
        html = '<div class="popup-title">' + h.emoji + ' 英雄 Lv.' + h.level + '</div>';
        for (const item of info) {
          html += '<div class="popup-info"><span class="label">' + item.l + ':</span>' + item.v + '</div>';
        }
        html += '<button class="popup-btn popup-upgrade" ' + (g.gold < uc ? 'disabled' : '') + '>⬆️ 升级 (💰' + uc + ')</button>';
        if (!h.alive) {
          const secLeft = Math.ceil(h.reviveTimer);
          html += '<div class="popup-info" style="color:var(--warning);font-weight:600;padding-top:6px;">💀 已阵亡 (半血复活)</div>';
          html += '<div class="popup-info"><span class="label">⏳ 自动复活:</span>' + secLeft + 's 后 (半血)</div>';
          html += '<button class="popup-btn popup-revive" ' + (g.gold < h.reviveCost ? 'disabled' : '') + '>💖 立即复活 (💰' + h.reviveCost + ', 半血)</button>';
        } else {
          html += '<div class="popup-info" style="color:var(--success);font-weight:600;padding-top:6px;">✨ 存活中</div>';
        }
      } else if (kind === 'tower-tier3') {
        // P2.2 终极升级确认弹窗
        const tier3Cost = opts.tier3Cost || 0;
        const tier3Perk = opts.tier3Perk || '';
        html = '<div class="popup-title">💎 终极升级</div>' +
          '<div class="popup-info">' + ref.emoji + ' ' + ref.name + ' → Lv.3</div>' +
          '<div class="popup-info"><span class="label">花费:</span>💰 ' + tier3Cost + '</div>' +
          '<div class="popup-info"><span class="label">效果:</span>' + tier3Perk + '</div>' +
          '<button class="popup-btn popup-cancel">取消</button>' +
          '<button class="popup-btn popup-confirm" ' + (g.gold < tier3Cost ? 'disabled' : '') + '>确认升级</button>';
      }

      parent.innerHTML = html;
      parent.classList.add('show');
      if (opts.r !== undefined && opts.c !== undefined) {
        positionPopup(opts.r, opts.c);
      }

      // Bind events via ui.emit
      const upBtn = parent.querySelector('.popup-upgrade');
      const sellBtn = parent.querySelector('.popup-sell');
      const revBtn = parent.querySelector('.popup-revive');
      const confirmBtn = parent.querySelector('.popup-confirm');
      const cancelBtn = parent.querySelector('.popup-cancel');
      if (kind === 'tower' && upBtn) upBtn.onclick = () => window.ui.emit(window.ui.actions.UPGRADE_TOWER, { tw: ref });
      if (kind === 'tower' && sellBtn) sellBtn.onclick = () => window.ui.emit(window.ui.actions.SELL_TOWER, { tw: ref });
      if ((kind === 'hero' || kind === 'hero-dead') && upBtn) upBtn.onclick = () => window.ui.emit(window.ui.actions.UPGRADE_HERO, { h: ref });
      if ((kind === 'hero' || kind === 'hero-dead') && revBtn) revBtn.onclick = () => window.ui.emit(window.ui.actions.REVIVE_HERO, { h: ref, instant: true });
      if (kind === 'tower-tier3' && confirmBtn) confirmBtn.onclick = () => window.ui.emit(window.ui.actions.TIER3_UPGRADE, { tw: ref });
      if (kind === 'tower-tier3' && cancelBtn) cancelBtn.onclick = () => window.ui.emit(window.ui.actions.CANCEL_TIER3, {});
    }

    function hide(){
      if (!parent) return;
      parent.classList.remove('show');
      parent.innerHTML = '';
    }

    return {
      mount(parentEl){ parent = parentEl; },
      show,
      hide,
    };
  }

  if (typeof module !== 'undefined' && module.exports){
    module.exports = { createPopupPanel };
  } else {
    window.createPopupPanel = createPopupPanel;
  }
})();

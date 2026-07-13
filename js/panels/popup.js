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
      const CELL = window.CFG && window.CFG.CELL ? window.CFG.CELL : 50;

      // 1. 先把 popup 放到屏外, 强制同步取得真实尺寸 (offsetWidth 在 show 之后可能因 reflow 时序 = 0)
      //    兜底尺寸来自 CSS min-width/估算高度
      const pw = parent.offsetWidth  > 0 ? parent.offsetWidth  : 230;
      const ph = parent.offsetHeight > 0 ? parent.offsetHeight : 240;

      // 塔中心相对 canvas-area 的像素坐标
      const tcx = (c * CELL + CELL/2) * sx + (cr.left - ar.left);
      const tcy = (r * CELL + CELL/2) * sy + (cr.top  - ar.top);

      const gap = 8;          // popup 与塔的间距
      const PAD = 4;          // 边距 (popup 距 canvas-area 边不能更近)

      // ---- 横向: 默认在塔右侧, 右侧不够则翻左侧 ----
      let left = tcx + CELL/2 * sx + gap;
      if (left + pw > ar.width - PAD){
        left = tcx - CELL/2 * sx - gap - pw;
      }
      // 仍未满足 (corners): 贴画布边
      left = Math.max(PAD, Math.min(ar.width - pw - PAD, left));

      // ---- 纵向: 塔在屏幕下半区 → popup 向上; 上半区 → 向下 ----
      //   (用户原话: 点击位置在屏幕下半部分时, 菜单向上弹出而非向下)
      let top;
      if (tcy > ar.height / 2){
        // popup 弹出在塔上方 (避免向下溢出屏幕)
        top = tcy - CELL/2 * sy - gap - ph;
      } else {
        // popup 弹出在塔下方
        top = tcy + CELL/2 * sy + gap;
      }
      // 纵向 clamp (极端 case)
      top = Math.max(PAD, Math.min(ar.height - ph - PAD, top));

      parent.style.left = Math.round(left) + 'px';
      parent.style.top  = Math.round(top)  + 'px';
    }

    function show(kind, ref, opts){
      if (!parent) return;
      const g = window._gameRef || (window.ui && window.ui._gameRef);
      if (!g) return;
      opts = opts || {};
      let html = '';

      if (kind === 'tower') {
        const tw = ref;
        const realDps = Math.round(tw.damage / tw.fireInterval);
        const info = [
          { l: '单发伤害', v: tw.damage },
          { l: '攻击间隔', v: tw.fireInterval.toFixed(2) + 's' },
          { l: '实时 DPS', v: realDps },
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
      }

      parent.innerHTML = html;
      parent.classList.add('show');
      if (opts.r !== undefined && opts.c !== undefined) {
        // 先把 popup 移到屏外, 强制浏览器 layout 计算真实尺寸 (用于后续 positionPopup 内的兜底/精确布局)
        parent.style.left = '-9999px';
        parent.style.top  = '-9999px';
        positionPopup(opts.r, opts.c);
      }

      // Bind events via ui.emit
      const upBtn = parent.querySelector('.popup-upgrade');
      const sellBtn = parent.querySelector('.popup-sell');
      const revBtn = parent.querySelector('.popup-revive');
      if (kind === 'tower' && upBtn) upBtn.onclick = () => window.ui.emit(window.ui.actions.UPGRADE_TOWER, { tw: ref });
      if (kind === 'tower' && sellBtn) sellBtn.onclick = () => window.ui.emit(window.ui.actions.SELL_TOWER, { tw: ref });
      if ((kind === 'hero' || kind === 'hero-dead') && upBtn) upBtn.onclick = () => window.ui.emit(window.ui.actions.UPGRADE_HERO, { h: ref });
      if ((kind === 'hero' || kind === 'hero-dead') && revBtn) revBtn.onclick = () => window.ui.emit(window.ui.actions.REVIVE_HERO, { h: ref, instant: true });
    }

    function hide(){
      if (!parent) return;
      parent.classList.remove('show');
      parent.innerHTML = '';
    }

    return {
      mount(parentEl){
        parent = parentEl;
        // 鼠标移出弹窗 → 延迟关闭（防误触）
        let hideTimer = null;
        parent.addEventListener('mouseenter', () => {
          if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        });
        parent.addEventListener('mouseleave', () => {
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            if (!parent) return;
            parent.classList.remove('show');
            parent.innerHTML = '';
            hideTimer = null;
          }, 200);
        });
      },
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

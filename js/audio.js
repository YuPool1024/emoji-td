// js/audio.js —— 纯 Web Audio API 合成的音效系统（无需任何外部素材）
// 设计为明亮卡通风：短促、Q 弹、悦耳；不会盖过游戏节奏。
const SFX = (function(){
  let ctx = null;
  let muted = false;
  const master = 0.32;                 // 总音量（个体音量在此基础上缩放）

  // 读取本地静音偏好
  try { muted = localStorage.getItem('td_muted') === '1'; } catch(_) {}

  // 惰性创建 AudioContext；浏览器要求必须在用户交互后才能 resume
  function ensure(){
    if (!ctx){
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
      } catch(e){ return false; }
    }
    if (ctx.state === 'suspended' && ctx.resume){
      ctx.resume().catch(()=>{});
    }
    return true;
  }

  // 单音调：包络（attack → sustain → release），可选频率滑音
  function tone({freq, type='sine', dur=0.1, vol=0.2,
                 slideTo=null, attack=0.005, release=0.04}){
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null){
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    const peak = vol * master;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.01);
  }

  // 噪声爆发（白噪 + 衰减包络 + 可选滤波器）
  function noise({dur=0.1, vol=0.2, filterFreq=null, filterType='lowpass', q=1}){
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++){
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * master, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(gain).connect(ctx.destination);
    if (filterFreq){
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = filterFreq;
      f.Q.value = q;
      src.disconnect();
      src.connect(f).connect(gain);
    }
    src.start(t0);
  }

  // 和弦（同时多个音）
  function chord(freqs, opts){
    freqs.forEach(f => tone({freq: f, ...opts}));
  }
  // 序列（依次播放）
  function seq(freqs, gap, opts){
    freqs.forEach((f, i) => setTimeout(() => tone({freq: f, ...opts}), i * gap));
  }

  // ===================== 公开音效 =====================

  // 塔开火：每种塔一个独立音色
  function fire(type){
    switch(type){
      case 'arrow':    // 🏹 twang —— 下行锯齿 + 微噪声
        tone({freq:880, type:'sawtooth', dur:0.06, vol:0.18, slideTo: 380});
        noise({dur:0.04, vol:0.05, filterFreq:4000});
        break;
      case 'tesla':    // ⚡ zap —— 高频方波 + 噪声
        tone({freq:1100, type:'square', dur:0.07, vol:0.13, slideTo: 1400});
        noise({dur:0.06, vol:0.08, filterFreq:3500});
        break;
      case 'sniper':   // 🎯 pew —— 长下行 saw
        tone({freq:900, type:'sawtooth', dur:0.12, vol:0.2, slideTo: 220});
        noise({dur:0.05, vol:0.05, filterFreq:2500});
        break;
      case 'flame':    // 🔥 whoosh —— 带通噪声 + 低频锯齿
        noise({dur:0.18, vol:0.18, filterFreq:700, filterType:'bandpass'});
        tone({freq:120, type:'sawtooth', dur:0.1, vol:0.08, slideTo: 80});
        break;
      case 'frost':    // ❄️ shing —— 上行三角波
        tone({freq:1600, type:'triangle', dur:0.1, vol:0.18, slideTo: 2400});
        tone({freq:2400, type:'triangle', dur:0.08, vol:0.1,  slideTo: 3000});
        break;
      case 'cannon':   // 💣 boom —— 低音正弦 + 噪声爆点
        tone({freq:140, type:'sine', dur:0.18, vol:0.35, slideTo: 50});
        noise({dur:0.12, vol:0.22, filterFreq:500});
        break;
    }
  }

  function hit(){
    // 短促 tick（普通命中但没击杀）
    tone({freq:600, type:'square', dur:0.03, vol:0.1});
  }

  function kill(){
    // 上行"啵"
    tone({freq:520,  type:'sine',     dur:0.08, vol:0.18, slideTo: 1100});
    tone({freq:1040, type:'triangle', dur:0.06, vol:0.1});
  }

  function place(){
    // C 大三和弦
    chord([523, 659, 784], {type:'triangle', dur:0.12, vol:0.13});
  }

  function upgrade(){
    // 升序琶音（晶亮）
    seq([523, 659, 784, 1047], 55, {type:'triangle', dur:0.08, vol:0.14});
  }

  function sell(){
    // 收银机 cha-ching
    tone({freq:1200, type:'triangle', dur:0.06, vol:0.18});
    setTimeout(() => tone({freq:1600, type:'triangle', dur:0.1, vol:0.2}), 60);
    setTimeout(() => tone({freq:2000, type:'sine',     dur:0.08, vol:0.12}), 120);
  }

  function revive(){
    // 魔法上升音阶
    seq([400, 500, 630, 800, 1000], 60, {type:'sine', dur:0.09, vol:0.15});
  }

  function waveStart(){
    // 警报双音
    tone({freq:440, type:'square', dur:0.18, vol:0.18});
    setTimeout(() => tone({freq:330, type:'square', dur:0.25, vol:0.2}), 180);
  }

  function baseHit(){
    // 低沉冲击
    tone({freq:120, type:'sine', dur:0.22, vol:0.3, slideTo: 40});
    noise({dur:0.1, vol:0.12, filterFreq:250});
  }

  function win(){
    // 胜利号角
    seq([523, 659, 784, 1047, 1319], 100, {type:'triangle', dur:0.25, vol:0.2});
    setTimeout(() => chord([1047, 1319, 1568], {type:'sine', dur:0.45, vol:0.18}), 520);
  }

  function lose(){
    // 失败下行
    seq([392, 330, 262, 196], 180, {type:'sine', dur:0.3, vol:0.2});
  }

  function countdownTick(){
    tone({freq:880, type:'square', dur:0.04, vol:0.12});
  }

  function countdownGo(){
    chord([523, 1047], {type:'sine', dur:0.25, vol:0.18});
  }

  // ===================== 静音控制 =====================
  function setMuted(m){
    muted = !!m;
    try { localStorage.setItem('td_muted', muted ? '1' : '0'); } catch(_) {}
  }
  function isMuted(){ return muted; }
  function toggleMuted(){ setMuted(!muted); return muted; }

  return {
    fire, hit, kill, place, upgrade, sell, revive,
    waveStart, baseHit, win, lose,
    countdownTick, countdownGo,
    setMuted, isMuted, toggleMuted, ensure
  };
})();

if (typeof module !== 'undefined') module.exports = SFX;
else { window.SFX = SFX; }
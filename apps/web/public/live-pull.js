/*
 * ROOOT — LIVE PULL (coordinator lane: matchday -> one bar).
 *
 * When the schedule says a match is LIVE and this page isn't showing it, a slim
 * ink bar pins to the bottom: "● FRA–ENG IS LIVE — GET IN →". Appears and
 * disappears by itself off the one clock (matchday.js must load first). Without
 * it, a fan sitting in the sealed programme at kickoff has no path to the
 * match — the product's whole point, missing (owner-found gap, 18 Jul).
 */
(function () {
  'use strict';
  if (!window.__matchday) return;
  var q = new URLSearchParams(location.search);

  var css = document.createElement('style');
  css.textContent = '#livepull{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:center;gap:9px;' +
    'padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));background:#1A1815;color:#F3ECDB;text-decoration:none;' +
    "font-family:'Anybody','Arial Black',sans-serif;font-weight:900;font-size:11px;letter-spacing:.14em;box-shadow:0 -4px 18px rgba(26,24,21,.4)}" +
    '#livepull i{width:8px;height:8px;border-radius:50%;background:#C8202A;animation:lpulse 1.3s infinite}' +
    '#livepull b{color:#C79A38}' +
    '@keyframes lpulse{0%,100%{opacity:1}50%{opacity:.25}}' +
    '@media (prefers-reduced-motion:reduce){#livepull i{animation:none}}';
  document.head.appendChild(css);

  function mount(md) {
    var live = null;
    md.fixtures.forEach(function (f) { if (f.phase === 'LIVE' && !live) live = f; });
    var bar = document.getElementById('livepull');
    if (!live || q.get('match') === String(live.matchId)) {
      if (bar) { bar.remove(); document.body.style.paddingBottom = ''; }
      return;
    }
    if (!bar) {
      bar = document.createElement('a');
      bar.id = 'livepull';
      bar.innerHTML = '<i></i><span></span><b>GET IN →</b>';
      document.body.appendChild(bar);
      document.body.style.paddingBottom = '52px';   // the bar never buries a page's own bottom controls (the loom's COLLECT)
    }
    bar.href = 'gate.html?live=1&match=' + encodeURIComponent(live.matchId);
    bar.querySelector('span').textContent = live.home.code + '–' + live.away.code + ' IS LIVE';
  }
  window.__matchday.on(mount);
})();

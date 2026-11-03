/* «Типографика» в прежнем виде — сворачиваемые блоки «Штрихкод / QR код / Текст» с ползунками,
   но теперь каждый ползунок управляет тем же листом, что и превью, и печать.
   В «Тексте» под размером — Ж / К / Ч и выравнивание, как в Word.
   Значения — CSS-переменные --lt-* на <html>; сохраняются в браузере. */
(function () {
  'use strict';

  var KEY = 'lc-typo-v1';
  var DEF = {
    title: { b: 1, i: 0, u: 0, a: 'left', s: 1 },
    meta:  { b: 0, i: 0, u: 0, a: 'left', s: 1 },
    store: { b: 1, i: 0, u: 0, a: 'center', s: 1 },
    codes: { a: 'center' },
    bcW: 1, bcH: 1, qr: 1
  };
  var state = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    var st = clone(DEF);
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) Object.keys(st).forEach(function (k) {
        if (saved[k] == null) return;
        if (typeof st[k] === 'object') Object.keys(st[k]).forEach(function (kk) { if (saved[k][kk] != null) st[k][kk] = saved[k][kk]; });
        else st[k] = saved[k];
      });
    } catch (e) {}
    return st;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var ALIGN_FLEX = { left: 'flex-start', center: 'center', right: 'flex-end' };
  function apply() {
    var r = document.documentElement.style;
    ['title', 'meta', 'store'].forEach(function (k) {
      var t = state[k];
      r.setProperty('--lt-' + k + '-w', t.b ? '700' : '400');
      r.setProperty('--lt-' + k + '-i', t.i ? 'italic' : 'normal');
      r.setProperty('--lt-' + k + '-u', t.u ? 'underline' : 'none');
      r.setProperty('--lt-' + k + '-a', t.a);
      r.setProperty('--lt-' + k + '-j', ALIGN_FLEX[t.a]);
      r.setProperty('--lt-' + k + '-s', String(t.s));
    });
    r.setProperty('--lt-codes-j', ALIGN_FLEX[state.codes.a]);
    r.setProperty('--lt-bc-w', String(state.bcW));
    r.setProperty('--lt-bc-h', String(state.bcH));
    r.setProperty('--lt-qr', String(state.qr));
    if (window.__lcRefreshLive) window.__lcRefreshLive();
  }

  /* ── Ползунок — тот же вид и поведение, что у прежних ───────────── */
  var sliders = [];
  function slider(label, min, max, step, get, set) {
    var wrap = document.createElement('div');
    wrap.className = 'lt-item';
    var hdr = document.createElement('div'); hdr.className = 'flex items-center justify-between mb-2';
    var lbl = document.createElement('label'); lbl.className = 'text-xs text-muted-foreground'; lbl.textContent = label;
    var val = document.createElement('span'); val.className = 'text-[11px] font-mono text-foreground tabular-nums';
    hdr.appendChild(lbl); hdr.appendChild(val);
    var el = document.createElement('div'); el.className = 'lc-slider'; el.setAttribute('role', 'slider'); el.tabIndex = 0;
    el.setAttribute('aria-label', label); el.setAttribute('aria-valuemin', min); el.setAttribute('aria-valuemax', max);
    var track = document.createElement('div'); track.className = 'lc-track';
    var range = document.createElement('div'); range.className = 'lc-range';
    var thumb = document.createElement('div'); thumb.className = 'lc-thumb';
    track.appendChild(range); el.appendChild(track); el.appendChild(thumb);
    var ftr = document.createElement('div');
    ftr.className = 'flex items-center justify-between mt-1 text-[10px] text-muted-foreground font-mono';
    ftr.innerHTML = '<span>' + min.toFixed(1) + '×</span><span>' + max.toFixed(1) + '×</span>';
    wrap.appendChild(hdr); wrap.appendChild(el); wrap.appendChild(ftr); /* ftr скрывается прежним стилем, как у старых ползунков */

    function show(v) {
      var pct = (v - min) / (max - min) * 100;
      range.style.width = pct + '%';
      thumb.style.position = 'absolute'; thumb.style.left = 'calc(' + pct + '% - 10px)';
      val.textContent = v.toFixed(2) + '×';
      el.setAttribute('aria-valuenow', v);
    }
    function setVal(v, commit) {
      v = Math.min(max, Math.max(min, v));
      v = parseFloat((Math.round((v - min) / step) * step + min).toFixed(4));
      if (v === get()) { show(v); return; }
      set(v); show(v); apply();
      if (commit !== false) save();
    }
    function onMove(x) { var rc = track.getBoundingClientRect(); setVal(min + Math.max(0, Math.min(1, (x - rc.left) / rc.width)) * (max - min), false); }
    el.addEventListener('mousedown', function (e) {
      e.preventDefault(); onMove(e.clientX);
      function mm(e2) { onMove(e2.clientX); }
      function mu() { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); save(); }
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    });
    el.addEventListener('touchstart', function (e) {
      onMove(e.touches[0].clientX);
      function tm(e2) { onMove(e2.touches[0].clientX); }
      function te() { el.removeEventListener('touchmove', tm); el.removeEventListener('touchend', te); save(); }
      el.addEventListener('touchmove', tm, { passive: true }); el.addEventListener('touchend', te);
    }, { passive: true });
    el.addEventListener('keydown', function (e) {
      var d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, Home: -99, End: 99 }[e.key];
      if (d !== undefined) { e.preventDefault(); setVal(get() + d); }
    });
    show(get());
    sliders.push(function () { show(get()); });
    return wrap;
  }

  /* ── Мини-панель Ж / К / Ч и выравнивание (стиль кнопок — как у прежних элементов) ── */
  function ico(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var AL = {
    left: ico('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    center: ico('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    right: ico('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>')
  };
  var ALN = { left: 'по левому краю', center: 'по центру', right: 'по правому краю' };
  var toolbars = [];
  function tools(key, label, withFont) {
    var box = document.createElement('div');
    box.className = 'lt-panel lt-inline';
    box.innerHTML = (withFont ?
      '<span class="lt-seg">' +
        '<button type="button" class="lt-btn" data-f="b" title="' + label + ': жирный"><b>Ж</b></button>' +
        '<button type="button" class="lt-btn" data-f="i" title="' + label + ': курсив"><i>К</i></button>' +
        '<button type="button" class="lt-btn" data-f="u" title="' + label + ': подчёркнутый"><u>Ч</u></button>' +
      '</span>' : '') +
      '<span class="lt-seg">' + ['left', 'center', 'right'].map(function (a) {
        return '<button type="button" class="lt-btn" data-a="' + a + '" title="' + label + ': ' + ALN[a] + '">' + AL[a] + '</button>';
      }).join('') + '</span>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-f')) { var f = b.getAttribute('data-f'); state[key][f] = state[key][f] ? 0 : 1; }
      else state[key].a = b.getAttribute('data-a');
      save(); apply(); paint();
    });
    toolbars.push({ key: key, box: box });
    return box;
  }
  function paint() {
    toolbars.forEach(function (t) {
      var st = state[t.key];
      Array.from(t.box.querySelectorAll('[data-f]')).forEach(function (b) { var on = !!st[b.getAttribute('data-f')]; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      Array.from(t.box.querySelectorAll('[data-a]')).forEach(function (b) { var on = st.a === b.getAttribute('data-a'); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    });
    sliders.forEach(function (f) { f(); });
  }
  function textBlock(key, label, sliderLabel) {
    var w = slider(sliderLabel, 0.6, 5, 0.05, function () { return state[key].s; }, function (v) { state[key].s = v; });
    w.insertBefore(tools(key, label, true), w.lastChild); /* перед скрытой строкой min/max */
    return w;
  }

  /* ── Встраивание в прежние блоки «Штрихкод / QR код / Текст» ─────── */
  var done = false;
  function inject() {
    if (done) return;
    var gB = document.querySelector('.lc-group-barcode > .lc-group-body');
    var gQ = document.querySelector('.lc-group-qr > .lc-group-body');
    var gT = document.querySelector('.lc-group-text > .lc-group-body');
    var safe = document.querySelector('[data-testid="slider-safe-margin"]');
    if (!gB || !gQ || !gT || !safe) return;
    done = true;

    /* прежние ползунки были привязаны к старой раскладке и ничего не меняли — прячем,
       «Безопасный отступ» оставляем (он работает) */
    var safeRow = safe; while (safeRow.parentElement && safeRow.parentElement !== gT) safeRow = safeRow.parentElement;
    [gB, gQ, gT].forEach(function (body) {
      Array.from(body.children).forEach(function (ch) { if (ch !== safeRow) ch.classList.add('lt-old'); });
    });

    gB.appendChild(slider('Штрих ширина', 0.4, 1, 0.02, function () { return state.bcW; }, function (v) { state.bcW = v; }));
    gB.appendChild(slider('Штрих высота', 0.5, 1.6, 0.02, function () { return state.bcH; }, function (v) { state.bcH = v; }));

    gQ.appendChild(slider('QR размер', 0.5, 1.4, 0.02, function () { return state.qr; }, function (v) { state.qr = v; }));

    var codes = document.createElement('div'); codes.className = 'lt-item';
    codes.innerHTML = '<div class="flex items-center justify-between mb-2"><label class="text-xs text-muted-foreground">Расположение кодов</label></div>';
    codes.appendChild(tools('codes', 'Коды', false));

    gT.insertBefore(textBlock('title', 'Название', 'Размер названия'), safeRow);
    gT.insertBefore(textBlock('meta', 'Инв и S/N', 'Размер Инв / S/N'), safeRow);
    gT.insertBefore(textBlock('store', 'Магазин', 'Размер магазина / логотипа'), safeRow);
    gT.insertBefore(codes, safeRow);

    var reset = document.createElement('div'); reset.className = 'lt-foot';
    reset.innerHTML = '<button type="button" class="lt-reset">Сбросить оформление</button>';
    reset.querySelector('button').addEventListener('click', resetAll);
    gT.appendChild(reset);

    paint();
  }
  /* Полный сброс оформления: всё к исходному виду, сохранённое в браузере стирается */
  function resetAll() {
    state = clone(DEF);
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (window.__lcSetLogoScale) window.__lcSetLogoScale(1);
    apply(); paint();
  }
  window.__lcTypoReset = resetAll;
  /* «Сбросить настройки макета» тоже сбрасывает оформление текста и кодов */
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-testid="button-reset"]')) setTimeout(resetAll, 0);
  }, true);

  new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
  apply(); inject();
}());

/* «Типографика» для этикетки — как в Word: жирный / курсив / подчёркнутый, выравнивание и размер
   для названия, Инв/S/N и магазина; ширина/высота штрихкода, размер QR, выравнивание кодов.
   Управляет тем же листом, что и превью, и печать (через CSS-переменные --lt-* на <html>). */
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
  var LIMITS = { s: [0.6, 1.8], bcW: [0.4, 1], bcH: [0.5, 1.6], qr: [0.5, 1.4] };
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
    render();
  }

  /* ── Панель ────────────────────────────────────────────────────── */
  var panel = null;
  function ico(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var AL = {
    left: ico('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    center: ico('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    right: ico('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>')
  };
  var ALN = { left: 'по левому краю', center: 'по центру', right: 'по правому краю' };
  function textRow(key, label) {
    return '<div class="lt-row" data-key="' + key + '">' +
      '<div class="lt-name">' + label + '</div>' +
      '<div class="lt-tools">' +
        '<span class="lt-seg">' +
          '<button type="button" class="lt-btn lt-b" data-f="b" title="Жирный"><b>Ж</b></button>' +
          '<button type="button" class="lt-btn lt-i" data-f="i" title="Курсив"><i>К</i></button>' +
          '<button type="button" class="lt-btn lt-u" data-f="u" title="Подчёркнутый"><u>Ч</u></button>' +
        '</span>' +
        '<span class="lt-seg">' + ['left', 'center', 'right'].map(function (a) { return '<button type="button" class="lt-btn" data-a="' + a + '" title="' + label + ': ' + ALN[a] + '">' + AL[a] + '</button>'; }).join('') + '</span>' +
        '<span class="lt-seg lt-size">' +
          '<button type="button" class="lt-btn" data-step="-1" data-v="s" title="Меньше">−</button>' +
          '<span class="lt-val" data-v="s"></span>' +
          '<button type="button" class="lt-btn" data-step="1" data-v="s" title="Больше">+</button>' +
        '</span>' +
      '</div></div>';
  }
  function numRow(key, label, hint) {
    return '<div class="lt-row" data-key="' + key + '">' +
      '<div class="lt-name">' + label + (hint ? '<small>' + hint + '</small>' : '') + '</div>' +
      '<div class="lt-tools"><span class="lt-seg lt-size">' +
        '<button type="button" class="lt-btn" data-step="-1" data-v="' + key + '" title="Меньше">−</button>' +
        '<span class="lt-val" data-v="' + key + '"></span>' +
        '<button type="button" class="lt-btn" data-step="1" data-v="' + key + '" title="Больше">+</button>' +
      '</span></div></div>';
  }
  function build(container) {
    panel = document.createElement('div');
    panel.className = 'lt-panel';
    panel.setAttribute('data-testid', 'typo-panel');
    panel.innerHTML =
      '<div class="lt-head">Текст на этикетке</div>' +
      textRow('title', 'Название') + textRow('meta', 'Инв и S/N') + textRow('store', 'Магазин / логотип') +
      '<div class="lt-head">Коды</div>' +
      '<div class="lt-row" data-key="codes"><div class="lt-name">Расположение</div><div class="lt-tools"><span class="lt-seg">' +
        ['left', 'center', 'right'].map(function (a) { return '<button type="button" class="lt-btn" data-a="' + a + '" title="Коды ' + ALN[a] + '">' + AL[a] + '</button>'; }).join('') +
      '</span></div></div>' +
      numRow('bcW', 'Штрихкод — ширина', 'полоски кратны точке принтера') +
      numRow('bcH', 'Штрихкод — высота') +
      numRow('qr', 'QR — размер') +
      '<div class="lt-foot"><button type="button" class="lt-reset">Сбросить оформление</button></div>';
    container.insertBefore(panel, container.firstChild);
    panel.addEventListener('click', onClick);
    render();
  }
  function step(key, dir, sub) {
    var lim = LIMITS[sub ? 's' : key], cur = sub ? state[key].s : state[key];
    var next = Math.round((cur + dir * 0.1) * 100) / 100;
    next = Math.max(lim[0], Math.min(lim[1], next));
    if (sub) state[key].s = next; else state[key] = next;
  }
  function onClick(e) {
    var b = e.target.closest('button'); if (!b || !panel.contains(b)) return;
    if (b.classList.contains('lt-reset')) { state = clone(DEF); save(); apply(); return; }
    var row = b.closest('.lt-row'), key = row && row.getAttribute('data-key'); if (!key) return;
    if (b.hasAttribute('data-f')) { var f = b.getAttribute('data-f'); state[key][f] = state[key][f] ? 0 : 1; }
    else if (b.hasAttribute('data-a')) state[key].a = b.getAttribute('data-a');
    else if (b.hasAttribute('data-step')) step(key, +b.getAttribute('data-step'), b.getAttribute('data-v') === 's');
    save(); apply();
  }
  function render() {
    if (!panel) return;
    Array.from(panel.querySelectorAll('.lt-row')).forEach(function (row) {
      var key = row.getAttribute('data-key'), st = state[key];
      Array.from(row.querySelectorAll('[data-f]')).forEach(function (b) { var on = !!st[b.getAttribute('data-f')]; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      Array.from(row.querySelectorAll('[data-a]')).forEach(function (b) { var on = st.a === b.getAttribute('data-a'); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      Array.from(row.querySelectorAll('.lt-val')).forEach(function (v) {
        var val = v.getAttribute('data-v') === 's' ? st.s : st;
        v.textContent = Math.round(val * 100) + '%';
      });
      Array.from(row.querySelectorAll('[data-step]')).forEach(function (b) {
        var sub = b.getAttribute('data-v') === 's', lim = LIMITS[sub ? 's' : key], val = sub ? st.s : st, dir = +b.getAttribute('data-step');
        b.disabled = dir < 0 ? val <= lim[0] + 1e-9 : val >= lim[1] - 1e-9;
      });
    });
  }

  /* Встраиваем в карточку «Типографика»: старые слайдеры (к старой раскладке) прячем,
     «Безопасный отступ» и «Показывать safe zone» оставляем — они работают. */
  function inject() {
    if (panel && document.body.contains(panel)) return;
    var safe = document.querySelector('[data-testid="slider-safe-margin"]');
    var group = document.querySelector('.lc-group-text');
    if (!safe || !group) return;
    var container = group.parentElement;
    var safeRow = safe; while (safeRow.parentElement && safeRow.parentElement !== group.querySelector('.lc-group-body')) safeRow = safeRow.parentElement;
    build(container);
    if (safeRow && safeRow.parentElement) { safeRow.classList.add('lt-safe-row'); container.insertBefore(safeRow, panel.nextSibling); }
    container.classList.add('lt-container');
  }
  new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
  apply(); inject();
}());

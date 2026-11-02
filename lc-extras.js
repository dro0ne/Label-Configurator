/* Дополнения интерфейса:
   1) иконки у групп «Типографики», слайдеров и переключателей «что печатать» — чтобы не вчитываться;
   2) логотипы вместо текста на кнопках магазинов;
   3) счётчик напечатанных этикеток (сегодня / всего). */
(function () {
  'use strict';

  /* ── Иконки (stroke = currentColor) ─────────────────────────────── */
  var I = {
    barcode: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14" stroke-width="2"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    hash: '<path d="M9 4 7 20M17 4l-2 16M5 9h15M4 15h15"/>',
    serial: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h2M7 14h4M13 10h4M14 14h3"/>',
    store: '<path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>',
    width: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
    height: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    shift: '<path d="M4 9h13M13 5l4 4-4 4M20 15H7M11 11l-4 4 4 4"/>',
    size: '<path d="M4 20 10 4h1l6 16M6.5 14h8M17 9h4M19 7v4"/>',
    gap: '<path d="M4 5h16M4 19h16M12 8v8M9 10l3-2 3 2M9 14l3 2 3-2"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    printer: '<path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z"/>'
  };
  function icon(name, cls) {
    return '<svg class="lc-ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[name] + '</svg>';
  }
  function prependIcon(el, name) {
    if (!el || el.querySelector(':scope > .lc-ico')) return;
    el.insertAdjacentHTML('afterbegin', icon(name));
    el.classList.add('lc-has-ico');
  }

  var SWITCH_ICONS = {
    'switch-title': 'text', 'switch-inventory-text': 'hash', 'switch-serial-text': 'serial',
    'switch-store': 'store', 'switch-barcode': 'barcode', 'switch-qr': 'qr', 'switch-safezone': 'shield'
  };
  var GROUP_ICONS = { 'lc-group-barcode': 'barcode', 'lc-group-qr': 'qr', 'lc-group-text': 'text' };
  function sliderIcon(text) {
    var t = text.toLowerCase();
    if (t.indexOf('ширина') !== -1) return 'width';
    if (t.indexOf('высота') !== -1) return 'height';
    if (t.indexOf('сдвиг') !== -1) return 'shift';
    if (t.indexOf('интервал') !== -1) return 'gap';
    if (t.indexOf('отступ') !== -1) return 'shield';
    if (t.indexOf('размер') !== -1) return 'size';
    return null;
  }

  var LOGOS = {
    'Перекрёсток': './perekrestok-logo.svg',
    'Пятёрочка': './pyaterochka-horizontal-logo.svg',
    'Чижик': './chizhik-horizontal-logo.svg'
  };

  function decorate() {
    Object.keys(SWITCH_ICONS).forEach(function (id) {
      var sw = document.querySelector('[data-testid="' + id + '"]');
      if (!sw || !sw.parentElement) return;
      var label = sw.parentElement.querySelector(':scope > span, :scope > label, :scope > div > span');
      if (label && label !== sw) prependIcon(label, SWITCH_ICONS[id]);
    });
    Object.keys(GROUP_ICONS).forEach(function (cls) {
      var hdr = document.querySelector('.' + cls + ' > .lc-group-header');
      if (hdr && !hdr.querySelector('.lc-ico')) {
        hdr.insertAdjacentHTML('afterbegin', icon(GROUP_ICONS[cls], 'lc-group-ico'));
        hdr.classList.add('lc-hdr-ico');
      }
    });
    document.querySelectorAll('.lc-group-body label').forEach(function (label) {
      var name = sliderIcon(label.textContent);
      if (name) prependIcon(label, name);
    });
    document.querySelectorAll('[data-testid="store-tags-row"] button[data-logo]').forEach(function (btn) {
      var name = btn.getAttribute('data-logo');
      if (!LOGOS[name] || btn.querySelector('img')) return;
      btn.textContent = '';
      var img = document.createElement('img');
      img.src = LOGOS[name]; img.alt = name; img.className = 'lc-chip-logo';
      btn.appendChild(img);
      btn.title = name; btn.setAttribute('aria-label', name);
      btn.classList.add('lc-logo-chip');
    });
    var batchBtn = document.querySelector('[data-testid="button-batch-print"]');
    if (batchBtn && !batchBtn.querySelector('.lc-ico')) {
      var old = batchBtn.querySelector('svg'); if (old) old.remove();
      batchBtn.insertAdjacentHTML('afterbegin', icon('list'));
    }
    injectCounter();
    injectThemeToggle();
  }

  /* ── Светлая / тёмная тема ──────────────────────────────────────── */
  var themeBtn = null;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function savedTheme() { try { return localStorage.getItem('lc-theme'); } catch (e) { return null; } }
  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  function applyTheme(saved) {
    var dark = saved ? saved === 'dark' : !!(mq && mq.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var link = document.getElementById('theme-dark');
    if (link) link.media = saved ? (dark ? 'all' : 'not all') : '(prefers-color-scheme: dark)';
    renderThemeBtn();
  }
  function renderThemeBtn() {
    if (!themeBtn) return;
    var dark = isDark();
    themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
    var label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    themeBtn.title = label; themeBtn.setAttribute('aria-label', label);
  }
  function injectThemeToggle() {
    if (themeBtn && document.body.contains(themeBtn)) return;
    var anchor = counterEl && document.body.contains(counterEl) ? counterEl : document.querySelector('[data-testid="badge-size"]');
    if (!anchor || !anchor.parentElement) return;
    themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'lc-theme-toggle';
    themeBtn.setAttribute('data-testid', 'button-theme');
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      try { localStorage.setItem('lc-theme', next); } catch (e) {}
      applyTheme(next);
    });
    anchor.parentElement.insertBefore(themeBtn, anchor);
    renderThemeBtn();
  }
  if (mq) {
    var onSystem = function () { if (!savedTheme()) applyTheme(null); };
    if (mq.addEventListener) mq.addEventListener('change', onSystem); else if (mq.addListener) mq.addListener(onSystem);
  }

  /* ── Счётчик печати ─────────────────────────────────────────────── */
  var KEY = 'lc-print-counter-v1';
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function load() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { c = null; }
    if (!c || typeof c.total !== 'number') c = { day: today(), today: 0, total: 0 };
    if (c.day !== today()) { c.day = today(); c.today = 0; }
    return c;
  }
  var counter = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(counter)); } catch (e) { /* приватный режим — считаем только в памяти */ } }

  var counterEl = null;
  function injectCounter() {
    if (counterEl && document.body.contains(counterEl)) return;
    var badge = document.querySelector('[data-testid="badge-size"]');
    if (!badge || !badge.parentElement) return;
    counterEl = document.createElement('button');
    counterEl.type = 'button';
    counterEl.className = 'lc-print-counter';
    counterEl.setAttribute('data-testid', 'print-counter');
    counterEl.addEventListener('click', function () {
      if (confirm('Сбросить счётчик за сегодня (' + counter.today + ')?\n«Всего» (' + counter.total + ') останется.')) {
        counter.today = 0; save(); render();
      }
    });
    badge.parentElement.insertBefore(counterEl, badge);
    render();
  }
  function plural(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'этикетка';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'этикетки';
    return 'этикеток';
  }
  function render(bump) {
    if (!counterEl) return;
    counterEl.innerHTML = icon('printer') + '<span class="lc-pc-today">' + counter.today + '</span><span class="lc-pc-label">сегодня</span>';
    counterEl.title = 'Отправлено на печать сегодня: ' + counter.today + ', всего: ' + counter.total + '.\nНажмите, чтобы сбросить счётчик за сегодня.';
    if (bump) { counterEl.classList.remove('lc-bump'); void counterEl.offsetWidth; counterEl.classList.add('lc-bump'); }
  }

  var toastEl = null, toastTimer = null;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'lc-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = icon('printer') + '<span></span>';
    toastEl.querySelector('span').textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3500);
  }

  /* Браузер не сообщает, сколько реально вышло из принтера, поэтому считаем,
     сколько этикеток отправлено в диалог печати (одиночная = 1, список = число строк). */
  var pending = 0;
  window.addEventListener('beforeprint', function () {
    var batch = document.querySelector('body.lc-batch-printing #print-batch-root');
    pending = batch ? batch.querySelectorAll('.lc-print-label').length : 1;
  });
  window.addEventListener('afterprint', function () {
    if (!pending) return;
    counter = load();
    counter.today += pending; counter.total += pending; save(); render(true);
    toast('Отправлено на печать: ' + pending + ' ' + plural(pending) + ' · сегодня ' + counter.today);
    pending = 0;
  });

  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  decorate();
}());

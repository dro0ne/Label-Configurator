/* Лист A4 «как в Word»: свободный текст, выравнивание, логотипы, штрихкод, QR.
   Открывается кнопкой «A4» в блоке размеров. Документ автосохраняется в браузере. */
(function () {
  'use strict';

  var KEY = 'lc-a4-doc-v1';
  var LOGOS = {
    'Пятёрочка': './pyaterochka-logo.svg',
    'Перекрёсток': './perekrestok-logo.svg',
    'Чижик': './chizhik-horizontal-logo.svg'
  };
  var LIBS = {
    barcode: 'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
    qr: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
  };

  var root = null, page = null, savedRange = null, selectedObj = null, objBar = null, saveTimer = null;

  /* ── Утилиты ───────────────────────────────────────────────────── */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Не удалось загрузить ' + src)); };
      document.head.appendChild(s);
    });
  }
  function libs() { return Promise.all([loadScript(LIBS.barcode), loadScript(LIBS.qr)]); }
  function field(name) { var el = document.querySelector('[data-testid="input-' + name + '"]'); return el ? el.value.trim() : ''; }
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function ico(path) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'; }

  /* ── Объекты на листе (логотип, штрихкод, QR, картинка) ─────────── */
  function barcodeSvg(value) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      if (!window.JsBarcode) return null;
      window.JsBarcode(svg, value, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 16, margin: 10, font: 'monospace' });
    } catch (e) { return null; }
    svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('shape-rendering', 'crispEdges');
    return svg.outerHTML;
  }
  function qrSvg(value) {
    if (!window.qrcode) return null;
    var q = window.qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(value))); q.make();
    var n = q.getModuleCount(), m = 4, size = n + m * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges"><rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  function objHtml(kind, value, widthMm, role) {
    var inner = '';
    if (kind === 'logo') inner = '<img src="' + LOGOS[value] + '" alt="' + esc(value) + '">';
    else if (kind === 'barcode') inner = barcodeSvg(value);
    else if (kind === 'qr') inner = qrSvg(value);
    else if (kind === 'image') inner = '<img src="' + value + '" alt="">';
    if (!inner) return '';
    return '<span class="a4-obj a4-obj-' + kind + '" contenteditable="false"' + (role ? ' data-role="' + role + '"' : '') + ' data-kind="' + kind + '" data-value="' + esc(kind === 'image' ? '' : value) + '" style="width:' + widthMm + 'mm">' + inner + '</span>';
  }

  /* ── Вставка в место курсора ───────────────────────────────────── */
  function rememberSelection() {
    var sel = window.getSelection();
    if (sel.rangeCount && page.contains(sel.getRangeAt(0).commonAncestorContainer)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    page.focus();
    var sel = window.getSelection();
    if (savedRange) { sel.removeAllRanges(); sel.addRange(savedRange); }
    else { var r = document.createRange(); r.selectNodeContents(page); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  function insertHtml(html) {
    if (!html) return;
    restoreSelection();
    document.execCommand('insertHTML', false, html + '&#8203;');
    rememberSelection(); scheduleSave();
  }
  function cmd(name, value) { restoreSelection(); document.execCommand(name, false, value || null); rememberSelection(); scheduleSave(); updateToolbar(); }

  function setFontSize(pt) {
    restoreSelection();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    var made = [];
    Array.from(page.querySelectorAll('font[size="7"]')).forEach(function (f) {
      var sp = document.createElement('span'); sp.style.fontSize = pt + 'pt'; sp.innerHTML = f.innerHTML; f.replaceWith(sp); made.push(sp);
    });
    if (made.length) { /* оставить выделение, чтобы дальше можно было нажать Ж/К/Ч */
      var r = document.createRange(); r.setStartBefore(made[0]); r.setEndAfter(made[made.length - 1]);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    rememberSelection(); scheduleSave();
  }

  /* ── Элементы листа, которые включаются/выключаются кнопками ─────
     Порядок на листе: название → Инв → S/N → коды (штрихкод, QR) → логотип. */
  var ORDER = ['title', 'inv', 'sn', 'codes', 'logo'];
  var SPACER = '&nbsp;&nbsp;&nbsp;';

  function currentLogo() {
    var store = field('store');
    return window.__lcActiveLogo || (LOGOS[store] ? store : null);
  }
  function askValue(text, def) {
    if (def) return def;
    var v = window.prompt(text, '');
    return v && v.trim() ? v.trim() : '';
  }
  function roleBlock(role, logoName) {
    var t, v;
    if (role === 'title') {
      t = field('title') || 'Название оборудования';
      return '<p data-role="title" style="text-align:center"><span style="font-size:28pt"><b>' + esc(t) + '</b></span></p>';
    }
    if (role === 'inv') {
      v = askValue('Инвентарный номер:', field('inventory')); if (!v) return '';
      return '<p data-role="inv" style="text-align:center"><span style="font-size:16pt"><b>Инв:</b> ' + esc(v) + '</span></p>';
    }
    if (role === 'sn') {
      v = askValue('Серийный номер (S/N):', field('serial')); if (!v) return '';
      return '<p data-role="sn" style="text-align:center"><span style="font-size:16pt"><b>S/N:</b> ' + esc(v) + '</span></p>';
    }
    if (role === 'codes') return '<p data-role="codes" style="text-align:center"></p>';
    if (role === 'logo') {
      var name = logoName || currentLogo(); if (!name) return '';
      return '<p data-role="logo" style="text-align:center">' + objHtml('logo', name, 80, 'logo') + '</p>';
    }
    return '';
  }
  function codeObj(role) {
    if (role === 'barcode') { var inv = askValue('Значение штрихкода (инвентарный номер):', field('inventory')); return inv ? objHtml('barcode', inv, 90, 'barcode') : ''; }
    var sn = askValue('Что зашить в QR (S/N, ссылку, текст):', field('serial') || field('inventory')); return sn ? objHtml('qr', sn, 45, 'qr') : '';
  }

  function labelBlockHtml() {
    var h = roleBlock('title');
    if (field('inventory')) h += roleBlock('inv');
    if (field('serial')) h += roleBlock('sn');
    var codes = [];
    if (field('inventory')) codes.push(objHtml('barcode', field('inventory'), 90, 'barcode'));
    if (field('serial')) codes.push(objHtml('qr', field('serial'), 45, 'qr'));
    if (codes.length) h += '<p data-role="codes" style="text-align:center">' + codes.join(SPACER) + '</p>';
    if (currentLogo()) h += roleBlock('logo');
    else if (field('store')) h += '<p style="text-align:center"><span style="font-size:20pt"><b>' + esc(field('store')) + '</b></span></p>';
    return h + '<p><br></p>';
  }

  function findRole(role) { return page.querySelector('[data-role="' + role + '"]'); }
  function blockOf(el) { while (el && el.parentNode !== page) el = el.parentNode; return el; }
  function placeBlock(role, html) {
    var tmp = document.createElement('div'); tmp.innerHTML = html;
    var node = tmp.firstElementChild; if (!node) return null;
    var idx = ORDER.indexOf(role), ref = null;
    for (var i = idx + 1; i < ORDER.length && !ref; i++) ref = blockOf(findRole(ORDER[i]));
    if (ref) page.insertBefore(node, ref);
    else {
      var prev = null;
      for (var j = idx - 1; j >= 0 && !prev; j--) prev = blockOf(findRole(ORDER[j]));
      if (prev) page.insertBefore(node, prev.nextSibling);
      else page.insertBefore(node, page.firstChild);
    }
    return node;
  }
  /* Пересобрать строку кодов: штрихкод, затем QR, через пробелы; пустую — убрать */
  function tidyCodes() {
    var p = page.querySelector('[data-role="codes"]'); if (!p) return;
    var objs = ['barcode', 'qr'].map(function (r) { return p.querySelector('[data-role="' + r + '"]'); }).filter(Boolean);
    if (!objs.length) { p.remove(); return; }
    p.innerHTML = '';
    objs.forEach(function (o, i) { if (i) p.insertAdjacentHTML('beforeend', SPACER); p.appendChild(o); });
  }
  function toggleRole(role, logoName) {
    selectObj(null);
    if (role === 'barcode' || role === 'qr') {
      var have = page.querySelector('[data-role="' + role + '"]');
      if (have) { have.remove(); tidyCodes(); }
      else {
        var html = codeObj(role); if (!html) return;
        var row = page.querySelector('[data-role="codes"]') || placeBlock('codes', roleBlock('codes'));
        row.insertAdjacentHTML(role === 'barcode' ? 'afterbegin' : 'beforeend', html);
        tidyCodes();
      }
    } else if (role === 'logo') {
      var cur = page.querySelector('.a4-obj[data-role="logo"]');
      var curName = cur && cur.getAttribute('data-value');
      Array.from(page.querySelectorAll('[data-role="logo"]')).forEach(function (n) {
        var blk = n.parentNode === page ? n : blockOf(n);
        if (blk && blk.parentNode === page) blk.remove();
      });
      if (curName !== logoName) {
        var w = cur ? parseFloat(cur.style.width) : 0;
        var node = placeBlock('logo', roleBlock('logo', logoName));
        if (node && w) node.querySelector('.a4-obj').style.width = w + 'mm';
      }
    } else {
      var ex = page.querySelectorAll('[data-role="' + role + '"]');
      if (ex.length) Array.from(ex).forEach(function (n) { n.remove(); });
      else { var h = roleBlock(role); if (h) placeBlock(role, h); }
    }
    if (!page.firstChild) page.innerHTML = '<p><br></p>';
    savedRange = null; scheduleSave(); updateToolbar();
  }

  /* Документы из прошлой версии: проставить роли знакомым элементам */
  function migrate() {
    if (page.querySelector('[data-role]')) return;
    var first = function (sel) { return page.querySelector(sel); };
    var bc = first('.a4-obj[data-kind="barcode"]'), qr = first('.a4-obj[data-kind="qr"]'), lg = first('.a4-obj[data-kind="logo"]');
    if (bc) bc.setAttribute('data-role', 'barcode');
    if (qr) qr.setAttribute('data-role', 'qr');
    if (bc || qr) blockOf(bc || qr).setAttribute('data-role', 'codes');
    if (lg && !blockOf(lg).hasAttribute('data-role')) { lg.setAttribute('data-role', 'logo'); blockOf(lg).setAttribute('data-role', 'logo'); }
    Array.from(page.children).forEach(function (p, i) {
      if (p.hasAttribute('data-role')) return;
      var t = p.textContent.trim();
      if (/^Инв:/.test(t)) p.setAttribute('data-role', 'inv');
      else if (/^S\/N:/.test(t)) p.setAttribute('data-role', 'sn');
      else if (i === 0 && t) p.setAttribute('data-role', 'title');
    });
  }

  /* ── Ориентация ────────────────────────────────────────────────── */
  var ORIENT_KEY = 'lc-a4-orient';
  function landscape() { return page.classList.contains('is-landscape'); }
  function setOrientation(o, save) {
    page.classList.toggle('is-landscape', o === 'landscape');
    if (save) { try { localStorage.setItem(ORIENT_KEY, o); } catch (e) {} }
    updateToolbar(); fitZoom();
  }

  /* ── Выделение объекта и его панель (размер / изменить / удалить) ── */
  function selectObj(obj) {
    if (selectedObj) selectedObj.classList.remove('is-selected');
    selectedObj = obj;
    if (!obj) { objBar.hidden = true; return; }
    obj.classList.add('is-selected');
    var kind = obj.getAttribute('data-kind');
    objBar.querySelector('[data-act="edit"]').hidden = !(kind === 'barcode' || kind === 'qr');
    objBar.hidden = false; placeObjBar();
  }
  function placeObjBar() {
    if (!selectedObj || objBar.hidden) return;
    var r = selectedObj.getBoundingClientRect(), wrap = root.querySelector('.a4-scroll').getBoundingClientRect();
    var sc = root.querySelector('.a4-scroll');
    objBar.style.left = Math.max(8, r.left - wrap.left + sc.scrollLeft) + 'px';
    objBar.style.top = Math.max(4, r.top - wrap.top + sc.scrollTop - 46) + 'px';
  }
  function objAction(act) {
    if (!selectedObj) return;
    var w = parseFloat(selectedObj.style.width) || 50;
    if (act === 'bigger') selectedObj.style.width = Math.min(190, w * 1.15).toFixed(1) + 'mm';
    if (act === 'smaller') selectedObj.style.width = Math.max(10, w / 1.15).toFixed(1) + 'mm';
    if (act === 'delete') { var wasLogo = selectedObj.getAttribute('data-role') === 'logo' && blockOf(selectedObj); selectedObj.remove(); selectObj(null); if (wasLogo && !wasLogo.textContent.trim() && !wasLogo.querySelector('.a4-obj')) wasLogo.remove(); tidyCodes(); updateToolbar(); }
    if (act === 'edit') {
      var kind = selectedObj.getAttribute('data-kind'), old = selectedObj.getAttribute('data-value');
      var v = window.prompt(kind === 'qr' ? 'Что зашить в QR:' : 'Значение штрихкода:', old);
      if (v && v.trim()) {
        var tmp = document.createElement('div'); tmp.innerHTML = objHtml(kind, v.trim(), w, selectedObj.getAttribute('data-role'));
        if (tmp.firstChild) { selectedObj.replaceWith(tmp.firstChild); selectObj(null); }
      }
    }
    scheduleSave(); placeObjBar();
  }

  /* ── Сохранение ────────────────────────────────────────────────── */
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, page.innerHTML); root.querySelector('.a4-saved').textContent = 'Сохранено'; } catch (e) { root.querySelector('.a4-saved').textContent = 'Не сохраняется (приватный режим)'; }
    }, 400);
    var s = root && root.querySelector('.a4-saved'); if (s) s.textContent = 'Изменено…';
  }
  function loadDoc() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  /* ── Состояние кнопок форматирования ───────────────────────────── */
  function updateToolbar() {
    if (!root) return;
    Array.from(root.querySelectorAll('[data-role-btn]')).forEach(function (b) {
      var on = !!page.querySelector('[data-role="' + b.getAttribute('data-role-btn') + '"]');
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var lg = page.querySelector('.a4-obj[data-role="logo"]'), lgName = lg && lg.getAttribute('data-value');
    Array.from(root.querySelectorAll('.a4-logo-btn')).forEach(function (b) {
      var on = b.getAttribute('data-logo') === lgName;
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    Array.from(root.querySelectorAll('[data-orient]')).forEach(function (b) {
      var on = (b.getAttribute('data-orient') === 'landscape') === landscape();
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertUnorderedList'].forEach(function (c) {
      var b = root.querySelector('[data-cmd="' + c + '"]'); if (!b) return;
      var on = false; try { on = document.queryCommandState(c); } catch (e) {}
      b.classList.toggle('is-on', !!on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ── Масштаб листа под ширину экрана ───────────────────────────── */
  function fitZoom() {
    if (!root) return;
    var sc = root.querySelector('.a4-scroll'), avail = sc.clientWidth - 32;
    var z = Math.min(1, avail / (landscape() ? 1123 : 794));
    root.querySelector('.a4-zoom').style.zoom = z.toFixed(3);
    placeObjBar();
  }

  /* ── Печать ────────────────────────────────────────────────────── */
  function printA4() {
    selectObj(null);
    var hint = root.querySelector('.a4-hint');
    hint.hidden = false; clearTimeout(hint.__t); hint.__t = setTimeout(function () { hint.hidden = true; }, 12000);
    var st = document.createElement('style'); st.id = 'lc-a4-page-style';
    st.textContent = '@page{size:A4 ' + (landscape() ? 'landscape' : 'portrait') + ';margin:0}';
    document.head.appendChild(st);
    document.body.classList.add('lc-a4-printing');
    var clean = function () {
      document.body.classList.remove('lc-a4-printing'); st.remove(); window.removeEventListener('afterprint', clean);
    };
    window.addEventListener('afterprint', clean);
    window.print();
    setTimeout(function () { if (document.body.classList.contains('lc-a4-printing')) clean(); }, 60000);
  }

  /* ── Построение редактора ──────────────────────────────────────── */
  function build() {
    root = document.createElement('div'); root.id = 'lc-a4'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Лист A4');
    var sizes = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];
    root.innerHTML =
      '<div class="a4-top">' +
        '<button type="button" class="a4-btn a4-back" data-act="close">' + ico('<path d="M15 18l-6-6 6-6"/>') + '<span>К этикеткам</span></button>' +
        '<div class="a4-title"><b>Лист A4</b><span class="a4-saved">Сохранено</span></div>' +
        '<button type="button" class="a4-btn a4-print" data-act="print">' + ico('<path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z"/>') + '<span>Печать A4</span></button>' +
      '</div>' +
      '<div class="a4-hint" role="status" hidden>' + ico('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>') +
        '<span>В окне печати выберите <b>обычный принтер</b> (не термопринтер TSC), бумага <b>A4</b>, поля — <b>нет</b> или <b>по умолчанию</b>, масштаб 100%.</span></div>' +
      '<div class="a4-toolbar" role="toolbar" aria-label="Форматирование">' +
        '<div class="a4-group">' +
          '<button type="button" class="a4-tb" data-cmd="undo" title="Отменить (Ctrl+Z)">' + ico('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>') + '</button>' +
          '<button type="button" class="a4-tb" data-cmd="redo" title="Повторить (Ctrl+Y)">' + ico('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>') + '</button>' +
        '</div>' +
        '<div class="a4-group">' +
          '<select class="a4-size" title="Размер шрифта">' + sizes.map(function (s) { return '<option value="' + s + '"' + (s === 14 ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
          '<button type="button" class="a4-tb a4-b" data-cmd="bold" title="Жирный (Ctrl+B)"><b>Ж</b></button>' +
          '<button type="button" class="a4-tb a4-i" data-cmd="italic" title="Курсив (Ctrl+I)"><i>К</i></button>' +
          '<button type="button" class="a4-tb a4-u" data-cmd="underline" title="Подчёркнутый (Ctrl+U)"><u>Ч</u></button>' +
        '</div>' +
        '<div class="a4-group">' +
          '<button type="button" class="a4-tb" data-cmd="justifyLeft" title="По левому краю">' + ico('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>') + '</button>' +
          '<button type="button" class="a4-tb" data-cmd="justifyCenter" title="По центру">' + ico('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>') + '</button>' +
          '<button type="button" class="a4-tb" data-cmd="justifyRight" title="По правому краю">' + ico('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>') + '</button>' +
          '<button type="button" class="a4-tb" data-cmd="justifyFull" title="По ширине">' + ico('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>') + '</button>' +
          '<button type="button" class="a4-tb" data-cmd="insertUnorderedList" title="Список">' + ico('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>') + '</button>' +
        '</div>' +
        '<div class="a4-group">' +
          '<button type="button" class="a4-tb a4-wide" data-orient="portrait" title="Книжная">' + ico('<rect x="6" y="3" width="12" height="18" rx="1.5"/>') + '<span>Книжная</span></button>' +
          '<button type="button" class="a4-tb a4-wide" data-orient="landscape" title="Альбомная">' + ico('<rect x="3" y="6" width="18" height="12" rx="1.5"/>') + '<span>Альбомная</span></button>' +
        '</div>' +
        '<div class="a4-group a4-insert">' +
          '<span class="a4-label">На листе:</span>' +
          '<button type="button" class="a4-tb a4-wide a4-toggle" data-role-btn="title" title="Название оборудования — добавить / убрать">' + ico('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>') + '<span>Название</span></button>' +
          '<button type="button" class="a4-tb a4-wide a4-toggle" data-role-btn="inv" title="Инвентарный номер — добавить / убрать">' + ico('<path d="M9 4 7 20M17 4l-2 16M5 9h15M4 15h15"/>') + '<span>Инв</span></button>' +
          '<button type="button" class="a4-tb a4-wide a4-toggle" data-role-btn="sn" title="S/N — добавить / убрать">' + ico('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h2M7 14h4M13 10h4M14 14h3"/>') + '<span>S/N</span></button>' +
          '<button type="button" class="a4-tb a4-wide a4-toggle" data-role-btn="barcode" title="Штрихкод — добавить / убрать">' + ico('<path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14"/>') + '<span>Штрихкод</span></button>' +
          '<button type="button" class="a4-tb a4-wide a4-toggle" data-role-btn="qr" title="QR-код — добавить / убрать">' + ico('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2z"/>') + '<span>QR</span></button>' +
          Object.keys(LOGOS).map(function (n) { return '<button type="button" class="a4-tb a4-logo-btn a4-toggle" data-logo="' + n + '" title="Логотип ' + n + ' — поставить / убрать"><img src="' + LOGOS[n] + '" alt="' + n + '"></button>'; }).join('') +
        '</div>' +
        '<div class="a4-group">' +
          '<label class="a4-tb a4-wide" title="Своя картинка">' + ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>') + '<span>Картинку</span><input type="file" accept="image/*" hidden></label>' +
          '<button type="button" class="a4-tb a4-wide" data-act="reset" title="Заново из текущей этикетки">' + ico('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>') + '<span>Из этикетки</span></button>' +
          '<button type="button" class="a4-tb a4-wide" data-act="clear" title="Очистить лист">' + ico('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>') + '<span>Очистить</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="a4-scroll">' +
        '<div class="a4-objbar" hidden>' +
          '<button type="button" data-act="smaller" title="Меньше">−</button>' +
          '<button type="button" data-act="bigger" title="Больше">+</button>' +
          '<button type="button" data-act="edit" title="Изменить значение">✎</button>' +
          '<button type="button" data-act="delete" title="Удалить">🗑</button>' +
        '</div>' +
        '<div class="a4-zoom"><div class="a4-page" contenteditable="true" spellcheck="true" lang="ru" aria-label="Лист A4"></div></div>' +
      '</div>';
    document.body.appendChild(root);
    page = root.querySelector('.a4-page');
    objBar = root.querySelector('.a4-objbar');

    var saved = loadDoc();
    if (saved) { page.innerHTML = saved.replace(/pyaterochka-horizontal-logo\.svg/g, 'pyaterochka-logo.svg'); migrate(); }
    else {
      page.innerHTML = '<p><br></p>';
      libs().then(function () { page.innerHTML = labelBlockHtml(); scheduleSave(); updateToolbar(); })
        .catch(function () { page.innerHTML = labelBlockHtml(); });
    }
    document.execCommand('defaultParagraphSeparator', false, 'p');
    var orient = null; try { orient = localStorage.getItem(ORIENT_KEY); } catch (e) {}
    page.classList.toggle('is-landscape', orient === 'landscape');

    /* Кнопки не должны забирать фокус у листа */
    root.querySelector('.a4-toolbar').addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) e.preventDefault();
    });

    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd],[data-act],[data-logo],[data-role-btn],[data-orient]');
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-cmd')) { cmd(b.getAttribute('data-cmd')); return; }
      if (b.hasAttribute('data-logo')) { toggleRole('logo', b.getAttribute('data-logo')); return; }
      if (b.hasAttribute('data-role-btn')) {
        var rb = b.getAttribute('data-role-btn');
        if (rb === 'barcode' || rb === 'qr') libs().then(function () { toggleRole(rb); }).catch(function (er) { alert(er.message); });
        else toggleRole(rb);
        return;
      }
      if (b.hasAttribute('data-orient')) { setOrientation(b.getAttribute('data-orient'), true); return; }
      var act = b.getAttribute('data-act');
      if (b.closest('.a4-objbar')) { objAction(act); return; }
      if (act === 'close') close();
      else if (act === 'print') printA4();
      else if (act === 'reset') { if (confirm('Собрать лист заново из текущей этикетки? Текущий лист будет заменён.')) libs().then(function () { page.innerHTML = labelBlockHtml(); savedRange = null; scheduleSave(); updateToolbar(); }); }
      else if (act === 'clear') { if (confirm('Очистить лист A4?')) { page.innerHTML = '<p><br></p>'; savedRange = null; scheduleSave(); } }
      else if (act === 'label') libs().then(function () { insertHtml(labelBlockHtml()); }).catch(function (er) { alert(er.message); });
      else if (act === 'barcode' || act === 'qr') {
        var def = act === 'qr' ? (field('serial') || field('inventory')) : field('inventory');
        var v = window.prompt(act === 'qr' ? 'Что зашить в QR (S/N, ссылку, текст):' : 'Значение штрихкода (инвентарный номер):', def);
        if (!v || !v.trim()) return;
        libs().then(function () { insertHtml(objHtml(act, v.trim(), act === 'qr' ? 40 : 80)); }).catch(function (er) { alert(er.message); });
      }
    });

    root.querySelector('.a4-size').addEventListener('change', function (e) { setFontSize(e.target.value); });
    root.querySelector('input[type=file]').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      if (f.size > 3 * 1024 * 1024) { alert('Картинка больше 3 МБ — выберите поменьше.'); return; }
      var rd = new FileReader();
      rd.onload = function () { insertHtml(objHtml('image', rd.result, 60)); };
      rd.readAsDataURL(f); e.target.value = '';
    });

    page.addEventListener('click', function (e) {
      var o = e.target.closest('.a4-obj'); selectObj(o && page.contains(o) ? o : null);
    });
    page.addEventListener('input', function () { scheduleSave(); updateToolbar(); });
    page.addEventListener('keydown', function (e) {
      if (selectedObj && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); objAction('delete'); }
    });
    ['keyup', 'mouseup', 'focus'].forEach(function (ev) { page.addEventListener(ev, function () { rememberSelection(); updateToolbar(); }); });
    document.addEventListener('selectionchange', function () { if (root && !root.hidden) { rememberSelection(); updateToolbar(); } });
    root.querySelector('.a4-scroll').addEventListener('scroll', placeObjBar);
    window.addEventListener('resize', fitZoom);
    document.addEventListener('keydown', function (e) { if (root && !root.hidden && e.key === 'Escape' && !selectedObj) close(); });
  }

  function open() {
    if (!root) build();
    root.hidden = false; document.body.classList.add('lc-a4-open');
    fitZoom(); updateToolbar();
    libs().catch(function () {}); /* подгружаем заранее */
    setTimeout(function () { page.focus(); }, 50);
  }
  function close() {
    if (!root) return;
    selectObj(null); root.hidden = true; document.body.classList.remove('lc-a4-open');
  }
  window.__lcOpenA4 = open;

  /* ── Кнопка «A4» в блоке размеров ──────────────────────────────── */
  function injectButton() {
    var grid = document.querySelector('[data-testid="grid-sizes"]');
    if (!grid || grid.querySelector('[data-testid="button-size-a4"]')) return;
    var sample = grid.querySelector('button:not(.border-primary)') || grid.querySelector('button');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = (sample ? sample.className : '') + ' lc-a4-size-btn';
    b.setAttribute('data-testid', 'button-size-a4');
    /* те же классы, что у соседних кнопок размера — чтобы выглядела одинаково */
    var t1 = sample && sample.children[0] ? sample.children[0].className : 'text-[13px] font-medium leading-tight';
    var t2 = sample && sample.children[1] ? sample.children[1].className : 'text-[11px] text-muted-foreground mt-0.5';
    b.innerHTML = '<div class="' + t1 + '">Лист A4</div><div class="' + t2 + '">Обычный принтер</div>';
    b.title = 'Лист A4 210 × 297 мм — редактор как в Word';
    b.addEventListener('click', open);
    grid.appendChild(b);
  }
  new MutationObserver(injectButton).observe(document.body, { childList: true, subtree: true });
  injectButton();
}());

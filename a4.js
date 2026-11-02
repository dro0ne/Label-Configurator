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

  /* ── Шапка листа: тема и формат, как на главной ────────────────── */
  var SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  var MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>';
  function renderTopBar() {
    if (!root) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var tb = root.querySelector('[data-act="theme"]');
    if (tb) {
      tb.innerHTML = ico(dark ? SUN : MOON);
      var label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
      tb.title = label; tb.setAttribute('aria-label', label);
    }
    var badge = root.querySelector('.a4-badge');
    if (badge) badge.textContent = 'A4 · ' + (landscape() ? 'альбомная' : 'книжная');
  }
  new MutationObserver(function () { renderTopBar(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ── Ориентация ────────────────────────────────────────────────── */
  var ORIENT_KEY = 'lc-a4-orient';
  function landscape() { return page.classList.contains('is-landscape'); }
  function setOrientation(o, save) {
    page.classList.toggle('is-landscape', o === 'landscape');
    if (save) { try { localStorage.setItem(ORIENT_KEY, o); } catch (e) {} }
    updateToolbar(); fitZoom(); renderTopBar();
  }

  /* ── Выделение объекта и его панель (размер / изменить / удалить) ── */
  function selectObj(obj) {
    if (selectedObj) selectedObj.classList.remove('is-selected');
    selectedObj = obj;
    updateSizeBox();
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
    var maxW = landscape() ? 260 : 174;
    if (act === 'bigger') selectedObj.style.width = Math.min(maxW, w * 1.15).toFixed(1) + 'mm';
    if (act === 'smaller') selectedObj.style.width = Math.max(10, w / 1.15).toFixed(1) + 'mm';
    if (act === 'bigger' || act === 'smaller') updateSizeBox();
    if (act === 'delete') { var wasLogo = selectedObj.getAttribute('data-role') === 'logo' && blockOf(selectedObj); selectedObj.remove(); selectObj(null); if (wasLogo && !wasLogo.textContent.trim() && !wasLogo.querySelector('.a4-obj')) wasLogo.remove(); tidyCodes(); updateToolbar(); }
    if (act === 'edit') {
      var kind = selectedObj.getAttribute('data-kind'), old = selectedObj.getAttribute('data-value');
      var v = window.prompt(kind === 'qr' ? 'Что зашить в QR:' : 'Значение штрихкода:', old);
      if (v && v.trim()) {
        var role = selectedObj.getAttribute('data-role');
        var lineRole = role === 'barcode' ? 'inv' : (role === 'qr' ? 'sn' : null);
        var linked = lineRole && lineValue(lineRole) === old;
        var tmp = document.createElement('div'); tmp.innerHTML = objHtml(kind, v.trim(), w, role);
        if (tmp.firstChild) {
          selectedObj.replaceWith(tmp.firstChild); selectObj(null);
          if (linked) setLineValue(lineRole, v.trim());
        } else alert('Штрихкод Code128 понимает только латиницу, цифры и знаки — без русских букв.');
      }
    }
    scheduleSave(); placeObjBar();
  }

  /* ── Размер выбранного объекта в верхней панели ─────────────────── */
  var KIND_NAMES = { logo: 'логотип', barcode: 'штрихкод', qr: 'QR', image: 'картинка' };
  function updateSizeBox() {
    if (!root) return;
    var box = root.querySelector('.a4-sizebox'); if (!box) return;
    var on = !!(selectedObj && page.contains(selectedObj));
    box.classList.toggle('is-disabled', !on);
    Array.from(box.querySelectorAll('button')).forEach(function (b) { b.disabled = !on; });
    var val = box.querySelector('.a4-size-val');
    if (on) {
      val.textContent = Math.round(parseFloat(selectedObj.style.width) || 0) + ' мм';
      box.title = 'Размер: ' + (KIND_NAMES[selectedObj.getAttribute('data-kind')] || 'объект');
    } else {
      val.textContent = 'нажмите на логотип или код';
      box.title = 'Сначала нажмите на логотип, штрихкод или QR на листе';
    }
  }

  /* ── Строки «Инв: …» / «S/N: …» связаны со штрихкодом и QR ──────── */
  var LINE_PREFIX = { inv: /^\s*Инв\.?\s*:?\s*/i, sn: /^\s*S\s*\/\s*N\s*:?\s*/i };
  var LINE_CODE = { inv: 'barcode', sn: 'qr' };
  function lineValue(role) {
    var p = page.querySelector('p[data-role="' + role + '"]');
    return p ? p.textContent.replace(/​/g, '').replace(LINE_PREFIX[role], '').trim() : null;
  }
  function setLineValue(role, value) {
    var p = page.querySelector('p[data-role="' + role + '"]'); if (!p) return;
    var label = role === 'inv' ? 'Инв:' : 'S/N:';
    var span = p.querySelector('span') || p;
    span.innerHTML = '<b>' + label + '</b> ' + esc(value);
  }
  var syncTimer = null;
  function syncCodesFromText() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      var warn = root.querySelector('.a4-warn'), bad = false;
      ['inv', 'sn'].forEach(function (role) {
        var v = lineValue(role); if (!v) return;
        var obj = page.querySelector('.a4-obj[data-role="' + LINE_CODE[role] + '"]'); if (!obj) return;
        if (obj.getAttribute('data-value') === v) return;
        var html = objHtml(obj.getAttribute('data-kind'), v, parseFloat(obj.style.width) || 50, LINE_CODE[role]);
        if (!html) { bad = true; return; }
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var wasSelected = obj === selectedObj;
        obj.replaceWith(tmp.firstChild);
        if (wasSelected) selectObj(page.querySelector('.a4-obj[data-role="' + LINE_CODE[role] + '"]'));
        scheduleSave();
      });
      warn.hidden = !bad;
    }, 350);
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
  function printA4(batchEl) {
    selectObj(null);
    var hint = root.querySelector('.a4-hint');
    hint.hidden = false; clearTimeout(hint.__t); hint.__t = setTimeout(function () { hint.hidden = true; }, 12000);
    var st = document.createElement('style'); st.id = 'lc-a4-page-style';
    st.textContent = '@page{size:A4 ' + (landscape() ? 'landscape' : 'portrait') + ';margin:0}';
    document.head.appendChild(st);
    document.body.classList.add('lc-a4-printing');
    if (batchEl) document.body.classList.add('lc-a4-batch-printing');
    var clean = function () {
      document.body.classList.remove('lc-a4-printing', 'lc-a4-batch-printing'); st.remove(); window.removeEventListener('afterprint', clean);
      if (batchEl && batchEl.parentNode) batchEl.remove();
    };
    window.addEventListener('afterprint', clean);
    window.print();
    setTimeout(function () { if (document.body.classList.contains('lc-a4-printing')) clean(); }, 60000);
  }

  /* ── Печать списка: текущий лист — шаблон, на каждую строку свой лист ── */
  var batchDlg = null;
  function setRoleText(el, value) {
    /* сохранить оформление: текст кладём в первый текстовый узел, остальные очищаем */
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = walker.nextNode())) if (n.nodeValue.replace(/​/g, '').trim()) nodes.push(n);
    if (!nodes.length) { el.textContent = value; return; }
    nodes[0].nodeValue = value; for (var i = 1; i < nodes.length; i++) nodes[i].nodeValue = '';
  }
  function setLineIn(sheet, role, value) {
    var p = sheet.querySelector('p[data-role="' + role + '"]'); if (!p) return;
    if (!value) { p.remove(); return; }
    var span = p.querySelector('span') || p;
    span.innerHTML = '<b>' + (role === 'inv' ? 'Инв:' : 'S/N:') + '</b> ' + esc(value);
  }
  function setCodeIn(sheet, role, value, problems) {
    var obj = sheet.querySelector('.a4-obj[data-role="' + role + '"]'); if (!obj) return;
    if (!value) { obj.remove(); return; }
    var html = objHtml(obj.getAttribute('data-kind'), value, parseFloat(obj.style.width) || 50, role);
    if (!html) { problems.push(role === 'barcode' ? 'штрихкод: «' + value + '» — только латиница и цифры' : 'QR'); obj.remove(); return; }
    var tmp = document.createElement('div'); tmp.innerHTML = html; obj.replaceWith(tmp.firstChild);
  }
  function buildSheet(row, problems) {
    var sheet = document.createElement('div');
    sheet.className = 'a4-page a4-batch-page' + (landscape() ? ' is-landscape' : '');
    sheet.innerHTML = page.innerHTML;
    Array.from(sheet.querySelectorAll('.is-selected')).forEach(function (o) { o.classList.remove('is-selected'); });
    var t = sheet.querySelector('p[data-role="title"]');
    if (t) { if (row.title) setRoleText(t, row.title); else t.remove(); }
    setLineIn(sheet, 'inv', row.inventory);
    setLineIn(sheet, 'sn', row.serial);
    setCodeIn(sheet, 'barcode', row.inventory, problems);
    setCodeIn(sheet, 'qr', row.serial, problems);
    var codes = sheet.querySelector('p[data-role="codes"]');
    if (codes) {
      var objs = Array.from(codes.querySelectorAll('.a4-obj'));
      if (!objs.length) codes.remove();
      else { codes.innerHTML = ''; objs.forEach(function (o, i) { if (i) codes.insertAdjacentHTML('beforeend', SPACER); codes.appendChild(o); }); }
    }
    return sheet;
  }

  function openBatch() {
    if (batchDlg) return;
    var mode = 'auto'; try { mode = localStorage.getItem('lc-a4-batch-mode') || 'auto'; } catch (e) {}
    var opt = function (v, t, d) {
      return '<label class="a4-mode"><input type="radio" name="a4-batch-mode" value="' + v + '"' + (v === mode ? ' checked' : '') + '><span><b>' + t + '</b><small>' + d + '</small></span></label>';
    };
    batchDlg = document.createElement('div');
    batchDlg.className = 'a4-dlg-backdrop';
    batchDlg.innerHTML =
      '<section class="a4-dlg" role="dialog" aria-modal="true" aria-labelledby="a4-dlg-title">' +
        '<div class="a4-dlg-head"><div><h2 id="a4-dlg-title">Печать списка на A4</h2>' +
        '<p>Шаблон — текущий лист: оформление, логотип и размеры кодов сохраняются, для каждой строки подставляются название, Инв, S/N и коды. Одна строка — один лист.</p></div>' +
        '<button type="button" class="a4-dlg-x" data-dlg="close" aria-label="Закрыть">×</button></div>' +
        '<div class="a4-modes">' +
          opt('auto', 'Автовыбор', 'Каждой строке — что в ней есть') +
          opt('inventory', 'Инвентарник', 'Инв и штрихкод, без S/N') +
          opt('serial', 'S/N', 'S/N и QR, без Инв') +
        '</div>' +
        '<p class="a4-dlg-example">Название ; Инвентарный номер ; S/N — можно вставить прямо из Excel</p>' +
        '<textarea class="a4-dlg-input" spellcheck="false" placeholder="Ноутбук Lenovo ThinkPad T14; CH00209875; SN-2026-000184&#10;Монитор Samsung 24; CH00209876; SN-2026-000185"></textarea>' +
        '<div class="a4-dlg-status" role="status"></div>' +
        '<div class="a4-dlg-actions"><button type="button" class="a4-btn" data-dlg="close">Отмена</button>' +
        '<button type="button" class="a4-btn a4-print" data-dlg="go">Печатать все</button></div>' +
      '</section>';
    root.appendChild(batchDlg);
    var ta = batchDlg.querySelector('textarea');
    try { ta.value = localStorage.getItem('lc-a4-batch-text') || ''; } catch (e) {}
    batchDlg.addEventListener('click', function (e) {
      if (e.target === batchDlg) { closeBatch(); return; }
      var b = e.target.closest('[data-dlg]'); if (!b) return;
      if (b.getAttribute('data-dlg') === 'close') closeBatch(); else runBatch();
    });
    batchDlg.addEventListener('change', function (e) {
      if (e.target.name === 'a4-batch-mode') { try { localStorage.setItem('lc-a4-batch-mode', e.target.value); } catch (er) {} }
    });
    batchDlg.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeBatch(); } });
    setTimeout(function () { ta.focus(); }, 30);
  }
  function closeBatch() { if (batchDlg) { batchDlg.remove(); batchDlg = null; } }

  function runBatch() {
    var ta = batchDlg.querySelector('textarea'), status = batchDlg.querySelector('.a4-dlg-status');
    var mode = batchDlg.querySelector('[name="a4-batch-mode"]:checked').value;
    try { localStorage.setItem('lc-a4-batch-text', ta.value); } catch (e) {}
    var err = function (t) { status.className = 'a4-dlg-status is-error'; status.textContent = t; };
    if (!window.__lcParseRows) { err('Не удалось прочитать список. Обновите страницу.'); return; }
    var parsed = window.__lcParseRows(ta.value, mode);
    if (parsed.errors.length) { err('Проверьте строки: ' + parsed.errors.join(', ') + '. Найдены пустые или неполные данные.'); return; }
    if (!parsed.rows.length) { err('Добавьте хотя бы одну строку.'); return; }
    if (!page.querySelector('[data-role="title"],[data-role="inv"],[data-role="sn"],[data-role="barcode"],[data-role="qr"]')) {
      err('На листе нет полей для подстановки. Включите «Название», «Инв», «S/N», «Штрихкод» или «QR» в строке «На листе».'); return;
    }
    libs().then(function () {
      var box = document.createElement('div'); box.className = 'a4-batch';
      var warn = [];
      parsed.rows.forEach(function (row, i) {
        var problems = [];
        box.appendChild(buildSheet(row, problems));
        if (problems.length) warn.push('строка ' + (i + 1) + ': ' + problems.join(', '));
      });
      if (warn.length && !window.confirm('Некоторые коды не получились:\n\n' + warn.slice(0, 12).join('\n') + (warn.length > 12 ? '\n… и ещё ' + (warn.length - 12) : '') + '\n\nПечатать без них?')) return;
      root.appendChild(box);
      closeBatch();
      var imgs = Array.from(box.querySelectorAll('img'));
      Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); }))
        .then(function () { printA4(box); });
    }).catch(function (e) { err(e.message); });
  }

  /* ── Построение редактора ──────────────────────────────────────── */
  function build() {
    root = document.createElement('div'); root.id = 'lc-a4'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Лист A4');
    var sizes = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];
    root.innerHTML =
      '<div class="a4-top">' +
        '<button type="button" class="a4-btn a4-back" data-act="close">' + ico('<path d="M15 18l-6-6 6-6"/>') + '<span>К этикеткам</span></button>' +
        '<div class="a4-title"><b>Лист A4</b><span class="a4-saved">Сохранено</span><span class="a4-warn" role="alert" hidden>Штрихкод не обновлён: в Инв только латиница, цифры и знаки</span></div>' +
        '<button type="button" class="a4-btn a4-icon-btn" data-act="theme" data-testid="a4-button-theme"></button>' +
        '<span class="a4-badge" data-testid="a4-badge-size">A4 · книжная</span>' +
        '<button type="button" class="a4-btn" data-act="batch" title="Напечатать список: на каждую строку — свой лист A4 по этому шаблону">' + ico('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>') + '<span>Печать списка</span></button>' +
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
        '<div class="a4-group a4-sizebox is-disabled">' +
          '<span class="a4-label">Размер:</span>' +
          '<button type="button" class="a4-tb a4-pm" data-act="smaller" title="Уменьшить выбранный логотип / код" aria-label="Уменьшить" disabled>−</button>' +
          '<span class="a4-size-val">нажмите на логотип или код</span>' +
          '<button type="button" class="a4-tb a4-pm" data-act="bigger" title="Увеличить выбранный логотип / код" aria-label="Увеличить" disabled>+</button>' +
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
      if (b.closest('.a4-objbar') || act === 'smaller' || act === 'bigger') { objAction(act); return; }
      if (act === 'close') close();
      else if (act === 'print') printA4();
      else if (act === 'batch') openBatch();
      else if (act === 'theme') {
        var main = document.querySelector('[data-testid="button-theme"]');
        if (main) main.click();
        renderTopBar();
      }
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
    page.addEventListener('input', function () { scheduleSave(); updateToolbar(); syncCodesFromText(); });
    page.addEventListener('keydown', function (e) {
      if (selectedObj && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); objAction('delete'); }
    });
    ['keyup', 'mouseup', 'focus'].forEach(function (ev) { page.addEventListener(ev, function () { rememberSelection(); updateToolbar(); }); });
    document.addEventListener('selectionchange', function () { if (root && !root.hidden) { rememberSelection(); updateToolbar(); } });
    root.querySelector('.a4-scroll').addEventListener('scroll', placeObjBar);
    window.addEventListener('resize', fitZoom);
    document.addEventListener('keydown', function (e) { if (root && !root.hidden && e.key === 'Escape' && !selectedObj && !batchDlg) close(); });
  }

  /* Кнопка «Назад» браузера: открытие листа — отдельный шаг истории (адрес не меняется) */
  function inA4History() { return !!(history.state && history.state.lcA4); }
  function open(fromHistory) {
    if (!fromHistory && !inA4History()) {
      try { history.pushState(Object.assign({}, history.state || {}, { lcA4: true }), '', location.href); } catch (e) {}
    }
    if (!root) build();
    root.hidden = false; document.body.classList.add('lc-a4-open');
    fitZoom(); updateToolbar(); updateSizeBox(); renderTopBar();
    libs().catch(function () {}); /* подгружаем заранее */
    setTimeout(function () { page.focus(); }, 50);
  }
  function hide() {
    if (!root) return;
    closeBatch();
    selectObj(null); root.hidden = true; document.body.classList.remove('lc-a4-open');
  }
  /* «К этикеткам» / Esc — шаг назад по истории, чтобы «Назад» потом не открывал лист снова */
  function close() {
    if (inA4History()) history.back(); else hide();
  }
  window.addEventListener('popstate', function () {
    if (inA4History()) { if (!root || root.hidden) open(true); }
    else if (root && !root.hidden) hide();
  });
  /* обновили страницу, находясь в листе — остаёмся в нём */
  if (inA4History()) {
    var reopen = function () { if (document.querySelector('[data-testid="grid-sizes"]')) open(true); else setTimeout(reopen, 200); };
    reopen();
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
    b.addEventListener('click', function () { open(); });
    grid.appendChild(b);
  }
  new MutationObserver(injectButton).observe(document.body, { childList: true, subtree: true });
  injectButton();
}());

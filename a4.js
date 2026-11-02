/* Лист A4 «как в Word»: свободный текст, выравнивание, логотипы, штрихкод, QR.
   Открывается кнопкой «A4» в блоке размеров. Документ автосохраняется в браузере. */
(function () {
  'use strict';

  var KEY = 'lc-a4-doc-v1';
  var LOGOS = {
    'Пятёрочка': './pyaterochka-horizontal-logo.svg',
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
  function objHtml(kind, value, widthMm) {
    var inner = '';
    if (kind === 'logo') inner = '<img src="' + LOGOS[value] + '" alt="' + esc(value) + '">';
    else if (kind === 'barcode') inner = barcodeSvg(value);
    else if (kind === 'qr') inner = qrSvg(value);
    else if (kind === 'image') inner = '<img src="' + value + '" alt="">';
    if (!inner) return '';
    return '<span class="a4-obj a4-obj-' + kind + '" contenteditable="false" data-kind="' + kind + '" data-value="' + esc(kind === 'image' ? '' : value) + '" style="width:' + widthMm + 'mm">' + inner + '</span>';
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

  /* ── Шаблон из текущей этикетки ────────────────────────────────── */
  function labelBlockHtml() {
    var t = field('title') || 'Название оборудования', inv = field('inventory'), sn = field('serial');
    var store = field('store'), logo = window.__lcActiveLogo || (LOGOS[store] ? store : null);
    var h = '<p style="text-align:center"><span style="font-size:28pt"><b>' + esc(t) + '</b></span></p>';
    if (inv) h += '<p style="text-align:center"><span style="font-size:16pt"><b>Инв:</b> ' + esc(inv) + '</span></p>';
    if (sn) h += '<p style="text-align:center"><span style="font-size:16pt"><b>S/N:</b> ' + esc(sn) + '</span></p>';
    var codes = '';
    if (inv) codes += objHtml('barcode', inv, 90);
    if (sn) codes += (codes ? '&nbsp;&nbsp;&nbsp;' : '') + objHtml('qr', sn, 45);
    if (codes) h += '<p style="text-align:center">' + codes + '</p>';
    if (logo) h += '<p style="text-align:center">' + objHtml('logo', logo, 80) + '</p>';
    else if (store) h += '<p style="text-align:center"><span style="font-size:20pt"><b>' + esc(store) + '</b></span></p>';
    return h + '<p><br></p>';
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
    if (act === 'delete') { selectedObj.remove(); selectObj(null); }
    if (act === 'edit') {
      var kind = selectedObj.getAttribute('data-kind'), old = selectedObj.getAttribute('data-value');
      var v = window.prompt(kind === 'qr' ? 'Что зашить в QR:' : 'Значение штрихкода:', old);
      if (v && v.trim()) {
        var tmp = document.createElement('div'); tmp.innerHTML = objHtml(kind, v.trim(), w);
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
    var z = Math.min(1, avail / 794);
    root.querySelector('.a4-zoom').style.zoom = z.toFixed(3);
    placeObjBar();
  }

  /* ── Печать ────────────────────────────────────────────────────── */
  function printA4() {
    selectObj(null);
    var hint = root.querySelector('.a4-hint');
    hint.hidden = false; clearTimeout(hint.__t); hint.__t = setTimeout(function () { hint.hidden = true; }, 12000);
    var st = document.createElement('style'); st.id = 'lc-a4-page-style';
    st.textContent = '@page{size:A4 portrait;margin:0}';
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
        '<div class="a4-group a4-insert">' +
          '<span class="a4-label">Вставить:</span>' +
          Object.keys(LOGOS).map(function (n) { return '<button type="button" class="a4-tb a4-logo-btn" data-logo="' + n + '" title="Логотип ' + n + '"><img src="' + LOGOS[n] + '" alt="' + n + '"></button>'; }).join('') +
          '<button type="button" class="a4-tb a4-wide" data-act="barcode" title="Штрихкод">' + ico('<path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14"/>') + '<span>Штрихкод</span></button>' +
          '<button type="button" class="a4-tb a4-wide" data-act="qr" title="QR-код">' + ico('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2z"/>') + '<span>QR</span></button>' +
          '<button type="button" class="a4-tb a4-wide" data-act="label" title="Вставить данные текущей этикетки">' + ico('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h10"/>') + '<span>Этикетку</span></button>' +
          '<label class="a4-tb a4-wide" title="Своя картинка">' + ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>') + '<span>Картинку</span><input type="file" accept="image/*" hidden></label>' +
        '</div>' +
        '<div class="a4-group">' +
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
    if (saved) page.innerHTML = saved;
    else {
      page.innerHTML = '<p><br></p>';
      libs().then(function () { page.innerHTML = labelBlockHtml(); scheduleSave(); })
        .catch(function () { page.innerHTML = labelBlockHtml(); });
    }
    document.execCommand('defaultParagraphSeparator', false, 'p');

    /* Кнопки не должны забирать фокус у листа */
    root.querySelector('.a4-toolbar').addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) e.preventDefault();
    });

    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd],[data-act],[data-logo]');
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-cmd')) { cmd(b.getAttribute('data-cmd')); return; }
      if (b.hasAttribute('data-logo')) { insertHtml(objHtml('logo', b.getAttribute('data-logo'), 70)); return; }
      var act = b.getAttribute('data-act');
      if (b.closest('.a4-objbar')) { objAction(act); return; }
      if (act === 'close') close();
      else if (act === 'print') printA4();
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
    page.addEventListener('input', scheduleSave);
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
    fitZoom();
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
    b.innerHTML = '<div class="font-medium">A4 · 210 × 297 мм</div><div class="text-xs opacity-80">Лист · как в Word</div>';
    b.addEventListener('click', open);
    grid.appendChild(b);
  }
  new MutationObserver(injectButton).observe(document.body, { childList: true, subtree: true });
  injectButton();
}());

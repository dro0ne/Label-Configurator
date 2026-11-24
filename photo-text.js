/* Распознавание фотографий выполняется в браузере. Фото не отправляется на сервер. */
(function () {
  'use strict';
  var libraryPromise = null;
  var LIBRARY = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';

  function loadLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!libraryPromise) libraryPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timer = setTimeout(function () { fail(); }, 25000);
      function fail() { clearTimeout(timer); script.remove(); libraryPromise = null; reject(new Error('library')); }
      script.src = LIBRARY;
      script.onload = function () { clearTimeout(timer); if (window.Tesseract) resolve(window.Tesseract); else fail(); };
      script.onerror = fail;
      document.head.appendChild(script);
    });
    return libraryPromise;
  }

  function mount() {
    var column = document.querySelector('[data-testid="page-configurator"] main > section');
    if (!column || column.querySelector('.lc-ocr-card')) return false;
    var previous = Array.from(column.children).find(function (el) { return el.textContent.indexOf('Подсказки для термопечати') !== -1; });
    if (!previous) return false;
    var card = document.createElement('div');
    card.className = previous.className + ' lc-ocr-card';
    card.setAttribute('data-testid', 'panel-photo-text');
    card.innerHTML =
      '<div class="lc-ocr-head"><h3><button type="button" class="lc-ocr-toggle" data-testid="button-ocr-toggle" aria-expanded="false" aria-controls="lc-ocr-body"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Текст с фотографии</span></button></h3></div>' +
      '<div class="lc-ocr-body" id="lc-ocr-body" hidden>' +
        '<div class="lc-ocr-settings">' +
        '<label class="lc-ocr-kind-label">Язык распознавания<select class="lc-ocr-language" aria-label="Язык распознавания"><option value="eng+rus">Русский + English</option><option value="eng">English · номера</option><option value="rus">Русский</option></select></label>' +
        '<label class="lc-ocr-kind-label">Что распознаём<select class="lc-ocr-kind" data-testid="select-ocr-kind"><option value="auto">Авто · текст, штрихкоды и рукопись</option><option value="printed">Печатный текст и штрихкоды</option><option value="handwriting-text">Рукопись · текст</option><option value="handwriting-code">Рукопись · код (A–Z, 0–9)</option></select></label>' +
        '</div>' +
        '<p class="lc-ocr-help lc-ocr-handwriting-help" hidden>Выделите строку или один столбец таблицы. Обработка выполняется на этом устройстве. Рукопись ещё может читаться с ошибками — сверяйте результат.</p>' +
        '<div class="lc-ocr-drop" tabindex="0" role="button" aria-label="Выбрать фотографию или вставить скриншот">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/></svg>' +
          '<strong>Загрузить фотографию</strong><span>Перетащите файл или вставьте скриншот: Ctrl+V</span>' +
          '<small>JPG, PNG, WebP · до 20 МБ</small>' +
          '<input class="lc-ocr-file" data-testid="input-ocr-photo" type="file" accept="image/*" hidden>' +
        '</div>' +
        '<div class="lc-ocr-image" hidden>' +
          '<span class="lc-ocr-filename"></span>' +
          '<div class="lc-ocr-toolbar" role="group" aria-label="Поворот фотографии">' +
            '<button type="button" class="lc-ocr-button" data-testid="button-ocr-rotate-left" aria-label="Повернуть влево на 90 градусов">↶ 90°</button>' +
            '<button type="button" class="lc-ocr-button" data-testid="button-ocr-rotate-right" aria-label="Повернуть вправо на 90 градусов">↷ 90°</button>' +
            '<button type="button" class="lc-ocr-button" data-testid="button-ocr-full-image">Всё фото</button>' +
          '</div>' +
          '<div class="lc-ocr-zoom" role="group" aria-label="Масштаб фотографии">' +
            '<button type="button" class="lc-ocr-button" data-testid="button-ocr-zoom-out" aria-label="Уменьшить фотографию">−</button>' +
            '<output class="lc-ocr-zoom-value" aria-live="polite">100%</output>' +
            '<button type="button" class="lc-ocr-button" data-testid="button-ocr-zoom-in" aria-label="Увеличить фотографию">+</button>' +
            '<button type="button" class="lc-ocr-button" data-testid="button-ocr-zoom-fit">Вписать фото</button>' +
          '</div>' +
          '<div class="lc-ocr-angle" role="group" aria-label="Поворот выделенной области">' +
            '<label for="lc-ocr-angle-range">Поворот рамки</label>' +
            '<input id="lc-ocr-angle-range" data-testid="input-ocr-angle-range" type="range" min="0" max="360" step="0.1" value="0" aria-label="Угол поворота рамки">' +
            '<label class="lc-ocr-angle-value"><input data-testid="input-ocr-angle" type="number" min="0" max="360" step="0.1" value="0" aria-label="Угол поворота рамки в градусах">°</label>' +
            '<button type="button" class="lc-ocr-button" data-testid="button-ocr-angle-reset">Сбросить угол</button>' +
          '</div>' +
          '<p id="lc-ocr-help" class="lc-ocr-help">Обведите нужный текст мышью или пальцем. Поверните рамку за ручку ↻, ползунком или задайте угол 0–360°. Кнопки ↶ / ↷ поворачивают всё фото на 90°.</p>' +
          '<div class="lc-ocr-stage"><div class="lc-ocr-surface" data-testid="ocr-photo-surface" tabindex="0" role="group" aria-label="Выделение области текста на фотографии" aria-describedby="lc-ocr-help lc-ocr-region-info">' +
            '<canvas class="lc-ocr-canvas" aria-label="Фотография для выделения текста"></canvas>' +
            '<div class="lc-ocr-selection" data-testid="ocr-selection" hidden><span data-corner="nw"></span><span data-corner="ne"></span><span data-corner="sw"></span><span data-corner="se"></span><button type="button" class="lc-ocr-rotation-handle" data-testid="button-ocr-rotation-handle" data-rotate="true" aria-label="Повернуть рамку. Стрелки влево и вправо меняют угол на один градус, Shift — на десять." title="Повернуть рамку">↻</button></div>' +
          '</div></div>' +
          '<p id="lc-ocr-region-info" class="lc-ocr-help" role="status" aria-live="polite"></p>' +
          '<label class="lc-ocr-line-option"><input type="checkbox" data-testid="checkbox-ocr-single-line" checked> Номер или штрихкод — результат одной строкой</label>' +
          '<span class="lc-ocr-keyboard-help">С клавиатуры: Enter — выделить центр, стрелки — двигать рамку, Shift + стрелки — менять размер, Esc — всё фото.</span>' +
        '</div>' +
        '<div class="lc-ocr-actions"><button type="button" class="lc-ocr-button lc-ocr-primary" data-testid="button-ocr-recognize" disabled>Распознать текст</button>' +
          '<button type="button" class="lc-ocr-button" data-testid="button-ocr-clear" disabled>Очистить</button>' +
          '<button type="button" class="lc-ocr-button" data-testid="button-ocr-cancel" hidden>Остановить</button></div>' +
        '<p class="lc-ocr-status" role="status" aria-live="polite">Фото обрабатывается в браузере. При первом запуске потребуется интернет.</p>' +
        '<progress class="lc-ocr-progress" max="100" value="0" hidden aria-label="Ход распознавания"></progress>' +
        '<label class="lc-ocr-label" for="lc-ocr-result">Распознанный текст</label>' +
        '<textarea id="lc-ocr-result" data-testid="input-ocr-result" class="lc-ocr-result" rows="5" placeholder="Здесь появится текст. Его можно исправить перед копированием."></textarea>' +
        '<div class="lc-ocr-alternatives" hidden><span class="lc-ocr-help">Другие варианты — нажмите, чтобы выбрать:</span><div></div></div>' +
        '<button type="button" class="lc-ocr-button lc-ocr-copy" data-testid="button-ocr-copy" disabled>Копировать текст</button>' +
        '<div class="lc-ocr-learning" hidden><label class="lc-ocr-line-option lc-ocr-vocabulary"><input type="checkbox" data-testid="checkbox-ocr-vocabulary" checked> Учитывать русский словарь и сохранённые названия</label><p class="lc-ocr-help">Словарь помогает выбрать между близкими вариантами русских слов. Номера читаются с изображения без словарных исправлений. Проверенные фрагменты можно сохранить на этом устройстве и скачать для дообучения.</p>' +
          '<div class="lc-ocr-actions"><button type="button" class="lc-ocr-button" data-testid="button-ocr-save-example" disabled>Сохранить проверенный пример</button><button type="button" class="lc-ocr-button" data-testid="button-ocr-export-examples" disabled>Скачать примеры · 0</button></div></div>' +
      '</div>';
    previous.replaceWith(card);
    column.classList.add('lc-workspace-column');
    connect(card);
    return true;
  }

  function connect(card) {
    var toggle = card.querySelector('.lc-ocr-toggle'), ocrBody = card.querySelector('.lc-ocr-body');
    var drop = card.querySelector('.lc-ocr-drop'), input = card.querySelector('.lc-ocr-file');
    var imageBox = card.querySelector('.lc-ocr-image'), preview = imageBox.querySelector('canvas');
    var surface = card.querySelector('.lc-ocr-surface'), regionBox = card.querySelector('.lc-ocr-selection');
    var stage = card.querySelector('.lc-ocr-stage'), zoomIn = card.querySelector('[data-testid="button-ocr-zoom-in"]');
    var zoomOut = card.querySelector('[data-testid="button-ocr-zoom-out"]'), zoomFit = card.querySelector('[data-testid="button-ocr-zoom-fit"]');
    var zoomValue = card.querySelector('.lc-ocr-zoom-value');
    var regionInfo = card.querySelector('#lc-ocr-region-info');
    var fullImage = card.querySelector('[data-testid="button-ocr-full-image"]');
    var rotateLeft = card.querySelector('[data-testid="button-ocr-rotate-left"]'), rotateRight = card.querySelector('[data-testid="button-ocr-rotate-right"]');
    var angleRange = card.querySelector('[data-testid="input-ocr-angle-range"]'), angleInput = card.querySelector('[data-testid="input-ocr-angle"]');
    var angleReset = card.querySelector('[data-testid="button-ocr-angle-reset"]'), rotationHandle = card.querySelector('[data-testid="button-ocr-rotation-handle"]');
    var singleLine = card.querySelector('[data-testid="checkbox-ocr-single-line"]');
    var alternatives = card.querySelector('.lc-ocr-alternatives'), alternativeButtons = alternatives.querySelector('div');
    var result = card.querySelector('.lc-ocr-result'), status = card.querySelector('.lc-ocr-status');
    var progress = card.querySelector('progress'), start = card.querySelector('[data-testid="button-ocr-recognize"]');
    var language = card.querySelector('.lc-ocr-language');
    var kind = card.querySelector('.lc-ocr-kind'), handwritingHelp = card.querySelector('.lc-ocr-handwriting-help');
    var learning = card.querySelector('.lc-ocr-learning'), cancel = card.querySelector('[data-testid="button-ocr-cancel"]');
    var saveExample = card.querySelector('[data-testid="button-ocr-save-example"]'), exportExamples = card.querySelector('[data-testid="button-ocr-export-examples"]');
    var vocabulary = card.querySelector('[data-testid="checkbox-ocr-vocabulary"]');
    var clear = card.querySelector('[data-testid="button-ocr-clear"]'), copy = card.querySelector('[data-testid="button-ocr-copy"]');
    var image = null, imageUrl = null, busy = false, loading = false, selection = 0;
    var quarterTurns = 0, crop = null, drag = null, zoom = 1;
    var sourceFile = null, lastRecognition = null, exampleCount = 0, savingExample = false;
    function setExpanded(expanded, remember, animate) {
      toggle.setAttribute('aria-expanded', String(expanded));
      if (window.__lcDisclosure) window.__lcDisclosure.set(ocrBody, expanded, { animate: animate !== false, onFinish: function () { if (expanded) fitPhoto(); } });
      else ocrBody.hidden = !expanded;
      card.classList.toggle('is-collapsed', !expanded);
      if (remember) { try { localStorage.setItem('lc-photo-text-expanded', String(expanded)); } catch (error) {} }
      if (expanded) requestAnimationFrame(fitPhoto);
    }
    var expanded = false;
    try { expanded = localStorage.getItem('lc-photo-text-expanded') === 'true'; } catch (error) {}
    setExpanded(expanded, false, false);
    toggle.addEventListener('click', function () { setExpanded(toggle.getAttribute('aria-expanded') !== 'true', true); });
    function isHandwriting() { return kind.value === 'handwriting-text' || kind.value === 'handwriting-code'; }
    function cropKey() { return selection + ':' + quarterTurns + ':' + JSON.stringify(crop); }
    function unresolvedCode() { return (kind.value === 'handwriting-code' || lastRecognition && lastRecognition.hasCodes) && result.value.indexOf('?') !== -1; }
    function canSaveExample() { return !busy && !savingExample && !unresolvedCode() && lastRecognition && lastRecognition.key === cropKey() && !!result.value.trim(); }

    function geometry() {
      var sideways = quarterTurns % 2;
      return { radians: quarterTurns * Math.PI / 2, width: sideways ? image.naturalHeight : image.naturalWidth, height: sideways ? image.naturalWidth : image.naturalHeight };
    }
    /* Координаты рамки относятся к повёрнутому оригиналу, а не к уменьшенному предпросмотру. */
    function drawPhoto(canvas, area, scale) {
      var size = geometry();
      canvas.width = Math.max(1, Math.round(area.width * scale));
      canvas.height = Math.max(1, Math.round(area.height * scale));
      var ctx = canvas.getContext('2d');
      if (canvas === preview) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(canvas.width / area.width, canvas.height / area.height);
      ctx.translate(area.width / 2, area.height / 2);
      ctx.rotate(-(area.angle || 0) * Math.PI / 180);
      ctx.translate(size.width / 2 - area.x - area.width / 2, size.height / 2 - area.y - area.height / 2);
      ctx.rotate(size.radians);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    }
    function renderRegion() {
      regionBox.hidden = !crop;
      if (crop) {
        regionBox.style.left = crop.x * 100 + '%'; regionBox.style.top = crop.y * 100 + '%';
        regionBox.style.width = crop.width * 100 + '%'; regionBox.style.height = crop.height * 100 + '%';
        regionBox.style.transform = 'rotate(' + (crop.angle || 0) + 'deg)';
        var size = geometry();
        regionInfo.textContent = 'Выбрана область: ' + Math.round(crop.width * size.width) + ' × ' + Math.round(crop.height * size.height) + ' пикс., угол ' + (crop.angle || 0) + '°. Читаем только внутри рамки.';
      } else regionInfo.textContent = singleLine.checked ? 'Сначала проверим штрихкоды на фото. Нужный номер можно выделить рамкой.' : 'Будет распознано всё фото. Обведите нужный текст, чтобы убрать лишний фон.';
      angleRange.value = crop && crop.angle || 0;
      angleRange.style.setProperty('--ocr-angle-progress', (Number(angleRange.value) / 3.6) + '%');
      if (document.activeElement !== angleInput) angleInput.value = crop && crop.angle || 0;
      angleRange.disabled = angleInput.disabled = angleReset.disabled = rotationHandle.disabled = busy || loading || !crop;
      var startLabel = crop ? 'Распознать выделенное' : 'Распознать текст';
      if (start.textContent !== startLabel) start.textContent = startLabel;
      fullImage.disabled = busy || loading || !crop;
      saveExample.disabled = !canSaveExample();
    }
    function renderPhoto() {
      if (!image) return;
      var size = geometry();
      /* Вписываем фото целиком, сохраняя одинаковый масштаб по обеим осям. */
      surface.style.aspectRatio = size.width + ' / ' + size.height;
      previewPhotoKey = ''; fitPhoto();
      renderRegion();
    }
    var previewPhotoKey = '';
    function fitPhoto() {
      zoomValue.textContent = Math.round(zoom * 100) + '%';
      zoomIn.disabled = busy || loading || !image || zoom >= 4;
      zoomOut.disabled = zoomFit.disabled = busy || loading || !image || zoom <= 1;
      if (!image || ocrBody.hidden) return;
      var style = getComputedStyle(stage), available = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      var size = geometry(), displayWidth = Math.max(20, Math.min(available, 900, 460 * size.width / size.height)) * zoom;
      surface.style.width = displayWidth + 'px';
      /* При зуме перерисовываем из оригинала под плотность экрана, а не растягиваем старую миниатюру. */
      var scale = Math.min(1, displayWidth * Math.min(window.devicePixelRatio || 1, 3) / size.width,
        6000 / Math.max(size.width, size.height), Math.sqrt(16000000 / (size.width * size.height)));
      var key = selection + ':' + quarterTurns + ':' + Math.round(size.width * scale) + ':' + Math.round(size.height * scale);
      if (key !== previewPhotoKey) {
        drawPhoto(preview, { x: 0, y: 0, width: size.width, height: size.height }, scale);
        previewPhotoKey = key;
      }
    }
    function changeZoom(value) {
      if (!image || busy || loading) return;
      zoom = Math.max(1, Math.min(4, value)); fitPhoto();
      var imageRect = surface.getBoundingClientRect(), viewport = stage.getBoundingClientRect();
      stage.scrollLeft += imageRect.left + imageRect.width * (crop ? crop.x + crop.width / 2 : .5) - viewport.left - stage.clientWidth / 2;
      stage.scrollTop += imageRect.top + imageRect.height * (crop ? crop.y + crop.height / 2 : .5) - viewport.top - stage.clientHeight / 2;
    }
    zoomIn.addEventListener('click', function () { changeZoom(zoom + .5); });
    zoomOut.addEventListener('click', function () { changeZoom(zoom - .5); });
    zoomFit.addEventListener('click', function () { changeZoom(1); });
    if (window.ResizeObserver) {
      var previousStageWidth = -1, fitFrame = 0;
      new ResizeObserver(function () {
        if (stage.clientWidth === previousStageWidth) return;
        previousStageWidth = stage.clientWidth;
        cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fitPhoto);
      }).observe(stage);
    }
    function resetCrop() { crop = null; drag = null; renderRegion(); }
    function normalizedAngle(value) { return Math.round(((value % 360 + 360) % 360) * 10) / 10; }
    /* Ограничиваем именно повёрнутые углы рамки, сохраняя пропорции и угол. */
    function fitCrop(area) {
      var size = geometry(), angle = (area.angle || 0) * Math.PI / 180;
      var width = area.width * size.width, height = area.height * size.height;
      var cx = (area.x + area.width / 2) * size.width, cy = (area.y + area.height / 2) * size.height;
      var bw = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
      var bh = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
      var scale = Math.min(1, size.width / Math.max(1, bw), size.height / Math.max(1, bh));
      width *= scale; height *= scale; bw *= scale; bh *= scale;
      cx = Math.max(bw / 2, Math.min(size.width - bw / 2, cx));
      cy = Math.max(bh / 2, Math.min(size.height - bh / 2, cy));
      return { x: (cx - width / 2) / size.width, y: (cy - height / 2) / size.height, width: width / size.width, height: height / size.height, angle: area.angle || 0 };
    }
    function setCropAngle(value) {
      if (!crop || busy || loading || !Number.isFinite(value)) return;
      crop = fitCrop(Object.assign({}, crop, { angle: Math.max(0, Math.min(360, Math.round(value * 10) / 10)) }));
      renderRegion();
    }
    [angleRange, angleInput].forEach(function (control) {
      control.addEventListener('input', function () { if (control.value !== '') setCropAngle(control.valueAsNumber); });
      control.addEventListener('change', function () { control.value = crop && crop.angle || 0; });
    });
    angleReset.addEventListener('click', function () { setCropAngle(0); });
    rotationHandle.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); event.stopPropagation();
      if (crop) setCropAngle(normalizedAngle((crop.angle || 0) + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1)));
    });
    function turn(direction) {
      if (!image || busy || loading) return;
      /* Рамка поворачивается вместе с фотографией: повторно обводить текст не нужно. */
      if (crop) crop = direction > 0 ?
        { x: 1 - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width, angle: crop.angle || 0 } :
        { x: crop.y, y: 1 - crop.x - crop.width, width: crop.height, height: crop.width, angle: crop.angle || 0 };
      quarterTurns = (quarterTurns + direction + 4) % 4;
      drag = null; renderPhoto();
      message(crop ? 'Поворот на 90°. Выделение сохранено. Когда текст расположен горизонтально, нажмите «Распознать выделенное».' : 'Фото повёрнуто на 90°. Обведите нужный текст.');
    }
    rotateLeft.addEventListener('click', function () { turn(-1); });
    rotateRight.addEventListener('click', function () { turn(1); });
    fullImage.addEventListener('click', function () { resetCrop(); message('Будет распознано всё фото.'); });
    function point(event, unbounded) {
      var rect = surface.getBoundingClientRect();
      var p = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
      return unbounded ? p : { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
    }
    surface.addEventListener('pointerdown', function (event) {
      if (!image || busy || loading || (event.pointerType === 'mouse' && event.button !== 0) || drag) return;
      event.preventDefault(); surface.focus({ preventScroll: true });
      var corner = event.target.getAttribute('data-corner');
      drag = { id: event.pointerId, start: point(event, event.target.hasAttribute('data-rotate')), original: crop ? Object.assign({}, crop) : null, mode: event.target.hasAttribute('data-rotate') ? 'rotate' : corner || (crop && regionBox.contains(event.target) ? 'move' : 'new') };
      surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener('pointermove', function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      var p = point(event, drag.mode !== 'new'), original = drag.original, dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (drag.mode === 'rotate') {
        var size = geometry(), cx = original.x + original.width / 2, cy = original.y + original.height / 2;
        var from = Math.atan2((drag.start.y - cy) * size.height, (drag.start.x - cx) * size.width);
        var to = Math.atan2((p.y - cy) * size.height, (p.x - cx) * size.width);
        crop = fitCrop(Object.assign({}, original, { angle: normalizedAngle((original.angle || 0) + (to - from) * 180 / Math.PI) }));
      } else if (drag.mode === 'move') {
        crop = fitCrop(Object.assign({}, original, { x: original.x + dx, y: original.y + dy }));
      } else if (drag.mode !== 'new') {
        var size = geometry(), radians = (original.angle || 0) * Math.PI / 180;
        var center = { x: (original.x + original.width / 2) * size.width, y: (original.y + original.height / 2) * size.height };
        var px = p.x * size.width - center.x, py = p.y * size.height - center.y;
        var local = { x: px * Math.cos(radians) + py * Math.sin(radians), y: -px * Math.sin(radians) + py * Math.cos(radians) };
        var anchor = { x: (drag.mode.indexOf('w') !== -1 ? 1 : -1) * original.width * size.width / 2, y: (drag.mode.indexOf('n') !== -1 ? 1 : -1) * original.height * size.height / 2 };
        var mx = (anchor.x + local.x) / 2, my = (anchor.y + local.y) / 2;
        var width = Math.abs(local.x - anchor.x), height = Math.abs(local.y - anchor.y);
        crop = fitCrop({ x: (center.x + mx * Math.cos(radians) - my * Math.sin(radians) - width / 2) / size.width, y: (center.y + mx * Math.sin(radians) + my * Math.cos(radians) - height / 2) / size.height, width: width / size.width, height: height / size.height, angle: original.angle || 0 });
      } else {
        var anchor = drag.mode === 'new' ? drag.start : { x: original.x + (drag.mode.indexOf('w') !== -1 ? original.width : 0), y: original.y + (drag.mode.indexOf('n') !== -1 ? original.height : 0) };
        crop = { x: Math.min(anchor.x, p.x), y: Math.min(anchor.y, p.y), width: Math.abs(p.x - anchor.x), height: Math.abs(p.y - anchor.y) };
      }
      renderRegion();
    });
    function finishDrag(event) {
      if (!drag || drag.id !== event.pointerId) return;
      if (event.type === 'pointercancel' || !crop || crop.width * preview.width < 8 || crop.height * preview.height < 8) crop = drag.original;
      drag = null;
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
      renderRegion();
    }
    surface.addEventListener('pointerup', finishDrag);
    surface.addEventListener('pointercancel', finishDrag);
    surface.addEventListener('keydown', function (event) {
      if (!image || busy || loading) return;
      if (event.key === 'Escape') { event.preventDefault(); resetCrop(); return; }
      if (event.key === 'Enter' && !crop) { event.preventDefault(); crop = { x: .1, y: .25, width: .8, height: .5 }; renderRegion(); return; }
      if (!crop || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) === -1) return;
      event.preventDefault();
      var horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight', delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -.01 : .01;
      var axis = horizontal ? 'x' : 'y', dimension = horizontal ? 'width' : 'height';
      if (event.shiftKey) crop[dimension] = Math.max(.02, crop[dimension] + delta);
      else crop[axis] += delta;
      crop = fitCrop(crop);
      renderRegion();
    });

    function message(text, error) { status.textContent = text; status.classList.toggle('is-error', !!error); }
    function clearRecognized() { alternatives.hidden = true; alternativeButtons.replaceChildren(); lastRecognition = null; }
    function showAlternatives(candidates) {
      var seen = new Set([result.value.replace(/\s/g, '')]);
      candidates.forEach(function (candidate) {
        var key = candidate.text.replace(/\s/g, '');
        if ((!candidate.dictionary && candidate.confidence < 20) || seen.has(key)) return;
        seen.add(key);
        var button = document.createElement('button'); button.type = 'button'; button.className = 'lc-ocr-button'; button.textContent = candidate.text;
        if (candidate.dictionary) button.title = 'Подсказка из ваших проверенных названий';
        button.addEventListener('click', function () { if (busy) return; result.value = candidate.text; message('Выбран вариант. Сверьте символы с фотографией.'); buttons(); });
        alternativeButtons.appendChild(button);
      });
      alternatives.hidden = !alternativeButtons.children.length;
    }
    function buttons() {
      start.disabled = busy || loading || !image;
      clear.disabled = busy || (!loading && !image && !result.value);
      input.disabled = busy; drop.setAttribute('aria-disabled', String(busy));
      language.disabled = busy || isHandwriting(); kind.disabled = busy || savingExample;
      handwritingHelp.hidden = kind.value === 'printed'; learning.hidden = !isHandwriting() && !lastRecognition; cancel.hidden = !busy;
      handwritingHelp.textContent = kind.value === 'auto' ? 'Тип выбирается автоматически. Обведите нужный текст; в таблице — строку или один столбец. Рукопись может читаться с ошибками: сверяйте результат.' : kind.value === 'handwriting-code' ? 'Коды латиницей и цифрами. Выделите одну строку или столбец. Знак ? обозначает непрочитанный символ: его нужно исправить по фото.' : 'Выделите строку или один столбец таблицы. Обработка выполняется на этом устройстве. Рукопись ещё может читаться с ошибками — сверяйте результат.';
      vocabulary.disabled = busy; vocabulary.closest('label').hidden = kind.value === 'handwriting-code' || lastRecognition && lastRecognition.kind === 'code';
      saveExample.disabled = !canSaveExample(); exportExamples.disabled = busy || savingExample || !exampleCount;
      exportExamples.textContent = 'Скачать примеры · ' + exampleCount;
      rotateLeft.disabled = rotateRight.disabled = busy || loading || !image;
      singleLine.disabled = busy;
      fitPhoto();
      surface.setAttribute('aria-disabled', String(busy || loading));
      renderRegion();
      copy.disabled = busy || !result.value.trim() || unresolvedCode(); result.readOnly = busy;
      card.setAttribute('aria-busy', String(busy));
    }
    async function selectFile(file) {
      if (!file || busy) return;
      if (!file.type.startsWith('image/')) { message('Выберите фотографию в формате JPG, PNG или WebP.', true); return; }
      if (file.size > 20 * 1024 * 1024) { message('Файл больше 20 МБ. Выберите фотографию поменьше.', true); return; }
      setExpanded(true, false);
      var id = ++selection, url = URL.createObjectURL(file), decoded = new Image();
      loading = true; buttons();
      try {
        await new Promise(function (resolve, reject) { decoded.onload = resolve; decoded.onerror = reject; decoded.src = url; });
        if (id !== selection) { URL.revokeObjectURL(url); return; }
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        image = decoded; sourceFile = file; imageUrl = url; quarterTurns = 0; crop = null; drag = null; zoom = 1;
        imageBox.hidden = false; renderPhoto();
        stage.scrollLeft = stage.scrollTop = 0;
        card.querySelector('.lc-ocr-filename').textContent = file.name || 'Скриншот';
        result.value = ''; progress.hidden = true; clearRecognized();
        message('Фотография готова. Поверните её при необходимости и обведите нужный текст.'); buttons();
      } catch (error) {
        URL.revokeObjectURL(url);
        if (id === selection) message('Не удалось открыть фото. Попробуйте JPG, PNG или WebP.', true);
      } finally {
        if (id === selection) { loading = false; buttons(); }
      }
    }
    drop.addEventListener('click', function (event) { if (event.target !== input && !busy) input.click(); });
    drop.addEventListener('keydown', function (event) {
      if ((event.key === 'Enter' || event.key === ' ') && !busy) { event.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () { selectFile(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (name) {
      card.addEventListener(name, function (event) { event.preventDefault(); if (!busy) drop.classList.add('is-dragging'); });
    });
    card.addEventListener('dragleave', function (event) { if (!card.contains(event.relatedTarget)) drop.classList.remove('is-dragging'); });
    card.addEventListener('drop', function (event) { event.preventDefault(); drop.classList.remove('is-dragging'); selectFile(event.dataTransfer.files[0]); });
    card.addEventListener('paste', function (event) {
      var item = Array.from(event.clipboardData.items).find(function (entry) { return entry.type.startsWith('image/'); });
      if (item && !busy) { event.preventDefault(); selectFile(item.getAsFile()); }
    });
    clear.addEventListener('click', function () {
      if (busy) return;
      selection++; loading = false; image = null; if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = null; sourceFile = null; crop = null; drag = null; quarterTurns = 0; zoom = 1; preview.width = preview.height = 1;
      imageBox.hidden = true; result.value = ''; progress.hidden = true; clearRecognized();
      message('Загрузите фото или вставьте скриншот: Ctrl+V.'); buttons();
    });
    result.addEventListener('input', buttons);
    singleLine.addEventListener('change', buttons);
    kind.addEventListener('change', function () {
      if (window.__lcHandwriting) window.__lcHandwriting.cancel();
      singleLine.checked = kind.value !== 'handwriting-text'; result.value = ''; clearRecognized(); buttons();
      message(kind.value === 'auto' ? 'Автовыбор включён. Обведите нужный текст или распознайте штрихкод на всём фото.' : isHandwriting() ? 'Выделите строку или столбец. Модель рукописи загружается при первом распознавании и сохраняется на устройстве.' : 'Обведите нужный текст или штрихкод.');
    });
    var stopRecognition = null;
    cancel.addEventListener('click', function () { if (stopRecognition) stopRecognition(); if (window.__lcHandwriting) window.__lcHandwriting.cancel(); });
    if (window.__lcHandwriting) window.__lcHandwriting.countExamples().then(function (count) { exampleCount = count; buttons(); }).catch(function () {});
    saveExample.addEventListener('click', async function () {
      if (!canSaveExample()) return;
      savingExample = true; buttons();
      try { exampleCount = await window.__lcHandwriting.saveExample(lastRecognition.canvas, result.value, lastRecognition.kind, lastRecognition.file); message('Проверенный пример сохранён на этом устройстве. Его можно скачать для дообучения.'); }
      catch (error) { message('Не удалось сохранить пример. Проверьте доступ к памяти браузера.', true); }
      finally { savingExample = false; buttons(); }
    });
    exportExamples.addEventListener('click', async function () {
      if (busy || savingExample || !exampleCount) return;
      savingExample = true; buttons();
      try {
        var blob = await window.__lcHandwriting.exportExamples(), url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'handwriting-examples-' + new Date().toISOString().slice(0,10) + '.json'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        message('Примеры скачаны. В файле находятся выбранные фрагменты и проверенный текст.');
      } catch (error) { message('Не удалось скачать примеры.', true); }
      finally { savingExample = false; buttons(); }
    });
    copy.addEventListener('click', async function () {
      if (!result.value.trim() || unresolvedCode()) return;
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard');
        await navigator.clipboard.writeText(result.value);
        message('Текст скопирован.');
      } catch (error) {
        result.focus(); result.select();
        message(document.execCommand('copy') ? 'Текст скопирован.' : 'Текст выделен. Нажмите Ctrl+C или выберите «Копировать».');
      }
    });

    start.addEventListener('click', async function () {
      if (!image || busy || loading) return;
      if (isHandwriting() && !crop) { message('Обведите нужную строку или один столбец таблицы на фотографии.'); surface.focus({ preventScroll: true }); return; }
      clearRecognized(); busy = true; result.value = ''; buttons(); progress.hidden = false; progress.value = 0; message('Подготовка распознавания…');
      var worker = null, timeout = null, expired = false, attempt = 0, attempts = 1, automatic = kind.value === 'auto', usedHandwriting = false;
      var cancelled = false, rejectCancellation;
      var cancellation = new Promise(function (_, reject) { rejectCancellation = reject; });
      cancellation.catch(function () {});
      stopRecognition = function () { cancelled = expired = true; rejectCancellation(new Error('cancelled')); };
      function waitFor(task) { return Promise.race([task, cancellation]); }
      var asLine = !!crop && singleLine.checked;
      var nativeSize = geometry(), nativeRegion = crop || { x: 0, y: 0, width: 1, height: 1 };
      var nativeArea = { x: nativeRegion.x * nativeSize.width, y: nativeRegion.y * nativeSize.height, width: nativeRegion.width * nativeSize.width, height: nativeRegion.height * nativeSize.height, angle: nativeRegion.angle || 0 };
      var hwCanvas = document.createElement('canvas'); drawPhoto(hwCanvas, nativeArea, Math.min(1, 3000 / Math.max(nativeArea.width, nativeArea.height)));
      var hint = automatic && window.__lcPhotoAuto ? window.__lcPhotoAuto.inspect(hwCanvas) : { handwriting: false };
      async function readHandwriting(fallback) {
        if (!crop) { message('Авто: обнаружена возможная рукопись. Обведите нужную строку или один столбец таблицы.'); return; }
        usedHandwriting = true;
        if (!window.__lcHandwriting) throw new Error('handwriting-worker');
        var hwKind = automatic ? 'auto' : kind.value === 'handwriting-code' ? 'code' : 'text';
        var handwriting = await waitFor(window.__lcHandwriting.recognize(hwCanvas, {
          kind: hwKind, singleLine: automatic ? nativeArea.height < nativeArea.width * .25 : asLine, useVocabulary: vocabulary.checked,
          onProgress: function (event) {
            if (cancelled) return;
            if (event.phase === 'download') { progress.value = event.value * 40; message('Загружаю модель рукописи: ' + Math.round(event.value * 100) + '%. Эта загрузка нужна один раз.'); }
            else if (event.phase === 'read') { progress.value = 45 + 55 * (event.current - 1) / event.total; message('Читаю рукопись на этом устройстве: строка ' + event.current + ' из ' + event.total + '…'); }
            else message('Запускаю локальную модель рукописи…');
          }
        }));
        result.value = handwriting.text;
        lastRecognition = { canvas: hwCanvas, kind: handwriting.kind || (hwKind === 'auto' ? 'text' : hwKind), hasCodes: handwriting.hasCodes || hwKind === 'code', file: sourceFile, key: cropKey() };
        showAlternatives(handwriting.alternatives);
        if (fallback && fallback.text) showAlternatives([fallback]);
        var prefix = automatic ? 'Авто: рукопись. ' : '';
        message(prefix + (!result.value ? 'Рукопись не прочитана. Выделите отдельную строку или используйте более чёткое фото.' : unresolvedCode() ? 'Номер прочитан не полностью. Исправьте знаки ? по фотографии перед копированием.' : handwriting.uncertainCode ? 'Есть разные варианты рукописного номера. Сверьте каждый символ с фото, особенно O/0 и B/3. Варианты доступны ниже.' : handwriting.dictionary ? 'Название уточнено по сохранённым примерам. Сверьте его с фото; исходное чтение доступно в вариантах.' : handwriting.lexicon ? 'Близкий вариант выбран по русскому словарю. Сверьте с фото; исходное чтение доступно ниже.' : handwriting.suggestion ? 'Есть подсказка из сохранённых названий. Сравните её с фото и выберите нужный вариант ниже.' : handwriting.partial ? 'Крайние строки обрезаны рамкой. Уточните выделение, чтобы прочитать их целиком.' : fallback ? 'Движки читают по-разному. Сверьте результат с фото; печатный вариант доступен ниже.' : handwriting.lowResolution ? 'Буквы на фото мелкие: сверьте результат, особенно номера.' : 'Проверьте буквы и цифры перед копированием.'));
        progress.value = 100;
      }
      try {
        if (isHandwriting()) { await readHandwriting(); return; }
        if ((automatic || singleLine.checked) && window.__lcScanPhotoBarcodes) {
          message('Читаю штрихкод и проверяю контрольную сумму…');
          var size = geometry(), scanRegion = crop || { x: 0, y: 0, width: 1, height: 1 }, fullPhoto = document.createElement('canvas');
          var scanArea = { x: scanRegion.x * size.width, y: scanRegion.y * size.height, width: scanRegion.width * size.width, height: scanRegion.height * size.height, angle: scanRegion.angle || 0 };
          drawPhoto(fullPhoto, scanArea, Math.min(2, 2400 / Math.max(scanArea.width, scanArea.height)));
          var barcodeTimer, codes = [];
          try {
            codes = await waitFor(Promise.race([window.__lcScanPhotoBarcodes(fullPhoto), new Promise(function (_, reject) { barcodeTimer = setTimeout(function () { reject(new Error('barcode-timeout')); }, 18000); })]));
          } catch (error) { if (cancelled) throw error; /* Если код не читается, используем OCR. */ }
          finally { clearTimeout(barcodeTimer); }
          if (codes.length) {
            if (codes.length === 1) {
              result.value = codes[0].text;
              message((automatic ? 'Авто: штрихкод. ' : '') + (codes[0].checksum ? 'Номер прочитан. Контрольная сумма прошла проверку.' : 'Номер прочитан из штрихкода. Сверьте его с надписью на фото.'));
            } else {
              result.value = ''; showAlternatives(codes);
              message('На фото несколько штрихкодов. Выберите нужный номер ниже или выделите его на фото.');
            }
            return;
          }
          message('Штрихкод не найден. Распознаю выбранный текст…');
        }
        if (automatic && hint.handwriting) { await readHandwriting(); return; }
        var library = await waitFor(loadLibrary());
        /* В режиме номера не подменяем латинские буквы похожими русскими. */
        var languages = asLine && language.value === 'eng+rus' ? ['eng'] : language.value.split('+');
        var workerOptions = {
          workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
          corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
          logger: function (event) {
            if (expired) return;
            var recognizing = event.status === 'recognizing text';
            var percent = Math.round((event.progress || 0) * 100);
            progress.value = recognizing ? 25 + ((Math.max(1, attempt) - 1 + percent / 100) / attempts) * 75 : percent * .25;
            message(recognizing ? (attempts > 1 ? 'Проверяю вариант ' + attempt + ' из ' + attempts + ': ' : 'Распознаю текст: ') + percent + '%' : 'Загружаю распознавание и языки…');
          }
        };
        if (asLine && languages.length === 1 && languages[0] === 'eng') Object.assign(workerOptions, {
          langPath: 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_best@4.1.0',
          gzip: false, cachePath: 'lc-photo-best-4.1.0'
        });
        var creation = library.createWorker(languages, 1, workerOptions, asLine ? { load_system_dawg: '0', load_freq_dawg: '0' } : {});
        /* После тайм-аута поздно созданный worker тоже освобождается. */
        creation.then(function (created) { if (expired) created.terminate(); }, function () {});
        var deadline = new Promise(function (_, reject) {
          timeout = setTimeout(function () { expired = true; reject(new Error('timeout')); }, 120000);
        });
        worker = await waitFor(Promise.race([creation, deadline]));
        var canvas = document.createElement('canvas');
        var size = geometry(), region = crop || { x: 0, y: 0, width: 1, height: 1 };
        var area = { x: region.x * size.width, y: region.y * size.height, width: region.width * size.width, height: region.height * size.height, angle: region.angle || 0 };
        var edge = Math.max(area.width, area.height);
        /* Маленький фрагмент увеличиваем отдельно: детали не теряются при уменьшении всего кадра. */
        var scale = edge < 1800 ? Math.min(4, 1800 / edge) : Math.min(1, 3000 / edge);
        drawPhoto(canvas, area, scale);
        if (crop && window.__lcPhotoOcr) {
          message('Распознаю текст внутри рамки…');
          var reading = await waitFor(Promise.race([window.__lcPhotoOcr.recognize(worker, canvas, {
            exactRegion: true,
            singleLine: asLine,
            onProgress: function (current, total) { attempt = current; attempts = total; }
          }), deadline]));
          var best = reading.best;
          result.value = best && best.confidence >= 35 ? best.text : '';
          showAlternatives(reading.alternatives);
          var ambiguous = reading.disputed;
          message(!result.value ? 'Не удалось надёжно прочитать номер. Выделите строку теснее, без соседних надписей. Попробуйте более чёткое фото.' :
            reading.partial ? 'Распознана только часть выделенной области. Уточните рамку и сверьте номер целиком.' :
            ambiguous ? 'Есть разные варианты номера. Сверьте символы с фотографией; другой вариант можно выбрать ниже.' :
            reading.uncertain ? 'Номер требует проверки. Сверьте каждый символ с фотографией — уверенности распознавания недостаточно.' : 'Готово. Проверьте номер перед копированием.');
        } else {
          await worker.setParameters({ tessedit_pageseg_mode: crop ? (asLine ? '7' : '6') : '3', preserve_interword_spaces: '0' });
          var output = await waitFor(Promise.race([worker.recognize(canvas), deadline]));
          result.value = asLine ? output.data.text.replace(/\s+/g, ' ').trim() : output.data.text.trim();
          message(!result.value ? 'Текст не найден. Выделите нужную строку или выберите более чёткое фото.' : output.data.confidence < 65 ? 'Текст распознан неуверенно. Проверьте символы.' : 'Готово. Проверьте текст и скопируйте его.');
        }
        if (automatic && crop && ((!result.value) || (reading ? !reading.best || reading.best.confidence < 55 : output.data.confidence < 55))) {
          var printed = { text: result.value, confidence: 100 };
          if (worker) { await worker.terminate(); worker = null; }
          clearTimeout(timeout); timeout = null;
          try { await readHandwriting(printed); }
          catch (error) { if (cancelled) throw error; result.value = printed.text; lastRecognition = null; message('Авто: чтение неуверенное. Уточните рамку или выберите тип вручную.'); }
          return;
        }
        if (automatic) message('Авто: печатный текст. ' + status.textContent);
        progress.value = 100;
      } catch (error) {
        if (cancelled || usedHandwriting || isHandwriting()) message(error.message === 'cancelled' ? 'Распознавание остановлено.' :
          error.message === 'handwriting-timeout' ? 'Загрузка или распознавание заняли слишком много времени. Попробуйте ещё раз или выделите меньшую область.' :
          error.message === 'wide-region' || error.message === 'many-lines' ? 'Выделите отдельную строку или один столбец таблицы.' :
          error.message === 'no-handwriting' ? 'В выделении не найдены строки. Уточните рамку.' :
          'Не удалось запустить локальное распознавание. Проверьте загрузку модели и попробуйте ещё раз.', error.message !== 'cancelled');
        else message(error.message === 'timeout' ? 'Распознавание заняло слишком много времени. Выделите меньшую область и попробуйте ещё раз.' : 'Не удалось распознать текст. Проверьте интернет и попробуйте ещё раз.', true);
      } finally {
        clearTimeout(timeout); expired = true; stopRecognition = null;
        if (worker) { try { await worker.terminate(); } catch (error) {} }
        busy = false; progress.hidden = true; buttons();
      }
    });
    buttons();
  }

  var observer = new MutationObserver(function () { if (mount()) observer.disconnect(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (mount()) observer.disconnect();
}());

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
      '<div class="lc-ocr-head"><h3>Текст с фотографии</h3><select class="lc-ocr-language" aria-label="Язык распознавания"><option value="eng+rus">Русский + English</option><option value="eng">English · номера</option><option value="rus">Русский</option></select></div>' +
      '<div class="lc-ocr-body">' +
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
          '<p id="lc-ocr-help" class="lc-ocr-help">Обведите нужный текст мышью или пальцем. Кнопки ↶ / ↷ поворачивают фото на 90°, сохраняя выделение.</p>' +
          '<div class="lc-ocr-stage"><div class="lc-ocr-surface" data-testid="ocr-photo-surface" tabindex="0" role="group" aria-label="Выделение области текста на фотографии" aria-describedby="lc-ocr-help lc-ocr-region-info">' +
            '<canvas class="lc-ocr-canvas" aria-label="Фотография для выделения текста"></canvas>' +
            '<div class="lc-ocr-selection" data-testid="ocr-selection" hidden><span data-corner="nw"></span><span data-corner="ne"></span><span data-corner="sw"></span><span data-corner="se"></span></div>' +
          '</div></div>' +
          '<p id="lc-ocr-region-info" class="lc-ocr-help" role="status" aria-live="polite"></p>' +
          '<label class="lc-ocr-line-option"><input type="checkbox" data-testid="checkbox-ocr-single-line" checked> Номер или штрихкод — результат одной строкой</label>' +
          '<span class="lc-ocr-keyboard-help">С клавиатуры: Enter — выделить центр, стрелки — двигать рамку, Shift + стрелки — менять размер, Esc — всё фото.</span>' +
        '</div>' +
        '<div class="lc-ocr-actions"><button type="button" class="lc-ocr-button lc-ocr-primary" data-testid="button-ocr-recognize" disabled>Распознать текст</button>' +
          '<button type="button" class="lc-ocr-button" data-testid="button-ocr-clear" disabled>Очистить</button></div>' +
        '<p class="lc-ocr-status" role="status" aria-live="polite">Фото обрабатывается в браузере. При первом запуске потребуется интернет.</p>' +
        '<progress class="lc-ocr-progress" max="100" value="0" hidden aria-label="Ход распознавания"></progress>' +
        '<label class="lc-ocr-label" for="lc-ocr-result">Распознанный текст</label>' +
        '<textarea id="lc-ocr-result" data-testid="input-ocr-result" class="lc-ocr-result" rows="5" placeholder="Здесь появится текст. Его можно исправить перед копированием."></textarea>' +
        '<div class="lc-ocr-alternatives" hidden><span class="lc-ocr-help">Другие варианты — нажмите, чтобы выбрать:</span><div></div></div>' +
        '<button type="button" class="lc-ocr-button lc-ocr-copy" data-testid="button-ocr-copy" disabled>Копировать текст</button>' +
      '</div>';
    previous.replaceWith(card);
    column.classList.add('lc-workspace-column');
    connect(card);
    return true;
  }

  function connect(card) {
    var drop = card.querySelector('.lc-ocr-drop'), input = card.querySelector('.lc-ocr-file');
    var imageBox = card.querySelector('.lc-ocr-image'), preview = imageBox.querySelector('canvas');
    var surface = card.querySelector('.lc-ocr-surface'), regionBox = card.querySelector('.lc-ocr-selection');
    var stage = card.querySelector('.lc-ocr-stage'), zoomIn = card.querySelector('[data-testid="button-ocr-zoom-in"]');
    var zoomOut = card.querySelector('[data-testid="button-ocr-zoom-out"]'), zoomFit = card.querySelector('[data-testid="button-ocr-zoom-fit"]');
    var zoomValue = card.querySelector('.lc-ocr-zoom-value');
    var regionInfo = card.querySelector('#lc-ocr-region-info');
    var fullImage = card.querySelector('[data-testid="button-ocr-full-image"]');
    var rotateLeft = card.querySelector('[data-testid="button-ocr-rotate-left"]'), rotateRight = card.querySelector('[data-testid="button-ocr-rotate-right"]');
    var singleLine = card.querySelector('[data-testid="checkbox-ocr-single-line"]');
    var alternatives = card.querySelector('.lc-ocr-alternatives'), alternativeButtons = alternatives.querySelector('div');
    var result = card.querySelector('.lc-ocr-result'), status = card.querySelector('.lc-ocr-status');
    var progress = card.querySelector('progress'), start = card.querySelector('[data-testid="button-ocr-recognize"]');
    var language = card.querySelector('.lc-ocr-language');
    var clear = card.querySelector('[data-testid="button-ocr-clear"]'), copy = card.querySelector('[data-testid="button-ocr-copy"]');
    var image = null, imageUrl = null, busy = false, loading = false, selection = 0;
    var quarterTurns = 0, crop = null, drag = null, zoom = 1;

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
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(canvas.width / area.width, canvas.height / area.height);
      ctx.translate(size.width / 2 - area.x, size.height / 2 - area.y);
      ctx.rotate(size.radians);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    }
    function renderRegion() {
      regionBox.hidden = !crop;
      if (crop) {
        regionBox.style.left = crop.x * 100 + '%'; regionBox.style.top = crop.y * 100 + '%';
        regionBox.style.width = crop.width * 100 + '%'; regionBox.style.height = crop.height * 100 + '%';
        var size = geometry();
        regionInfo.textContent = 'Выбрана область: ' + Math.round(crop.width * size.width) + ' × ' + Math.round(crop.height * size.height) + ' пикс. Читаем только внутри рамки.';
      } else regionInfo.textContent = singleLine.checked ? 'Сначала проверим штрихкоды на фото. Нужный номер можно выделить рамкой.' : 'Будет распознано всё фото. Обведите нужный текст, чтобы убрать лишний фон.';
      start.textContent = crop ? 'Распознать выделенное' : 'Распознать текст';
      fullImage.disabled = busy || loading || !crop;
    }
    function renderPhoto() {
      if (!image) return;
      var size = geometry();
      drawPhoto(preview, { x: 0, y: 0, width: size.width, height: size.height }, Math.min(1, 1600 / Math.max(size.width, size.height)));
      /* Вписываем фото целиком, сохраняя одинаковый масштаб по обеим осям. */
      surface.style.aspectRatio = preview.width + ' / ' + preview.height;
      fitPhoto();
      renderRegion();
    }
    function fitPhoto() {
      zoomValue.textContent = Math.round(zoom * 100) + '%';
      zoomIn.disabled = busy || loading || !image || zoom >= 4;
      zoomOut.disabled = zoomFit.disabled = busy || loading || !image || zoom <= 1;
      if (!image) return;
      var style = getComputedStyle(stage), available = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      surface.style.width = Math.max(20, Math.min(available, 900, 460 * preview.width / preview.height)) * zoom + 'px';
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
    function turn(direction) {
      if (!image || busy || loading) return;
      /* Рамка поворачивается вместе с фотографией: повторно обводить текст не нужно. */
      if (crop) crop = direction > 0 ?
        { x: Math.max(0, 1 - crop.y - crop.height), y: crop.x, width: crop.height, height: crop.width } :
        { x: crop.y, y: Math.max(0, 1 - crop.x - crop.width), width: crop.height, height: crop.width };
      quarterTurns = (quarterTurns + direction + 4) % 4;
      drag = null; renderPhoto();
      message(crop ? 'Поворот на 90°. Выделение сохранено. Когда текст расположен горизонтально, нажмите «Распознать выделенное».' : 'Фото повёрнуто на 90°. Обведите нужный текст.');
    }
    rotateLeft.addEventListener('click', function () { turn(-1); });
    rotateRight.addEventListener('click', function () { turn(1); });
    fullImage.addEventListener('click', function () { resetCrop(); message('Будет распознано всё фото.'); });
    function point(event) {
      var rect = surface.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    }
    surface.addEventListener('pointerdown', function (event) {
      if (!image || busy || loading || (event.pointerType === 'mouse' && event.button !== 0) || drag) return;
      event.preventDefault(); surface.focus({ preventScroll: true });
      var corner = event.target.getAttribute('data-corner');
      drag = { id: event.pointerId, start: point(event), original: crop ? Object.assign({}, crop) : null, mode: corner || (crop && regionBox.contains(event.target) ? 'move' : 'new') };
      surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener('pointermove', function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      var p = point(event), original = drag.original, dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (drag.mode === 'move') {
        crop = Object.assign({}, original, { x: Math.max(0, Math.min(1 - original.width, original.x + dx)), y: Math.max(0, Math.min(1 - original.height, original.y + dy)) });
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
      if (event.shiftKey) crop[dimension] = Math.max(.02, Math.min(1 - crop[axis], crop[dimension] + delta));
      else crop[axis] = Math.max(0, Math.min(1 - crop[dimension], crop[axis] + delta));
      renderRegion();
    });

    function message(text, error) { status.textContent = text; status.classList.toggle('is-error', !!error); }
    function clearRecognized() { alternatives.hidden = true; alternativeButtons.replaceChildren(); }
    function showAlternatives(candidates) {
      var seen = new Set([result.value.replace(/\s/g, '')]);
      candidates.forEach(function (candidate) {
        var key = candidate.text.replace(/\s/g, '');
        if (candidate.confidence < 20 || seen.has(key)) return;
        seen.add(key);
        var button = document.createElement('button'); button.type = 'button'; button.className = 'lc-ocr-button'; button.textContent = candidate.text;
        button.addEventListener('click', function () { if (busy) return; result.value = candidate.text; message('Выбран вариант. Сверьте символы с фотографией.'); buttons(); });
        alternativeButtons.appendChild(button);
      });
      alternatives.hidden = !alternativeButtons.children.length;
    }
    function buttons() {
      start.disabled = busy || loading || !image;
      clear.disabled = busy || (!loading && !image && !result.value);
      input.disabled = busy; drop.setAttribute('aria-disabled', String(busy));
      language.disabled = busy;
      rotateLeft.disabled = rotateRight.disabled = busy || loading || !image;
      singleLine.disabled = busy;
      fitPhoto();
      surface.setAttribute('aria-disabled', String(busy || loading));
      renderRegion();
      copy.disabled = busy || !result.value.trim(); result.readOnly = busy;
      card.setAttribute('aria-busy', String(busy));
    }
    async function selectFile(file) {
      if (!file || busy) return;
      if (!file.type.startsWith('image/')) { message('Выберите фотографию в формате JPG, PNG или WebP.', true); return; }
      if (file.size > 20 * 1024 * 1024) { message('Файл больше 20 МБ. Выберите фотографию поменьше.', true); return; }
      var id = ++selection, url = URL.createObjectURL(file), decoded = new Image();
      loading = true; buttons();
      try {
        await new Promise(function (resolve, reject) { decoded.onload = resolve; decoded.onerror = reject; decoded.src = url; });
        if (id !== selection) { URL.revokeObjectURL(url); return; }
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        image = decoded; imageUrl = url; quarterTurns = 0; crop = null; drag = null; zoom = 1;
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
      imageUrl = null; crop = null; drag = null; quarterTurns = 0; zoom = 1; preview.width = preview.height = 1;
      imageBox.hidden = true; result.value = ''; progress.hidden = true; clearRecognized();
      message('Загрузите фото или вставьте скриншот: Ctrl+V.'); buttons();
    });
    result.addEventListener('input', buttons);
    singleLine.addEventListener('change', buttons);
    copy.addEventListener('click', async function () {
      if (!result.value.trim()) return;
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
      busy = true; result.value = ''; buttons(); clearRecognized(); progress.hidden = false; progress.value = 0; message('Подготовка распознавания…');
      var worker = null, timeout = null, expired = false, attempt = 0, attempts = 1;
      var asLine = !!crop && singleLine.checked;
      try {
        if (singleLine.checked && window.__lcScanPhotoBarcodes) {
          message('Читаю штрихкод и проверяю контрольную сумму…');
          var size = geometry(), scanRegion = crop || { x: 0, y: 0, width: 1, height: 1 }, fullPhoto = document.createElement('canvas');
          var scanArea = { x: scanRegion.x * size.width, y: scanRegion.y * size.height, width: scanRegion.width * size.width, height: scanRegion.height * size.height };
          drawPhoto(fullPhoto, scanArea, Math.min(2, 2400 / Math.max(scanArea.width, scanArea.height)));
          var barcodeTimer, codes = [];
          try {
            codes = await Promise.race([window.__lcScanPhotoBarcodes(fullPhoto), new Promise(function (_, reject) { barcodeTimer = setTimeout(function () { reject(new Error('barcode-timeout')); }, 18000); })]);
          } catch (error) { /* Если код не читается или библиотека недоступна, используем OCR. */ }
          finally { clearTimeout(barcodeTimer); }
          if (codes.length) {
            if (codes.length === 1) {
              result.value = codes[0].text;
              message('Номер прочитан из штрихкода. Контрольная сумма прошла проверку.');
            } else {
              result.value = ''; showAlternatives(codes);
              message('На фото несколько штрихкодов. Выберите нужный номер ниже или выделите его на фото.');
            }
            return;
          }
          message('Штрихкод не найден. Распознаю выбранный текст…');
        }
        var library = await loadLibrary();
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
        worker = await Promise.race([creation, deadline]);
        var canvas = document.createElement('canvas');
        var size = geometry(), region = crop || { x: 0, y: 0, width: 1, height: 1 };
        var area = { x: region.x * size.width, y: region.y * size.height, width: region.width * size.width, height: region.height * size.height };
        var edge = Math.max(area.width, area.height);
        /* Маленький фрагмент увеличиваем отдельно: детали не теряются при уменьшении всего кадра. */
        var scale = edge < 1800 ? Math.min(4, 1800 / edge) : Math.min(1, 3000 / edge);
        drawPhoto(canvas, area, scale);
        if (crop && window.__lcPhotoOcr) {
          message('Распознаю текст внутри рамки…');
          var reading = await Promise.race([window.__lcPhotoOcr.recognize(worker, canvas, {
            exactRegion: true,
            singleLine: asLine,
            onProgress: function (current, total) { attempt = current; attempts = total; }
          }), deadline]);
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
          var output = await Promise.race([worker.recognize(canvas), deadline]);
          result.value = asLine ? output.data.text.replace(/\s+/g, ' ').trim() : output.data.text.trim();
          message(!result.value ? 'Текст не найден. Выделите нужную строку или выберите более чёткое фото.' : output.data.confidence < 65 ? 'Текст распознан неуверенно. Проверьте символы.' : 'Готово. Проверьте текст и скопируйте его.');
        }
        progress.value = 100;
      } catch (error) {
        message(error.message === 'timeout' ? 'Распознавание заняло слишком много времени. Выделите меньшую область и попробуйте ещё раз.' : 'Не удалось распознать текст. Проверьте интернет и попробуйте ещё раз.', true);
      } finally {
        clearTimeout(timeout); expired = true;
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

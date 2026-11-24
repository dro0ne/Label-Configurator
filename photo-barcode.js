/* Чтение контрольных сумм штрихкодов выполняется в браузере. */
(function () {
  'use strict';
  var library = null;
  function load() {
    if (window.ZXingWASM) return Promise.resolve(window.ZXingWASM);
    if (!library) library = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), timer = setTimeout(fail, 12000);
      function fail() { clearTimeout(timer); script.remove(); library = null; reject(new Error('barcode-library')); }
      script.src = 'https://cdn.jsdelivr.net/npm/zxing-wasm@2.2.1/dist/iife/reader/index.js';
      script.onload = function () { clearTimeout(timer); if (window.ZXingWASM) resolve(window.ZXingWASM); else fail(); };
      script.onerror = fail; document.head.appendChild(script);
    });
    return library;
  }
  function relevant(box, selection) {
    if (!selection) return true;
    var horizontal = box.width >= box.height;
    var overlap = horizontal ? Math.min(box.x + box.width, selection.x + selection.width) - Math.max(box.x, selection.x) : Math.min(box.y + box.height, selection.y + selection.height) - Math.max(box.y, selection.y);
    var length = horizontal ? Math.min(box.width, selection.width) : Math.min(box.height, selection.height);
    var distance = horizontal ? Math.max(0, box.y - selection.y - selection.height, selection.y - box.y - box.height) : Math.max(0, box.x - selection.x - selection.width, selection.x - box.x - box.width);
    return overlap > length * .45 && distance < Math.max(horizontal ? selection.height * 2 : selection.width * 2, 35);
  }
  async function scan(source, selection) {
    if (!window.__lcPhotoOcr) return [];
    var reader = await load(), images = window.__lcPhotoOcr.barcodeImages(source, selection), found = [];
    /* Сначала исходные пиксели: обработка белого текста на тёмной наклейке
       не должна уничтожать уже читаемый штрихкод. */
    images.unshift({ canvas: source, point: function (point) { return point; } });
    for (var i = 0; i < images.length; i++) {
      var image = images[i], ctx = image.canvas.getContext('2d'), pixels = ctx.getImageData(0, 0, image.canvas.width, image.canvas.height);
      for (var pass = 0; pass < 3; pass++) {
        var input = pixels;
        if (pass === 2) {
          input = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
          for (var at = 0; at < input.data.length; at += 4) input.data[at] = input.data[at + 1] = input.data[at + 2] = input.data[at] < 200 ? 0 : 255;
        }
        var before = found.length;
        var results = await reader.readBarcodes(input, { formats: ['Code128', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code93', 'Code39'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: false, binarizer: pass === 1 ? 'GlobalHistogram' : 'LocalAverage', maxNumberOfSymbols: 8 });
        results.forEach(function (result) {
          if (!result.text || result.error || found.some(function (r) { return r.text === result.text; })) return;
          var corners = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map(function (key) { return image.point(result.position[key]); });
          var left = Math.min.apply(null, corners.map(function (p) { return p.x; })), top = Math.min.apply(null, corners.map(function (p) { return p.y; }));
          var right = Math.max.apply(null, corners.map(function (p) { return p.x; })), bottom = Math.max.apply(null, corners.map(function (p) { return p.y; }));
          if (!relevant({ x: left, y: top, width: right - left, height: bottom - top }, selection)) return;
          var points = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map(function (key) { return result.position[key]; });
          var x = Math.max(0, Math.floor(Math.min.apply(null, points.map(function (p) { return p.x; }))) - 12), y = Math.max(0, Math.floor(Math.min.apply(null, points.map(function (p) { return p.y; }))) - 12);
          var width = Math.min(image.canvas.width - x, Math.ceil(Math.max.apply(null, points.map(function (p) { return p.x; }))) - x + 12), height = Math.min(image.canvas.height - y, Math.ceil(Math.max.apply(null, points.map(function (p) { return p.y; }))) - y + 12);
          var preview = document.createElement('canvas'); preview.width = Math.max(1, width); preview.height = Math.max(1, height); preview.getContext('2d').drawImage(image.canvas, x, y, width, height, 0, 0, width, height);
          found.push({ text: result.text, format: result.format, canvas: preview, confidence: 100,
            checksum: ['Code128', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code93'].indexOf(result.format) !== -1 });
        });
        if (found.length > before) break;
      }
    }
    return found;
  }
  window.__lcScanPhotoBarcodes = scan;
}());

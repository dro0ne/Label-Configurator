/* Подготовка строк для OCR. Все пиксели обрабатываются локально. */
(function () {
  'use strict';
  function canvas(width, height) {
    var result = document.createElement('canvas');
    result.width = Math.max(1, Math.round(width)); result.height = Math.max(1, Math.round(height));
    return result;
  }
  function median(values) { values = values.slice().sort(function (a, b) { return a - b; }); return values[Math.floor(values.length / 2)] || 0; }
  function pixels(source) {
    var data = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
    var gray = new Uint8Array(source.width * source.height), histogram = new Uint32Array(256);
    for (var i = 0; i < gray.length; i++) { var value = Math.round(data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114); gray[i] = value; histogram[value]++; }
    return { gray: gray, histogram: histogram };
  }
  function threshold(histogram) {
    var total = 0, sum = 0, left = 0, weight = 0, best = -1, chosen = 127;
    for (var i = 0; i < 256; i++) { total += histogram[i]; sum += i * histogram[i]; }
    for (var t = 0; t < 255; t++) {
      weight += histogram[t]; left += t * histogram[t];
      if (!weight || weight === total) continue;
      var difference = left / weight - (sum - left) / (total - weight);
      var score = weight * (total - weight) * difference * difference;
      if (score > best) { best = score; chosen = t; }
    }
    return chosen;
  }
  function percentile(histogram, fraction) {
    var total = histogram.reduce(function (sum, value) { return sum + value; }, 0), seen = 0;
    for (var i = 0; i < 256; i++) { seen += histogram[i]; if (seen >= total * fraction) return i; }
    return 255;
  }
  function skew(source) {
    var scale = Math.min(1, 650 / source.width, 350 / source.height), small = canvas(source.width * scale, source.height * scale);
    small.getContext('2d').drawImage(source, 0, 0, small.width, small.height);
    var p = pixels(small), cut = threshold(p.histogram), points = [], w = small.width, h = small.height;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x += 2) if (p.gray[y * w + x] <= cut) points.push(x, y);
    if (points.length < 40) return 0;
    function score(degrees) {
      var radians = degrees * Math.PI / 180, sine = Math.sin(radians), cosine = Math.cos(radians), rows = new Uint32Array(2 * (w + h) + 3), sum = 0;
      for (var i = 0; i < points.length; i += 2) rows[Math.round(points[i + 1] * cosine - points[i] * sine) + w + h]++;
      for (var row = 1; row < rows.length; row++) { var difference = rows[row] - rows[row - 1]; sum += difference * difference; }
      return sum;
    }
    var baseline = score(0), best = baseline, angle = 0;
    for (var degree = -18; degree <= 18; degree++) { var value = score(degree); if (value > best) { best = value; angle = degree; } }
    var rough = angle;
    for (var fine = rough - .8; fine <= rough + .8; fine += .2) { var fineScore = score(fine); if (fineScore > best) { best = fineScore; angle = fine; } }
    if (best > baseline * 1.025 && Math.abs(angle) > 1) return angle;
    /* У наклейки без рамки проекция полос может скрыть наклон строки.
       Тогда используем направление контрастных краёв, сводя горизонталь
       и вертикаль к одной оси. На ровном тексте максимум остаётся около 0°. */
    var directions = new Float64Array(97), total = 0;
    for (var y = 2; y < h - 2; y++) for (var x = 2; x < w - 2; x++) {
      var gx = p.gray[y * w + x + 1] - p.gray[y * w + x - 1];
      var gy = p.gray[(y + 1) * w + x] - p.gray[(y - 1) * w + x];
      var magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude < 30) continue;
      var direction = ((Math.atan2(gy, gx) * 180 / Math.PI + 225) % 90) - 45;
      if (Math.abs(direction) > 24) continue;
      directions[Math.round((direction + 24) * 2)] += magnitude; total += magnitude;
    }
    var strongest = 0, peak = 48;
    for (var i = 2; i < directions.length - 2; i++) {
      var strength = directions[i - 2] + directions[i - 1] + directions[i] + directions[i + 1] + directions[i + 2];
      if (strength > strongest) { strongest = strength; peak = i; }
    }
    if (!total || strongest / total < .14) return 0;
    var weighted = 0, weight = 0;
    for (var i = Math.max(0, peak - 3); i <= Math.min(directions.length - 1, peak + 3); i++) { weighted += (i / 2 - 24) * directions[i]; weight += directions[i]; }
    var fallback = weight ? weighted / weight : 0;
    return Math.abs(fallback) > 2 ? fallback : 0;
  }
  function prepare(source, keepAllWords) {
    var scale = Math.min(1, 1600 / source.width, 1000 / source.height), raw = canvas(source.width * scale, source.height * scale);
    raw.getContext('2d').drawImage(source, 0, 0, raw.width, raw.height);
    /* Порог считается до добавления белых полей, иначе серая наклейка может стать сплошным чёрным пятном. */
    var original = pixels(raw), cut = threshold(original.histogram), low = Math.min(percentile(original.histogram, .05), cut * .6), high = Math.max(low + 30, percentile(original.histogram, .85));
    var angle = skew(raw), radians = -angle * Math.PI / 180;
    var rotated = canvas(raw.width * Math.abs(Math.cos(radians)) + raw.height * Math.abs(Math.sin(radians)), raw.width * Math.abs(Math.sin(radians)) + raw.height * Math.abs(Math.cos(radians)));
    var context = rotated.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, rotated.width, rotated.height);
    context.translate(rotated.width / 2, rotated.height / 2); context.rotate(radians); context.drawImage(raw, -raw.width / 2, -raw.height / 2);
    var data = pixels(rotated), w = rotated.width, h = rotated.height, binary = new Uint8Array(w * h), removed = new Uint8Array(w * h);
    for (var i = 0; i < binary.length; i++) binary[i] = data.gray[i] <= cut ? 1 : 0;
    /* Удаляем длинные горизонтальные линии рамки перед поиском букв. */
    var minimumRun = Math.max(30, Math.round(w * .22));
    for (var y = 0; y < h; y++) {
      var begin = -1;
      for (var x = 0; x <= w; x++) {
        if (x < w && binary[y * w + x]) { if (begin < 0) begin = x; }
        else if (begin >= 0) {
          if (x - begin >= minimumRun) for (var yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) for (var xx = Math.max(0, begin - 1); xx <= Math.min(w - 1, x); xx++) removed[yy * w + xx] = 1;
          begin = -1;
        }
      }
    }
    for (var k = 0; k < binary.length; k++) if (removed[k]) binary[k] = 0;
    var labels = new Int32Array(w * h), queue = new Int32Array(w * h), components = [], id = 0;
    for (var start = 0; start < binary.length; start++) {
      if (!binary[start] || labels[start]) continue;
      id++; var head = 0, tail = 1, minX = w, minY = h, maxX = 0, maxY = 0;
      queue[0] = start; labels[start] = id;
      while (head < tail) {
        var position = queue[head++], py = Math.floor(position / w), px = position - py * w;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = px + dx, ny = py + dy, neighbor = ny * w + nx;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && binary[neighbor] && !labels[neighbor]) { labels[neighbor] = id; queue[tail++] = neighbor; }
        }
      }
      var cw = maxX - minX + 1, ch = maxY - minY + 1, fill = tail / (cw * ch);
      var boundary = minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1;
      if (!(boundary && tail > w * h * .01) && tail >= 15 && ch >= Math.max(8, h * .025) && ch < h * .8 && cw >= 3 && cw < w * .7 && cw / ch > .18 && cw / ch < 2.5 && fill > .12)
        components.push({ id: id, x: minX, y: minY, width: cw, height: ch, fill: fill });
    }
    var groups = [];
    components.sort(function (a, b) { return a.y + a.height / 2 - b.y - b.height / 2; }).forEach(function (part) {
      var center = part.y + part.height / 2;
      var group = groups.find(function (g) {
        var height = median(g.map(function (p) { return p.height; }));
        return part.height > height * .55 && part.height < height * 1.8 && Math.abs(median(g.map(function (p) { return p.y + p.height / 2; })) - center) < Math.max(part.height, height) * .42;
      });
      if (group) group.push(part); else groups.push([part]);
    });
    var words = [];
    groups.forEach(function (group) {
      var height = median(group.map(function (part) { return part.height; })), split = [];
      group = group.filter(function (part) { return part.height >= height * .55; });
      group.sort(function (a, b) { return a.x - b.x; }).forEach(function (part) {
        var last = split[split.length - 1];
        if (!last || part.x - Math.max.apply(null, last.map(function (p) { return p.x + p.width; })) > height * .38) split.push([part]); else last.push(part);
      });
      split.forEach(function (word) {
        if (word.length < 3) return;
        var left = Math.min.apply(null, word.map(function (p) { return p.x; })), top = Math.min.apply(null, word.map(function (p) { return p.y; }));
        var right = Math.max.apply(null, word.map(function (p) { return p.x + p.width; })), bottom = Math.max.apply(null, word.map(function (p) { return p.y + p.height; }));
        var averageFill = word.reduce(function (sum, p) { return sum + p.fill; }, 0) / word.length;
        var score = word.length + Math.min(20, (right - left) / height) * .5 - Math.abs((top + bottom) / 2 - h / 2) / h * 2 - Math.max(0, averageFill - .6) * 20;
        words.push({ parts: word, x: left, y: top, width: right - left, height: bottom - top, score: score, fill: averageFill });
      });
    });
    words.sort(function (a, b) { return b.score - a.score; });
    function image(area, method) {
      var border = Math.max(10, Math.round(area.height * .12)), padding = 3;
      var left = Math.max(0, area.x - padding), top = Math.max(0, area.y - padding), right = Math.min(w, area.x + area.width + padding), bottom = Math.min(h, area.y + area.height + padding);
      var output = canvas(right - left + border * 2, bottom - top + border * 2), ctx = output.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height);
      var rgba = ctx.getImageData(0, 0, output.width, output.height);
      var mask = null;
      if (area.words) {
        mask = new Uint8Array(w * h);
        area.words.forEach(function (word) {
          for (var y = Math.max(0, word.y - 4); y < Math.min(h, word.y + word.height + 4); y++)
            mask.fill(1, y * w + Math.max(0, word.x - 4), y * w + Math.min(w, word.x + word.width + 4));
        });
      }
      for (var y = top; y < bottom; y++) for (var x = left; x < right; x++) {
        var sourceIndex = y * w + x, targetIndex = ((y - top + border) * output.width + x - left + border) * 4;
        var gray = data.gray[sourceIndex];
        if (method === 'thin') for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) gray = Math.max(gray, data.gray[ny * w + nx]);
        }
        var value = (mask && !mask[sourceIndex]) || (removed[sourceIndex] && (area.parts || area.words)) ? 255 : method === 'binary' ? (gray <= cut ? 0 : 255) : method === 'normal' || method === 'thin' ? Math.max(0, Math.min(255, (gray - low) * 255 / (high - low))) : gray;
        rgba.data[targetIndex] = rgba.data[targetIndex + 1] = rgba.data[targetIndex + 2] = value;
      }
      ctx.putImageData(rgba, 0, 0); return output;
    }
    var candidates = [];
    if (keepAllWords) {
      var textWords = words.filter(function (word) { return word.score >= 4.5 && (word.fill < .6 || word.score > 10 && word.fill < .67); });
      if (textWords.length) {
        var left = Math.min.apply(null, textWords.map(function (word) { return word.x; })), top = Math.min.apply(null, textWords.map(function (word) { return word.y; }));
        var right = Math.max.apply(null, textWords.map(function (word) { return word.x + word.width; })), bottom = Math.max.apply(null, textWords.map(function (word) { return word.y + word.height; }));
        var textArea = { x: left, y: top, width: right - left, height: bottom - top, words: textWords };
        ['normal', 'upright', 'thin', 'binary', 'gray'].forEach(function (method) {
          var cleaned = image(textArea, method === 'upright' ? 'normal' : method);
          if (method === 'upright') {
            var upright = canvas(cleaned.width + cleaned.height * .3, cleaned.height), uprightContext = upright.getContext('2d');
            uprightContext.fillStyle = '#fff'; uprightContext.fillRect(0, 0, upright.width, upright.height);
            uprightContext.transform(1, 0, .3, 1, 0, 0); uprightContext.drawImage(cleaned, 0, 0); cleaned = upright;
          }
          candidates.push({ canvas: cleaned, psm: textWords.length === 1 ? (method === 'gray' ? '8' : method === 'binary' ? '13' : '7') : '6', region: -1, kind: method, score: 0, coverage: 1 });
        });
      }
      return { angle: angle, candidates: candidates, words: words, plainBackground: false };
    }
    words.slice(0, 2).forEach(function (word, index) {
      var normal = image(word, 'normal');
      candidates.push({ canvas: normal, psm: '7', region: index, kind: 'normal', score: word.score, expected: word.parts.length, coverage: word.width / w });
      /* Наклонные шрифты на заводских наклейках: резервный проход со сдвигом строк пикселей. */
      var upright = canvas(normal.width + normal.height * .3, normal.height), uprightContext = upright.getContext('2d');
      uprightContext.fillStyle = '#fff'; uprightContext.fillRect(0, 0, upright.width, upright.height);
      uprightContext.transform(1, 0, .3, 1, 0, 0); uprightContext.drawImage(normal, 0, 0);
      candidates.push({ canvas: upright, psm: '7', region: index, kind: 'upright', score: word.score, expected: word.parts.length, coverage: word.width / w });
      candidates.push({ canvas: image(word, 'thin'), psm: '7', region: index, kind: 'thin', score: word.score, expected: word.parts.length, coverage: word.width / w });
      candidates.push({ canvas: image(word, 'binary'), psm: '13', region: index, kind: 'binary', score: word.score, expected: word.parts.length, coverage: word.width / w });
      candidates.push({ canvas: image(word, 'gray'), psm: '8', region: index, kind: 'gray', score: word.score, expected: word.parts.length, coverage: word.width / w });
    });
    candidates.push({ canvas: image({ x: 0, y: 0, width: w, height: h }, 'normal'), psm: '7', region: -1, kind: 'full', score: 0 });
    var white = original.histogram.slice(245).reduce(function (sum, count) { return sum + count; }, 0);
    return { angle: angle, candidates: candidates, words: words, plainBackground: white / original.gray.length > .65 };
  }
  function prepareRegion(source) {
    /* Рамка пользователя — окончательная граница. Меняем контраст и наклон,
       но не вырезаем из неё автоматически найденное слово или строку. */
    var scale = Math.min(1, 1800 / source.width, 2400 / source.height);
    var raw = canvas(source.width * scale, source.height * scale);
    raw.getContext('2d').drawImage(source, 0, 0, raw.width, raw.height);
    var data = pixels(raw), cut = threshold(data.histogram);
    var dark = data.histogram.slice(0, cut + 1).reduce(function (sum, count) { return sum + count; }, 0);
    var inverted = dark > data.gray.length * .55;
    var low = percentile(data.histogram, .03), high = Math.max(low + 30, percentile(data.histogram, .97));
    var normalized = canvas(raw.width, raw.height), context = normalized.getContext('2d');
    var rgba = context.createImageData(raw.width, raw.height);
    for (var i = 0; i < data.gray.length; i++) {
      var value = Math.max(0, Math.min(255, (data.gray[i] - low) * 255 / (high - low)));
      if (inverted) value = 255 - value;
      rgba.data[i * 4] = rgba.data[i * 4 + 1] = rgba.data[i * 4 + 2] = value; rgba.data[i * 4 + 3] = 255;
    }
    context.putImageData(rgba, 0, 0);
    var angle = skew(normalized), radians = -angle * Math.PI / 180, border = 20;
    var corrected = canvas(normalized.width * Math.abs(Math.cos(radians)) + normalized.height * Math.abs(Math.sin(radians)) + border * 2,
      normalized.width * Math.abs(Math.sin(radians)) + normalized.height * Math.abs(Math.cos(radians)) + border * 2);
    var ctx = corrected.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, corrected.width, corrected.height);
    ctx.translate(corrected.width / 2, corrected.height / 2); ctx.rotate(radians); ctx.drawImage(normalized, -normalized.width / 2, -normalized.height / 2);
    var polarity = canvas(raw.width, raw.height), polarityContext = polarity.getContext('2d');
    var originalPixels = polarityContext.createImageData(raw.width, raw.height);
    /* Инвертируем пиксели напрямую: canvas.filter поддерживается не всеми
       браузерами и может молча оставить белые буквы на чёрном фоне. */
    for (var i = 0; i < data.gray.length; i++) {
      var value = inverted ? 255 - data.gray[i] : data.gray[i];
      originalPixels.data[i * 4] = originalPixels.data[i * 4 + 1] = originalPixels.data[i * 4 + 2] = value; originalPixels.data[i * 4 + 3] = 255;
    }
    polarityContext.putImageData(originalPixels, 0, 0);
    var padded = canvas(raw.width + border * 2, raw.height + border * 2), paddedContext = padded.getContext('2d');
    paddedContext.fillStyle = '#fff'; paddedContext.fillRect(0, 0, padded.width, padded.height); paddedContext.drawImage(polarity, border, border);
    var line = raw.width / raw.height >= 3, modes = line ? ['7', '6'] : ['6', '11'];
    var candidates = [];
    [corrected, padded].forEach(function (image, index) {
      modes.forEach(function (psm) { candidates.push({ canvas: image, psm: psm, region: -1, kind: index ? 'gray' : 'normal', score: 0, coverage: 1 }); });
    });
    return { angle: angle, candidates: candidates, words: [], plainBackground: false, normalized: polarity, line: line };
  }
  async function recognize(worker, source, options) {
    options = options || {};
    var prepared = options.exactRegion ? prepareRegion(source) : prepare(source), results = [];
    for (var i = 0; i < prepared.candidates.length; i++) {
      var candidate = prepared.candidates[i];
      if (options.onProgress) options.onProgress(i + 1, prepared.candidates.length);
      await worker.setParameters({ tessedit_pageseg_mode: candidate.psm, preserve_interword_spaces: '0', user_defined_dpi: '300', tessedit_char_whitelist: '' });
      var output = await worker.recognize(candidate.canvas);
      var text = options.singleLine === false ? output.data.text.trim() : output.data.text.replace(/\s+/g, ' ').trim();
      if (candidate.expected >= 6 && text.replace(/[^\p{L}\p{N}]/gu, '').length < candidate.expected * .5) continue;
      if (text) results.push({ text: text, confidence: output.data.confidence, region: candidate.region, preparation: candidate.kind, canvas: candidate.canvas, regionScore: candidate.score, coverage: candidate.coverage });
      if (options.exactRegion && i === 3 && !results.some(function (r) { return r.confidence >= 65 && !/[|\[\]{}]/.test(r.text); })) {
        /* Резервный проход убирает рамки и полосы, сохраняя все найденные
           слова на их местах во всей области, а не выбирая одно из них. */
        prepared.candidates.push.apply(prepared.candidates, prepare(prepared.normalized, true).candidates);
      }
    }
    var unique = [];
    results.forEach(function (r) {
      var previous = unique.find(function (value) { return value.text === r.text && value.region === r.region; });
      var detail = ['normal', 'upright', 'gray'].indexOf(r.preparation) !== -1;
      if (previous) {
        previous.votes++; if (detail) { previous.detailVotes++; previous.detailConfidence = Math.max(previous.detailConfidence, r.confidence); }
        if (r.confidence > previous.confidence) { previous.confidence = r.confidence; previous.canvas = r.canvas; }
      } else unique.push(Object.assign({ votes: 1, detailVotes: detail ? 1 : 0, detailConfidence: detail ? r.confidence : 0 }, r));
    });
    if (options.exactRegion && prepared.line) {
      var longest = unique.reduce(function (length, r) {
        return r.confidence >= 50 && !/[|\[\]{}]/.test(r.text) ? Math.max(length, r.text.replace(/[^\p{L}\p{N}]/gu, '').length) : length;
      }, 0);
      /* Несколько одинаковых чтений хвоста строки не должны побеждать
         полный номер, прочитанный другим проходом. */
      unique = unique.filter(function (r) { return r.text.replace(/[^\p{L}\p{N}]/gu, '').length >= longest * .65; });
    }
    unique.forEach(function (r) {
      var length = r.text.replace(/[^\p{L}\p{N}]/gu, '').length, noise = r.text.replace(/[\p{L}\p{N}\s._/+:()-]/gu, '').length;
      var detail = r.preparation === 'normal' ? 6 : r.preparation === 'gray' ? 2 : 0;
      r.score = r.confidence + Math.min(12, length) * 1.5 + (r.votes - 1) * 2 + detail - noise * 10 + Math.max(0, r.regionScore) * 2;
    });
    unique.sort(function (a, b) { return b.score - a.score; });
    /* Согласие исходных полутонов и варианта шрифта важнее уверенности
       пороговых копий: при усилении они могут одинаково замкнуть S в 8. */
    var primary = unique.filter(function (r) { return r.region === (options.exactRegion ? -1 : 0) && (!options.exactRegion || !/[|\[\]{}]/.test(r.text)) && r.detailVotes >= 2 && r.detailConfidence >= 50 && r.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3; })
      .sort(function (a, b) { return b.detailVotes - a.detailVotes || b.detailConfidence - a.detailConfidence; })[0];
    if (primary) {
      var index = unique.findIndex(function (r) { return r.text === primary.text && r.region === primary.region; });
      if (index > 0) unique.unshift(unique.splice(index, 1)[0]);
    }
    /* Не теряем начало и конец кода, если выделение букв оказалось слишком узким,
       а проход по всей исходной области уверенно прочитал полный код. */
    var complete = unique.find(function (r) {
      if (r.region !== -1 || !/^[\p{L}\p{N}._:+-]+$/u.test(r.text)) return false;
      if (prepared.plainBackground && r.confidence >= 65) return true;
      return r.confidence >= 85 && unique[0] && r.text.length >= unique[0].text.length + 2 && r.text.indexOf(unique[0].text) !== -1;
    });
    if (complete) { var completeIndex = unique.indexOf(complete); if (completeIndex > 0) unique.unshift(unique.splice(completeIndex, 1)[0]); }
    var best = unique[0] || null;
    function nearby(left, right) {
      left = left.replace(/\s/g, ''); right = right.replace(/\s/g, '');
      if (left === right || left.length > 80 || right.length > 80 || Math.abs(left.length - right.length) > 2) return false;
      var row = Array.from({ length: right.length + 1 }, function (_, index) { return index; });
      for (var i = 0; i < left.length; i++) {
        var next = [i + 1];
        for (var j = 0; j < right.length; j++) next[j + 1] = Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (left[i] === right[j] ? 0 : 1));
        row = next;
      }
      return row[right.length] <= 2;
    }
    var conflicts = best ? unique.slice(1).filter(function (r) { return r.region === best.region && r.confidence >= 20 && nearby(best.text, r.text); }) : [];
    var bestLength = best ? best.text.replace(/[^\p{L}\p{N}]/gu, '').length : 0;
    var alternatives = conflicts.concat(unique.slice(1).filter(function (r) { return conflicts.indexOf(r) === -1 && best && r.region === best.region && r.text.replace(/[^\p{L}\p{N}]/gu, '').length >= Math.max(3, bestLength * .6); })).slice(0, 5);
    var partial = best && best.region >= 0 && best.coverage < .45 && !prepared.plainBackground;
    return { best: best, alternatives: alternatives, disputed: conflicts.length > 0, partial: partial, uncertain: !best || best.confidence < 80 || best.detailVotes < 2 || conflicts.length > 0 || partial, attempts: prepared.candidates.length, angle: prepared.angle };
  }
  function barcodeImages(source, selection) {
    var scale = Math.min(1, 900 / Math.max(source.width, source.height)), small = canvas(source.width * scale, source.height * scale);
    small.getContext('2d').drawImage(source, 0, 0, small.width, small.height);
    var p = pixels(small), w = small.width, h = small.height, seen = new Uint8Array(w * h), queue = new Int32Array(w * h), areas = [];
    for (var index = 0; index < seen.length; index++) {
      if (seen[index] || p.gray[index] < 185) continue;
      var head = 0, tail = 1, left = w, top = h, right = 0, bottom = 0; queue[0] = index; seen[index] = 1;
      while (head < tail) {
        var at = queue[head++], y = Math.floor(at / w), x = at - y * w;
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        var neighbors = [x > 0 ? at - 1 : -1, x < w - 1 ? at + 1 : -1, y > 0 ? at - w : -1, y < h - 1 ? at + w : -1];
        for (var n = 0; n < neighbors.length; n++) { var next = neighbors[n]; if (next >= 0 && !seen[next] && p.gray[next] >= 185) { seen[next] = 1; queue[tail++] = next; } }
      }
      var width = right - left + 1, height = bottom - top + 1;
      if (tail < w * h * .003 || width < 20 || height < 20 || tail / (width * height) < .25) continue;
      var pad = 12 / scale;
      areas.push({ x: Math.max(0, left / scale - pad), y: Math.max(0, top / scale - pad), width: Math.min(source.width, (right + 1) / scale + pad) - Math.max(0, left / scale - pad), height: Math.min(source.height, (bottom + 1) / scale + pad) - Math.max(0, top / scale - pad), size: tail });
    }
    areas.sort(function (a, b) { return b.size - a.size; });
    if (selection) {
      areas = areas.filter(function (area) { return area.x < selection.x + selection.width && area.x + area.width > selection.x && area.y < selection.y + selection.height && area.y + area.height > selection.y; });
      var px = selection.width * .8 + 15, py = selection.height * 2 + 15;
      areas.unshift({ x: Math.max(0, selection.x - px), y: Math.max(0, selection.y - py), width: Math.min(source.width, selection.x + selection.width + px) - Math.max(0, selection.x - px), height: Math.min(source.height, selection.y + selection.height + py) - Math.max(0, selection.y - py) });
    }
    areas = areas.slice(0, 4);
    if (!areas.length) areas.push({ x: 0, y: 0, width: source.width, height: source.height });
    return areas.map(function (area) {
      var scale = Math.min(4, 2000 / Math.max(area.width, area.height)), tile = canvas(area.width * scale, area.height * scale);
      tile.getContext('2d').drawImage(source, area.x, area.y, area.width, area.height, 0, 0, tile.width, tile.height);
      var originalWidth = tile.width, originalHeight = tile.height, quarter = 0;
      if (tile.height > tile.width) {
        var turned = canvas(tile.height, tile.width), turnContext = turned.getContext('2d');
        turnContext.translate(0, tile.width); turnContext.rotate(-Math.PI / 2); turnContext.drawImage(tile, 0, 0);
        tile = turned; quarter = -Math.PI / 2;
      }
      var angle = -skew(tile) * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
      var output = canvas(tile.width * Math.abs(cosine) + tile.height * Math.abs(sine) + 20, tile.width * Math.abs(sine) + tile.height * Math.abs(cosine) + 20);
      var ctx = output.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height);
      ctx.translate(output.width / 2, output.height / 2); ctx.rotate(angle); ctx.drawImage(tile, -tile.width / 2, -tile.height / 2);
      var original = pixels(tile), cut = threshold(original.histogram), low = Math.min(percentile(original.histogram, .05), cut * .6), high = Math.max(low + 30, percentile(original.histogram, .85));
      var rgba = ctx.getImageData(0, 0, output.width, output.height);
      for (var i = 0; i < rgba.data.length; i += 4) { var gray = rgba.data[i] * .299 + rgba.data[i + 1] * .587 + rgba.data[i + 2] * .114; var value = Math.max(0, Math.min(255, (gray - low) * 255 / (high - low))); rgba.data[i] = rgba.data[i + 1] = rgba.data[i + 2] = value; }
      ctx.putImageData(rgba, 0, 0);
      var mapCosine = Math.cos(angle + quarter), mapSine = Math.sin(angle + quarter);
      return { canvas: output, point: function (p) { var dx = p.x - output.width / 2, dy = p.y - output.height / 2; return { x: area.x + area.width / 2 + (mapCosine * dx + mapSine * dy) * area.width / originalWidth, y: area.y + area.height / 2 + (-mapSine * dx + mapCosine * dy) * area.height / originalHeight }; } };
    });
  }
  window.__lcPhotoOcr = { prepare: prepare, recognize: recognize, barcodeImages: barcodeImages };
}());

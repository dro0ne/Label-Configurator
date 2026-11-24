/* Подсказки для выбора движка. Цвет чернил сам по себе не гарантирует рукопись. */
(function () {
  'use strict';
  function quantile(values, fraction) {
    values.sort(function (a, b) { return a - b; });
    return values[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 0;
  }
  function inspect(source) {
    var canvas = document.createElement('canvas'), scale = Math.min(1, 1000 / Math.max(source.width, source.height));
    canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
    var ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data, gray = [], values = [], chroma = [];
    for (var i = 0; i < data.length; i += 4) {
      gray.push(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]);
      values.push(Math.max(data[i], data[i + 1], data[i + 2]));
      chroma.push((data[i + 2] - Math.min(data[i], data[i + 1])) / Math.max(1, values[values.length - 1]));
    }
    var paper = quantile(values.slice(), .7), light = quantile(gray.slice(), .85), paperChroma = [];
    values.forEach(function (v, at) { if (v >= paper) paperChroma.push(chroma[at]); });
    var baseline = quantile(paperChroma, .5), ink = 0, blue = 0, bright = 0;
    gray.forEach(function (g, at) {
      if (g > 150) bright++;
      if (g >= light * .8) return;
      ink++;
      var offset = at * 4;
      if (chroma[at] > baseline + .03 && data[offset + 2] > data[offset] * 1.025 && data[offset + 2] > data[offset + 1] * 1.025) blue++;
    });
    return { handwriting: bright / gray.length > .5 && blue / Math.max(1, ink) > .05 && blue / gray.length > .015,
      blueInk: blue / Math.max(1, ink), paper: bright / gray.length };
  }
  window.__lcPhotoAuto = { inspect: inspect };
}());

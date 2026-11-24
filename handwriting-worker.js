/* Локальный worker: загрузка открытой модели и CTC-декодирование.
   Сообщения с пикселями не покидают браузер. */
'use strict';
var session = null, characters = null, initialization = null, lexicon = new Set();
var base = new URL('./assets/handwriting/', self.location.href);

function progress(id, phase, value) { self.postMessage({ id: id, type: 'progress', phase: phase, value: value }); }
async function digest(buffer) {
  var bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}
async function modelBytes(config, id) {
  var url = new URL(config.file, base).href, cache = null, cached = null;
  try { cache = await caches.open('lc-handwriting-models-v1'); cached = await cache.match(url); } catch (_) {}
  if (cached) {
    var saved = await cached.arrayBuffer();
    if (saved.byteLength === config.bytes && await digest(saved) === config.sha256) return saved;
    if (cache) await cache.delete(url);
  }
  var response = await fetch(url);
  if (!response.ok) throw new Error('model-download');
  var buffer;
  if (response.body && response.body.getReader) {
    var reader = response.body.getReader(), chunks = [], length = 0;
    while (true) {
      var part = await reader.read(); if (part.done) break;
      chunks.push(part.value); length += part.value.length;
      progress(id, 'download', Math.min(1, length / config.bytes));
    }
    var all = new Uint8Array(length), offset = 0;
    chunks.forEach(function (part) { all.set(part, offset); offset += part.length; }); buffer = all.buffer;
  } else buffer = await response.arrayBuffer();
  if (buffer.byteLength !== config.bytes || await digest(buffer) !== config.sha256) throw new Error('model-integrity');
  if (cache) { try { await cache.put(url, new Response(buffer.slice(0))); } catch (_) {} }
  return buffer;
}
async function initialize(id) {
  if (session) return;
  if (!initialization) initialization = (async function () {
    progress(id, 'load', 0);
    importScripts(new URL('runtime/ort.wasm.min.js', base).href);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL('runtime/', base).href;
    ort.env.logLevel = 'error';
    var response = await fetch(new URL('model.json', base));
    if (!response.ok) throw new Error('model-config');
    var config = await response.json();
    var alphabet = await fetch(new URL(config.characters, base));
    if (!alphabet.ok) throw new Error('model-alphabet');
    characters = ['', ...await alphabet.json(), ' '];
    if (config.lexicon) {
      try {
        var lexiconUrl = new URL(config.lexicon, base).href, lexiconCache = await caches.open('lc-handwriting-lexicon-v1');
        var lexiconResponse = await lexiconCache.match(lexiconUrl);
        if (!lexiconResponse) {
          lexiconResponse = await fetch(lexiconUrl);
          if (!lexiconResponse.ok) throw new Error('lexicon-download');
          await lexiconCache.put(lexiconUrl, lexiconResponse.clone());
        }
        lexicon = new Set(await lexiconResponse.json());
      } catch (_) { lexicon = new Set(); }
    }
    var weights = await modelBytes(config, id);
    progress(id, 'prepare', 0);
    session = await ort.InferenceSession.create(weights, { executionProviders: ['wasm'], logSeverityLevel: 3 });
  }()).catch(function (error) { initialization = null; throw error; });
  return initialization;
}
function logadd(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  var largest = Math.max(a, b); return largest + Math.log1p(Math.exp(Math.min(a, b) - largest));
}
function symbol(value, kind) {
  if (kind !== 'code' || !value) return value;
  var lookalikes = { 'А':'A', 'В':'B', 'С':'C', 'Е':'E', 'Н':'H', 'К':'K', 'М':'M', 'О':'O', 'Р':'P', 'Т':'T', 'Х':'X', 'У':'Y' };
  value = value.toUpperCase(); value = lookalikes[value] || value;
  if (/^[\x21-\x7e]$/.test(value)) return value;
  /* Неразрешённую букву сохраняем как вопрос, а не теряем из номера. */
  return /[\p{L}\p{N}]/u.test(value) ? '?' : '';
}
function distance(left, right) {
  var row=Array.from({length:right.length+1},function(_,i){return i;});
  for(var i=0;i<left.length;i++){var next=[i+1];for(var j=0;j<right.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(left[i]===right[j]?0:1)));row=next;}return row[right.length];
}
function normalized(value) { return value.normalize('NFC').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim(); }
function vocabularyChoice(tensor, baseline, vocabulary) {
  var text=normalized(baseline),digits=JSON.stringify(text.match(/\d+/g)||[]);
  if(text.length<3)return null;
  var candidates=(vocabulary||[]).filter(function(value){var word=normalized(value);return Math.abs(word.length-text.length)<=Math.max(1,text.length*.35)&&JSON.stringify(word.match(/\d+/g)||[])===digits;}).map(function(value){return{text:value,normalized:normalized(value),distance:distance(text,normalized(value))};}).filter(function(value){return value.distance>0&&value.distance<=Math.max(1,Math.floor(Math.max(text.length,value.normalized.length)*.35));}).sort(function(a,b){return a.distance-b.distance;}).slice(0,6);
  if(!candidates.length)return null;
  var classes=characters.length,steps=tensor.data.length/classes,needed=new Set(Array.from(text));candidates.forEach(function(c){Array.from(c.normalized).forEach(function(ch){needed.add(ch);});});
  var indices=new Map();characters.forEach(function(ch,index){var key=normalized(ch);if(ch===' ')key=' ';if(index===0||!needed.has(key))return;if(!indices.has(key))indices.set(key,[]);indices.get(key).push(index);});
  function score(value){
    var letters=[''];Array.from(value).forEach(function(ch){letters.push(ch,'');});var alpha=new Float64Array(letters.length).fill(-Infinity);alpha[0]=0;
    for(var time=0;time<steps;time++){var next=new Float64Array(letters.length).fill(-Infinity);for(var at=0;at<letters.length;at++){var sum=at===0?alpha[at]:logadd(alpha[at],alpha[at-1]);if(at>1&&letters[at]&&letters[at]!==letters[at-2])sum=logadd(sum,alpha[at-2]);var probability=0;if(!letters[at])probability=tensor.data[time*classes];else(indices.get(letters[at])||[]).forEach(function(index){probability+=tensor.data[time*classes+index];});next[at]=sum+Math.log(Math.max(1e-30,probability));}alpha=next;}
    return logadd(alpha[alpha.length-1],alpha[alpha.length-2]);
  }
  var original=score(text);candidates.forEach(function(c){c.score=score(c.normalized);});candidates.sort(function(a,b){return b.score-a.score;});
  var best=candidates[0];if(!Number.isFinite(best.score)||(original-best.score)/Math.max(1,text.length)>1.2)return null;
  if(candidates[1]&&best.distance===candidates[1].distance&&best.score-candidates[1].score<1)return null;
  return {text:best.text,apply:best.distance<=Math.max(1,Math.floor(Math.max(text.length,best.normalized.length)*.2))};
}
/* Общий словарь только выбирает близкий вариант, уже предложенный CTC.
   Ни цифры, ни латинские коды, ни старые буквы по словарю не исправляются. */
function lexiconChoice(choices) {
  if (!lexicon.size || !choices.length) return null;
  var baseline = choices[0], text = baseline.text;
  if (/[0-9A-Za-zѣѢіІѳѲѵѴ]/.test(text)) return null;
  var words = text.match(/[а-яё]+/gi) || [], shape = text.replace(/[а-яё]+/gi, '#');
  var unknown = words.filter(function (w) { return w.length >= 5 && !lexicon.has(normalized(w)); }).length;
  if (!unknown) return null;
  var candidates = choices.slice(1).filter(function (candidate) {
    if (!Number.isFinite(candidate.score) || baseline.score - candidate.score > 1.6 || candidate.text.replace(/[а-яё]+/gi, '#') !== shape) return false;
    var variant = candidate.text.match(/[а-яё]+/gi) || [], changed = 0;
    if (variant.length !== words.length) return false;
    for (var i = 0; i < words.length; i++) {
      var before = normalized(words[i]), after = normalized(variant[i]);
      if (before === after) continue;
      if (words[i].length < 5 || lexicon.has(before) || !lexicon.has(after) || distance(before, after) !== 1) return false;
      changed++;
    }
    return changed > 0 && changed <= 2;
  });
  return candidates.length ? candidates[0].text : null;
}
function decode(tensor, kind, vocabulary, useLexicon) {
  if (kind === 'auto') {
    var preliminary = decode(tensor, 'raw', [], false), compact = preliminary.text.replace(/\s/g, '');
    var digits = (compact.match(/[0-9]/g) || []).length;
    var unknown = compact.replace(/[A-Za-zАВСЕНКМОРТХУавсенкмортху0-9?._/\-]/g, '').length;
    var code = compact.length >= 6 && compact.length <= 40 && digits >= 3 &&
      (unknown === 0 && digits / compact.length >= .25 || digits / compact.length >= .5 && unknown <= Math.max(1, Math.floor(compact.length * .15)));
    var automatic = decode(tensor, code ? 'code' : 'text', code ? [] : vocabulary, useLexicon);
    automatic.kind = code ? 'code' : 'text';
    return automatic;
  }
  var data = tensor.data, classes = tensor.dims[tensor.dims.length - 1];
  if (classes !== characters.length) throw new Error('model-alphabet');
  var beams = new Map([['', { blank: 0, ink: -Infinity }]]), raw = '', last = '', confidence = 0, count = 0;
  for (var time = 0; time < data.length; time += classes) {
    var emissions = new Map();
    for (var i = 0; i < classes; i++) {
      var key = symbol(characters[i], kind);
      emissions.set(key, (emissions.get(key) || 0) + data[time + i]);
    }
    var top = Array.from(emissions, function (item) { return { text: item[0], p: item[1] }; }).sort(function (a,b) { return b.p-a.p; });
    var first = top[0];
    if (first.text && first.text !== last) { raw += first.text; confidence += first.p; count++; }
    last = first.text;
    var blank = Math.log(Math.max(1e-30, emissions.get('') || 0));
    top = top.filter(function (item) { return item.text; }).slice(0, 8);
    var next = new Map();
    function get(text) { if (!next.has(text)) next.set(text, { blank: -Infinity, ink: -Infinity }); return next.get(text); }
    beams.forEach(function (beam, prefix) {
      var total = logadd(beam.blank, beam.ink), same = get(prefix);
      same.blank = logadd(same.blank, total + blank);
      top.forEach(function (item) {
        var p = Math.log(Math.max(1e-30, item.p)), repeated = prefix.endsWith(item.text);
        if (repeated) same.ink = logadd(same.ink, beam.ink + p);
        var added = get(prefix + item.text);
        added.ink = logadd(added.ink, (repeated ? beam.blank : total) + p);
      });
    });
    beams = new Map(Array.from(next).sort(function (a,b) { return logadd(b[1].blank,b[1].ink)-logadd(a[1].blank,a[1].ink); }).slice(0, 8));
  }
  var choices = Array.from(beams, function (item) { return { text: item[0].replace(/\s+/g,' ').trim(), score: logadd(item[1].blank,item[1].ink) }; });
  var unique = [];
  choices.forEach(function (item) { if (item.text && !unique.some(function (r) { return r.text === item.text; })) unique.push(item); });
  raw = raw.replace(/\s+/g,' ').trim();
  if (raw && !unique.some(function (r) { return r.text === raw; })) unique.push({ text: raw });
  var originalBest=unique[0]?unique[0].text:'',lexical=kind==='text'&&useLexicon!==false?lexiconChoice(unique):null;
  var best=lexical||originalBest,choice=kind==='text'?vocabularyChoice(tensor,best,vocabulary):null,corrected=choice&&choice.apply?choice.text:null,suggestion=choice&&!choice.apply?choice.text:null,answer=corrected||best;
  var uncertainCode=kind==='code'&&!!unique[1]&&unique[0].score-unique[1].score<1.6;
  return { text: answer, kind: kind, raw: raw, uncertainCode:uncertainCode, lexicon:!!lexical, dictionary:!!corrected, suggestion:suggestion, confidence: count ? confidence / count : 0, alternatives: (lexical?[originalBest]:[]).concat(suggestion?[suggestion]:corrected?[best]:[]).concat(unique.slice(1,5).map(function(r){return r.text;})).filter(function(value,index,all){return value&&value!==answer&&all.indexOf(value)===index;}).slice(0,4) };
}
self.addEventListener('message', async function (event) {
  var request = event.data;
  try {
    if (request.type === 'init') { await initialize(request.id); self.postMessage({ id: request.id, type: 'ready' }); return; }
    if (request.type !== 'read') return;
    await initialize(request.id);
    var input = new ort.Tensor('float32', new Float32Array(request.pixels), [1, 3, 48, request.width]);
    var output;
    try { output = await session.run({ [session.inputNames[0]]: input }); }
    finally { input.dispose(); }
    try { self.postMessage({ id: request.id, type: 'result', reading: decode(output[session.outputNames[0]], request.kind, request.vocabulary, request.useLexicon) }); }
    finally { Object.keys(output).forEach(function (key) { output[key].dispose(); }); }
  } catch (error) { self.postMessage({ id: request.id, type: 'error', message: error.message || String(error) }); }
});

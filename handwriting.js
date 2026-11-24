/* Собственный модуль подготовки строк и управления локальным распознаванием.
   Открытая модель и runtime находятся в assets/handwriting; API не используется. */
(function () {
  'use strict';
  var worker = null, ready = null, sequence = 0, pending = new Map(), active = false;
  var workerURL = new URL('./handwriting-worker.js?v=20261124-13', document.baseURI);
  function failed(message) { return new Error(message); }
  function cancel(reason) {
    if (worker) worker.terminate(); worker = null; ready = null;
    pending.forEach(function (item) { clearTimeout(item.timer); item.reject(failed(reason || 'cancelled')); }); pending.clear();
  }
  function connect() {
    if (worker) return;
    worker = new Worker(workerURL, { name: 'lc-local-handwriting' }); var instance = worker;
    worker.onmessage = function (event) {
      if (worker !== instance) return;
      var message = event.data, item = pending.get(message.id); if (!item) return;
      clearTimeout(item.timer);
      if (message.type === 'progress') {
        item.timer = setTimeout(function () { cancel('handwriting-timeout'); }, 90000);
        if (item.progress) item.progress(message); return;
      }
      pending.delete(message.id);
      if (message.type === 'error') item.reject(failed(message.message)); else item.resolve(message.reading);
    };
    worker.onerror = function () {
      if (worker !== instance) return;
      pending.forEach(function (item) { clearTimeout(item.timer); item.reject(failed('handwriting-worker')); });
      pending.clear(); if (worker) worker.terminate(); worker = null; ready = null;
    };
  }
  function request(type, data, transfer, onProgress) {
    connect();
    return new Promise(function (resolve, reject) {
      var id = ++sequence, timer = setTimeout(function () { cancel('handwriting-timeout'); }, type === 'init' ? 180000 : 90000);
      pending.set(id, { resolve: resolve, reject: reject, progress: onProgress, timer: timer });
      worker.postMessage(Object.assign({ id: id, type: type }, data), transfer || []);
    });
  }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function quantile(histogram, fraction) {
    var total = histogram.reduce(function (sum,value) { return sum+value; },0), count = 0;
    for (var i=0;i<256;i++) { count += histogram[i]; if (count >= total*fraction) return i; } return 255;
  }
  function pixels(source) {
    var rgba = source.getContext('2d').getImageData(0,0,source.width,source.height), gray = new Uint8Array(source.width*source.height), histogram = new Uint32Array(256);
    for (var i=0;i<gray.length;i++) { var g=Math.round(rgba.data[i*4]*.299+rgba.data[i*4+1]*.587+rgba.data[i*4+2]*.114); gray[i]=g; histogram[g]++; }
    return {gray:gray,histogram:histogram};
  }
  function prepare(source, options) {
    options=options||{};
    /* Контраст измеряется до поворота: белые углы вокруг серого листа
       иначе превращают фон в «чернила» и стирают целую строку. */
    var original=pixels(source),darkest=0,lightest=255;
    while(darkest<255&&!original.histogram[darkest])darkest++;
    while(lightest>0&&!original.histogram[lightest])lightest--;
    if(lightest-darkest<3)return {lines:[],angle:0,partial:false,lowResolution:false};
    var low=quantile(original.histogram,.03),high=Math.max(low+30,quantile(original.histogram,.92)),cut=low+(high-low)*.6;
    var angle = window.__lcPhotoOcr && window.__lcPhotoOcr.skew ? window.__lcPhotoOcr.skew(source) : 0;
    if (Math.abs(angle)>12) angle=0;
    var radians=-angle*Math.PI/180, c=canvas(source.width*Math.abs(Math.cos(radians))+source.height*Math.abs(Math.sin(radians)),source.width*Math.abs(Math.sin(radians))+source.height*Math.abs(Math.cos(radians)));
    var ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.rotate(radians);ctx.drawImage(source,-source.width/2,-source.height/2);
    var p=pixels(c),w=c.width,h=c.height,gray=p.gray;
    var horizontal=new Uint8Array(h),bands=[];
    for(var y=0;y<h;y++){var count=0;for(var x=0;x<w;x++)if(gray[y*w+x]<cut)count++;if(count>w*.62)horizontal[y]=1;}
    for(var y=0;y<h;y++)if(horizontal[y]){var previous=bands[bands.length-1];if(previous&&y-previous.end<=2)previous.end=y;else bands.push({start:y,end:y});}
    /* Восстанавливаем тонкие линии по соседним пикселям. Слова и буквы
       не отбрасываются по словарю и не заменяются заранее известными ответами. */
    var cleaned=new Uint8Array(gray);
    bands.forEach(function(band){var top=Math.max(0,band.start-2),bottom=Math.min(h-1,band.end+2);for(var y=band.start;y<=band.end;y++)for(var x=0;x<w;x++)cleaned[y*w+x]=Math.round((gray[top*w+x]+gray[bottom*w+x])/2);});
    /* Край столбца может смещаться на несколько пикселей из-за перспективы.
       Ищем непрерывную тёмную границу в узкой полосе, а не удаляем буквы
       вместе с целой фиксированной колонкой пикселей. */
    var edges=new Uint8Array(w*h),edgeWidth=Math.max(3,Math.round(w*.06));
    if(h<w*.45){
      for(var x=0;x<w;x++)if(x<Math.max(3,w*.12)||x>w-Math.max(3,w*.12)){var count=0;for(var y=0;y<h;y++)if(gray[y*w+x]<cut)count++;if(count>h*.82)for(var y=0;y<h;y++)edges[y*w+x]=1;}
    }else [[0,Math.min(w,edgeWidth)],[Math.max(0,w-edgeWidth),w]].forEach(function(range){
      var positions=[],hits=0;
      for(var y=0;y<h;y++){var darkest=256,position=range[0];for(var x=range[0];x<range[1];x++)if(gray[y*w+x]<darkest){darkest=gray[y*w+x];position=x;}positions.push(position);if(darkest<cut)hits++;}
      if(hits<h*.85)return;
      positions.forEach(function(position,y){for(var x=Math.max(0,position-1);x<=Math.min(w-1,position+1);x++)if(gray[y*w+x]<cut)edges[y*w+x]=1;});
    });
    for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(edges[y*w+x]){var left=x-1,right=x+1;while(left>=0&&edges[y*w+left])left--;while(right<w&&edges[y*w+right])right++;var a=left>=0?cleaned[y*w+left]:right<w?cleaned[y*w+right]:high;var b=right<w?cleaned[y*w+right]:a;cleaned[y*w+x]=Math.round((a+b)/2);}
    var areas=[],partial=false;
    if(options.singleLine&&source.width>source.height*2.5){
      /* Точки и выносные элементы букв не являются отдельными строками. */
      areas.push({top:0,bottom:h});
    }else if(bands.length>=3){
      var gaps=[];for(var bandIndex=1;bandIndex<bands.length;bandIndex++)gaps.push(bands[bandIndex].start-bands[bandIndex-1].end-1);
      gaps.sort(function(a,b){return a-b;});var cellHeight=gaps[Math.floor(gaps.length/2)]||0;
      var start=0;bands.forEach(function(band,index){if(band.start-start>=5){if(index===0&&band.start<cellHeight*.5)partial=true;else areas.push({top:start,bottom:band.start});}start=band.end+1;});
      if(h-start>=5){if(h-start<cellHeight*.5)partial=true;else areas.push({top:start,bottom:h});}
    }else{
      var top=-1,last=-1;
      for(var y=0;y<h;y++){var count=0;for(var x=0;x<w;x++)if(cleaned[y*w+x]<cut)count++;if(count>Math.max(2,w*.008)){if(top<0)top=y;last=y;}else if(top>=0&&y-last>Math.max(2,h*.008)){areas.push({top:top,bottom:last+1});top=-1;}}
      if(top>=0)areas.push({top:top,bottom:last+1});
    }
    var lines=[];
    areas.forEach(function(area){
      var left=w,right=0,top=h,bottom=0,count=0;
      for(var y=area.top;y<area.bottom;y++)for(var x=0;x<w;x++)if(cleaned[y*w+x]<cut){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}
      if(count<8||right-left<2||bottom-top<2)return;
      left=Math.max(0,left-2);right=Math.min(w,right+3);top=Math.max(0,top-1);bottom=Math.min(h,bottom+2);
      var border=Math.max(3,Math.round((bottom-top)*.25)),line=canvas(right-left+border*2,bottom-top+border*2),cx=line.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,line.width,line.height);var rgba=cx.getImageData(0,0,line.width,line.height);
      for(var y=top;y<bottom;y++)for(var x=left;x<right;x++){var at=((y-top+border)*line.width+x-left+border)*4;var g=Math.max(0,Math.min(255,(cleaned[y*w+x]-low)*255/(high-low)));rgba.data[at]=rgba.data[at+1]=rgba.data[at+2]=g;}
      cx.putImageData(rgba,0,0);lines.push({canvas:line,box:{x:left,y:top,width:right-left,height:bottom-top}});
    });
    return {lines:lines,angle:angle,partial:partial,lowResolution:lines.some(function(line){return line.box.height<16;})};
  }
  function input(line) {
    var height=48,resized=Math.ceil(height*line.width/line.height);
    if(resized>2100)throw failed('wide-region');
    var width=Math.max(640,Math.ceil(resized*1.5)),small=canvas(resized,height),cx=small.getContext('2d');cx.drawImage(line,0,0,resized,height);
    var rgba=cx.getImageData(0,0,resized,height).data,plane=width*height,data=new Float32Array(plane*3);
    for(var y=0;y<height;y++)for(var x=0;x<resized;x++){var from=(y*resized+x)*4,to=y*width+x;for(var channel=0;channel<3;channel++)data[channel*plane+to]=rgba[from+2-channel]/127.5-1;}
    return {width:width,pixels:data.buffer};
  }
  async function recognize(source, options) {
    options=options||{};if(active)throw failed('handwriting-busy');active=true;
    try{
      var prepared=prepare(source,options);if(!prepared.lines.length)throw failed('no-handwriting');if(prepared.lines.length>40)throw failed('many-lines');
      if(!ready)ready=request('init',{},[],options.onProgress).catch(function(error){ready=null;throw error;});await ready;
      var readings=[],vocabulary=[];
      if(options.kind!=='code'&&options.useVocabulary!==false){try{var saved=await examples();saved.filter(function(item){return item.kind==='text';}).forEach(function(item){item.text.split(/\n/).forEach(function(value){value=value.trim();if(value.length>=3&&value.length<=160&&/[а-яё]/i.test(value)&&vocabulary.indexOf(value)===-1)vocabulary.push(value);});});vocabulary=vocabulary.slice(0,2000);}catch(_){} }
      for(var i=0;i<prepared.lines.length;i++){
        if(options.onProgress)options.onProgress({phase:'read',current:i+1,total:prepared.lines.length});
        var pixels=input(prepared.lines[i].canvas),reading=await request('read',{width:pixels.width,pixels:pixels.pixels,kind:options.kind||'text',vocabulary:vocabulary,useLexicon:options.useVocabulary!==false},[pixels.pixels]);
        readings.push(reading);
      }
      var separator=options.singleLine?' ':'\n',text=readings.map(function(r){return r.text;}).join(separator).trim(),alternatives=[];
      readings.forEach(function(reading,index){reading.alternatives.slice(0,2).forEach(function(value){var variant=readings.map(function(r,i){return i===index?value:r.text;}).join(separator).trim();if(variant&&variant!==text&&!alternatives.some(function(r){return r.text===variant;}))alternatives.push({text:variant,confidence:reading.confidence*100,dictionary:reading.suggestion===value});});});
      return {text:text,lines:readings,kind:readings.every(function(r){return r.kind==='code';})?'code':'text',hasCodes:readings.some(function(r){return r.kind==='code';}),uncertainCode:readings.some(function(r){return r.uncertainCode;}),alternatives:alternatives.slice(0,5),partial:prepared.partial,lowResolution:prepared.lowResolution,angle:prepared.angle,lexicon:readings.some(function(r){return r.lexicon;}),dictionary:readings.some(function(r){return r.dictionary;}),suggestion:readings.some(function(r){return !!r.suggestion;})};
    }finally{active=false;}
  }
  function database() {
    return new Promise(function(resolve,reject){var request=indexedDB.open('lc-handwriting-examples-v1',1);request.onupgradeneeded=function(){request.result.createObjectStore('examples',{keyPath:'id'});};request.onerror=function(){reject(request.error);};request.onsuccess=function(){resolve(request.result);};});
  }
  async function examples() {var db=await database();try{return await new Promise(function(resolve,reject){var tx=db.transaction('examples','readonly'),request=tx.objectStore('examples').getAll();request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error);};});}finally{db.close();}}
  async function hash(buffer){var digest=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));return Array.from(digest,function(b){return b.toString(16).padStart(2,'0');}).join('');}
  async function saveExample(source,text,kind,file){
    text=String(text||'').trim();if(!text||text.length>4000)throw failed('example-text');
    var blob=await new Promise(function(resolve){source.toBlob(resolve,'image/png');});if(!blob)throw failed('example-image');
    var imageHash=await hash(await blob.arrayBuffer()),documentHash=file?await hash(await file.arrayBuffer()):imageHash;
    var record={id:documentHash+':'+imageHash+':'+kind,documentHash:documentHash,kind:kind,text:text,image:blob,createdAt:new Date().toISOString()};
    var db=await database();try{await new Promise(function(resolve,reject){var tx=db.transaction('examples','readwrite');tx.objectStore('examples').put(record);tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};tx.onabort=function(){reject(tx.error||failed('example-save'));};});}finally{db.close();}return (await examples()).length;
  }
  async function exportExamples(){
    var records=await examples(),items=[];if(!records.length)throw failed('examples-empty');
    for(var record of records){var base64=await new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result.split(',')[1]);};reader.onerror=function(){reject(reader.error);};reader.readAsDataURL(record.image);});items.push({id:record.id,documentHash:record.documentHash,kind:record.kind,text:record.text,createdAt:record.createdAt,image:{mime:'image/png',base64:base64}});}
    return new Blob([JSON.stringify({schema:1,application:'Label Configurator',examples:items},null,2)],{type:'application/json'});
  }
  window.__lcHandwriting={recognize:recognize,prepare:prepare,cancel:cancel,saveExample:saveExample,exportExamples:exportExamples,countExamples:async function(){return (await examples()).length;}};
}());

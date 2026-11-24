/* Evaluate local handwriting against an external manifest; never ship test photos. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--manifest','--playwright','--output','--url','--edge'].includes(args[i])||!args[i+1])throw new Error('Expected --manifest FILE --playwright MODULE --output FILE [--url URL] [--edge EXE]');options[args[i].slice(2)]=args[i+1];}
if(!options.manifest||!options.playwright||!options.output)throw new Error('--manifest, --playwright and --output are required');
const {chromium}=require(path.resolve(options.playwright)),url=options.url||'http://127.0.0.1:8767/';
const origin=new URL(url).origin,payload=JSON.parse(fs.readFileSync(options.manifest,'utf8')),samples=Array.isArray(payload)?payload:payload.samples;
if(!Array.isArray(samples)||!samples.length||samples.length>2000)throw new Error('Expected 1–2000 samples');
const records=samples.map((item,index)=>{
 if(!item||typeof item.text!=='string'||!item.text.trim()||typeof item.file!=='string')throw new Error('Invalid sample '+index);
 const file=path.resolve(path.dirname(path.resolve(options.manifest)),item.file),mode=item.mode||'text',rotate=item.rotate||0;
 if(!['text','code','auto'].includes(mode)||!Number.isFinite(rotate))throw new Error('Invalid recognition options '+index);
 if(item.box&&(!Array.isArray(item.box)||item.box.length!==4||!item.box.every(Number.isFinite)||item.box[0]<0||item.box[1]<0||item.box[2]<=0||item.box[3]<=0))throw new Error('Invalid crop '+index);
 const ext=path.extname(file).toLowerCase(),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
 if(!mime||fs.statSync(file).size>20*1024*1024)throw new Error('Unsupported image '+index);
 return{item,file,mime,mode,rotate};
});
function normalize(text){return text.normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();}
function distance(a,b){a=Array.from(a);b=Array.from(b);let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]!==b[j])));row=next;}return row[b.length];}
function summarize(rows){const total=rows.reduce((n,r)=>n+Array.from(normalize(r.expected)).length,0);return{samples:rows.length,exact:rows.filter(r=>r.exact).length,failed:rows.filter(r=>r.error).length,cer:total?rows.reduce((n,r)=>n+r.errors,0)/total:0};}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:options.edge||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),blocked=[],pageErrors=[],results=[];
  await context.route('**/*',route=>{const request=route.request();if(new URL(request.url()).origin===origin&&request.method()==='GET')return route.continue();blocked.push({url:request.url(),method:request.method()});return route.abort();});
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__lcHandwriting);
  for(const {item,file,mime,mode,rotate} of records){
   const started=Date.now();let reading;
   try{
    /* Ground truth is deliberately excluded from browser data. */
    reading=await page.evaluate(async data=>{
     const image=new Image();image.src=data.image;await image.decode();
     const angle=data.rotate*Math.PI/180,c=document.createElement('canvas');c.width=Math.round(image.width*Math.abs(Math.cos(angle))+image.height*Math.abs(Math.sin(angle)));c.height=Math.round(image.width*Math.abs(Math.sin(angle))+image.height*Math.abs(Math.cos(angle)));
     const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.rotate(-angle);ctx.drawImage(image,-image.width/2,-image.height/2);
     let source=c;
     if(data.box){const[x,y,w,h]=data.box;if(x+w>c.width||y+h>c.height)throw new Error('Crop outside image');source=document.createElement('canvas');source.width=w;source.height=h;source.getContext('2d').drawImage(c,x,y,w,h,0,0,w,h);}
     const result=await __lcHandwriting.recognize(source,{kind:data.mode,singleLine:data.singleLine,useVocabulary:true});
     return{text:result.text,alternatives:result.alternatives.map(x=>x.text),lineCount:result.lines.length,lexicon:result.lexicon,uncertainCode:result.uncertainCode};
    },{image:'data:'+mime+';base64,'+fs.readFileSync(file).toString('base64'),rotate,box:item.box,mode,singleLine:item.singleLine!==false});
   }catch(error){reading={text:'',error:error.message};}
   const row={id:item.id||String(results.length+1),kind:item.kind||'unspecified',source:item.source,expected:item.text,...reading,seconds:(Date.now()-started)/1000,errors:distance(normalize(reading.text),normalize(item.text)),exact:normalize(reading.text)===normalize(item.text)};
   results.push(row);
   const groups={};for(const kind of new Set(results.map(r=>r.kind)))groups[kind]=summarize(results.filter(r=>r.kind===kind));
   fs.writeFileSync(options.output,JSON.stringify({date:new Date().toISOString(),url,summary:summarize(results),groups,pageErrors,blocked,results},null,2),'utf8');
   console.log(row.id+': '+(row.error?'FAILED':row.exact?'EXACT':'errors='+row.errors)+' ('+row.seconds+'s)');
  }
  if(pageErrors.length||results.some(r=>r.error))process.exitCode=1;
  console.log(JSON.stringify(summarize(results)));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});

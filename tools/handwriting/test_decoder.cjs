const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../handwriting-worker.js'),'utf8');
function reading(text,kind='text',vocabulary=[],confusion=null,words=[],useLexicon=true){
 const context={self:{location:{href:'http://localhost/handwriting-worker.js'},addEventListener(){}},URL};
 vm.runInNewContext(source,context);
 context.lexicon=new Set(words);
 const confusions=confusion?(Array.isArray(confusion)?confusion:[confusion]):[];
 const alphabet=['',...new Set(Array.from(text+vocabulary.join('')+confusions.map(c=>c.alternative).join('')+' '))];
 context.characters=alphabet;const steps=text.length*2+1,classes=alphabet.length,data=new Float32Array(steps*classes);
 for(let time=0;time<steps;time++){
  if(time%2===0){data[time*classes]=1;continue;}
  const index=(time-1)/2,character=text[index];
  const alternative=confusions.find(c=>c.index===index);
  if(alternative){data[time*classes+alphabet.indexOf(character)]=.78;data[time*classes+alphabet.indexOf(alternative.alternative)]=.18;data[time*classes]=.04;}
  else data[time*classes+alphabet.indexOf(character)]=1;
 }
 return context.decode({data,dims:[1,steps,classes]},kind,vocabulary,useLexicon);
}
test('a verified name can resolve a one-letter ambiguity using CTC evidence',()=>{
 const result=reading('рассовая клавиатура','text',['Кассовая клавиатура'],{index:0,alternative:'К'});
 assert.equal(result.text,'Кассовая клавиатура');assert.equal(result.dictionary,true);assert.equal(result.raw,'рассовая клавиатура');assert.ok(result.alternatives.includes('рассовая клавиатура'));
});
test('unrelated saved names never replace the observed text',()=>{
 const result=reading('телевизор','text',['Кассовая клавиатура','Системный блок']);assert.equal(result.text,'телевизор');assert.equal(result.dictionary,false);
});
test('saved names do not change digits in an equipment name',()=>{
 const result=reading('Принтер 7','text',['Принтер 1']);assert.equal(result.text,'Принтер 7');assert.equal(result.dictionary,false);
});
test('number mode reads the image and ignores all saved values',()=>{
 const result=reading('В40К0123','code',['B40K9999']);assert.equal(result.text,'B40K0123');assert.equal(result.dictionary,false);
});
test('repeated letters separated by CTC blanks remain repeated',()=>{
 assert.equal(reading('AABB0011','code').text,'AABB0011');
});

test('close handwritten code alternatives carry an ambiguity flag without changing digits',()=>{
 const result=reading('B40K0123','code',[],{index:2,alternative:'O'});
 assert.equal(result.text,'B40K0123');assert.equal(result.uncertainCode,true);assert.ok(result.alternatives.includes('B4OK0123'));
});

test('auto preserves code ambiguity and ignores dictionaries for that code',()=>{
 const result=reading('B40K0123','auto',['B4OK9999'],{index:2,alternative:'O'},['велосипед']);
 assert.equal(result.kind,'code');assert.equal(result.text,'B40K0123');assert.equal(result.uncertainCode,true);assert.equal(result.lexicon,false);assert.equal(result.dictionary,false);
});

test('a clear code does not acquire an ambiguity flag',()=>{
 assert.equal(reading('AB12345','code').uncertainCode,false);
});
test('general lexicon chooses a one-letter alternative supported by CTC',()=>{
 const r=reading('веласипед','text',[],{index:3,alternative:'о'},['велосипед']);assert.equal(r.text,'велосипед');assert.equal(r.lexicon,true);assert.ok(r.alternatives.includes('веласипед'));
});
test('general lexicon never invents a word absent from the CTC candidates',()=>{
 const r=reading('веласипед','text',[],null,['велосипед']);assert.equal(r.text,'веласипед');assert.equal(r.lexicon,false);
});
test('general lexicon preserves already valid words',()=>{
 const r=reading('масса','text',[],{index:0,alternative:'к'},['масса','касса']);assert.equal(r.text,'масса');assert.equal(r.lexicon,false);
});
test('general lexicon can be disabled',()=>{
 const r=reading('веласипед','text',[],{index:3,alternative:'о'},['велосипед'],false);assert.equal(r.text,'веласипед');assert.equal(r.lexicon,false);
});
test('numbers and historical spelling bypass general spelling correction',()=>{
 assert.equal(reading('веласипед7','text',[],{index:3,alternative:'о'},['велосипед']).text,'веласипед7');
 assert.equal(reading('велосипѣд','text',[],{index:7,alternative:'е'},['велосипед']).text,'велосипѣд');
 assert.equal(reading('В40К0123','auto',[],null,['велосипед']).text,'B40K0123');
});
test('auto detects a handwritten code without substituting a saved number',()=>{
 const result=reading('В40К0123','auto',['B40K9999']);assert.equal(result.text,'B40K0123');assert.equal(result.kind,'code');assert.equal(result.dictionary,false);
});
test('auto keeps Russian equipment names with digits in text mode',()=>{
 const result=reading('Принтер 123','auto',['Принтер 999']);assert.equal(result.text,'Принтер 123');assert.equal(result.kind,'text');assert.equal(result.dictionary,false);
});
test('auto marks an unknown Cyrillic letter in a predominantly numeric identifier',()=>{
 const result=reading('В4ПК002610','auto',['B40K9999']);assert.equal(result.text,'B4?K002610');assert.equal(result.kind,'code');assert.equal(result.dictionary,false);
});
test('an unsupported letter is marked instead of silently disappearing from a code',()=>{
 assert.equal(reading('B4ДK0123','code').text,'B4?K0123');
});
test('printable code punctuation is preserved',()=>{
 assert.equal(reading('AB#12/34','code').text,'AB#12/34');
});
test('a more distant verified name is offered for review without replacing the image reading',()=>{
 const expected='кассовый монитор',changes=[{index:0,value:'р'},{index:6,value:'и'},{index:9,value:'н'},{index:14,value:'а'}];
 const letters=Array.from(expected);changes.forEach(c=>{letters[c.index]=c.value});const raw=letters.join('');
 const result=reading(raw,'text',[expected],changes.map(c=>({index:c.index,alternative:expected[c.index]})));
 assert.equal(result.text,raw);assert.equal(result.dictionary,false);assert.equal(result.suggestion,expected);assert.ok(result.alternatives.includes(expected));
});

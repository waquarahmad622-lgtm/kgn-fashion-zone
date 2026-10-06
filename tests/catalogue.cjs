const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
(async()=>{
 await testGalleryZoom();
 const dom=new JSDOM(read('admin.html'),{url:'https://example.test/admin.html',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.eval=code=>require('node:vm').runInContext(code,dom.getInternalVMContext());await new Promise(r=>w.setTimeout(r,0));w.HTMLElement.prototype.scrollIntoView=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.alert=()=>{};w.confirm=()=>true;w.eval(read('admin.js'));w.eval('gallerySupported=true;products=[];sessionUser={id:"admin"};');w.eval(read('admin-bundles.js'));w.openEditor();
 for(const lang of ['hi','en','ur'])w.document.getElementById('name_'+lang).value='Test '+lang;
 w.document.querySelector('[data-size="S"]').click();w.document.querySelector('[data-pack="3"]').click();
 const input=(selector,value)=>{const el=w.document.querySelector(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}))};input('[data-rate-size="S"]','100');input('[data-original-size="S"]','200');
 let p=w.formPayload();assert.equal(p.size_rates.S,100);assert.equal(p.size_original_rates.S,200);assert.ok(!('stock_qty' in p));
 input('[data-original-size="S"]','99');assert.throws(()=>w.formPayload(),/Actual price/);input('[data-original-size="S"]','200');
 const files=Array.from({length:4},(_,i)=>new w.File(['test'],i+'.jpg',{type:'image/jpeg'}));w.addPhotos(files);assert.equal(w.document.querySelectorAll('.photo-tile').length,4);w.addPhotos([files[0]]);assert.equal(w.document.querySelectorAll('.photo-tile').length,4);assert.match(w.document.getElementById('status').textContent,/4 photos/);
 w.document.querySelectorAll('.photo-tile')[2].querySelector('button').click();assert.equal(w.eval('photoItems[0].file.name'),'2.jpg');w.document.querySelector('[aria-label="Remove photo 2"]').click();assert.equal(w.document.querySelectorAll('.photo-tile').length,3);
 // Upload/save failures remove only newly uploaded objects; successful saves survive a list refresh failure.
 w.eval(`photoItems=[{path:'products/11111111-1111-4111-8111-111111111111.jpg'},{file:new File(['x'],'new.jpg',{type:'image/jpeg'})}];imageBlob=async()=>new Blob(['x']);imageId=()=> '22222222-2222-4222-8222-222222222222';window.removed=[];db={storage:{from:()=>({upload:async()=>({error:null}),remove:async paths=>{removed.push(...paths);return {error:null}},getPublicUrl:path=>({data:{publicUrl:path}})})},from:()=>({insert:()=>({select:()=>({single:async()=>({error:{message:'Write rejected'}})})})})};`);
 await w.saveProduct({preventDefault(){}});assert.equal(w.removed.length,1);assert.ok(w.removed[0].includes('22222222'));assert.ok(!w.document.getElementById('productForm').hidden);
 w.eval(`removed=[];db.from=()=>({insert:row=>({select:()=>({single:async()=>{window.savedRow=row;return {error:null}}})})});loadAdmin=async()=>{throw Error('Offline')};`);await w.saveProduct({preventDefault(){}});assert.equal(w.removed.length,0);assert.equal(w.savedRow.image_paths.length,2);assert.equal(w.savedRow.image_path,w.savedRow.image_paths[0]);assert.ok(w.document.getElementById('productForm').hidden);
 dom.window.close();
 const c=new JSDOM(read('index.html'),{url:'https://example.test/index.html',runScripts:'outside-only',pretendToBeVisual:true});const v=c.window;v.eval=code=>require('node:vm').runInContext(code,c.getInternalVMContext());await new Promise(r=>v.setTimeout(r,0));v.scrollTo=()=>{};v.HTMLElement.prototype.scrollIntoView=()=>{};v.HTMLDialogElement.prototype.showModal=function(){this.open=true};v.HTMLDialogElement.prototype.close=function(){this.open=false};v.eval(read('customer.js'));v.eval(`cloudConfigured=true;window.KGN_CLOUD_CONFIG={url:'https://test.supabase.co'};sb={storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:'https://test.supabase.co/storage/v1/object/public/product-photos/'+path}})})}};products=[mapRow({id:'p1',image_path:'products/11111111-1111-4111-8111-111111111111.jpg',image_paths:['products/11111111-1111-4111-8111-111111111111.jpg','products/22222222-2222-4222-8222-222222222222.jpg'],name_en:'Dress',name_hi:'ड्रेस',name_ur:'لباس',category:'ladies',rate:100,sale_rate:null,unit:'piece',published:true})];`);v.eval(read('catalog-gallery.js'));v.renderAll();v.document.querySelector('[data-gallery="p1"]').click();assert.equal(v.document.getElementById('kgnGalleryCount').textContent,'1 / 2');v.document.getElementById('kgnGalleryNext').click();assert.equal(v.document.getElementById('kgnGalleryCount').textContent,'2 / 2');assert.match(v.document.getElementById('kgnGalleryImage').src,/22222222/);v.document.getElementById('kgnGalleryClose').click();
 // Exercise the real inline legacy viewer too: an image click must open only the gallery.
 const legacyViewerScript=Array.from(v.document.scripts).find(s=>s.textContent.includes('function initKgnFix()'));
 assert.ok(legacyViewerScript);v.eval(legacyViewerScript.textContent);
 v.document.querySelector('[data-gallery="p1"] img').click();
 assert.equal(v.document.querySelectorAll('dialog[open]').length,1,'A catalogue photo must not open both viewers');
 assert.ok(!v.document.getElementById('kgnPhotoViewer').open);assert.ok(v.document.querySelector('.kgn-gallery').open);
 v.document.getElementById('kgnGalleryClose').click();
 const cartPhoto=v.document.createElement('div');cartPhoto.className='cart-item';cartPhoto.innerHTML='<img src="https://example.test/cart.jpg" alt="Enquiry photo">';v.document.body.append(cartPhoto);cartPhoto.querySelector('img').click();assert.ok(v.document.getElementById('kgnPhotoViewer').open,'Enquiry photo fallback must still work');v.document.getElementById('kgnPhotoClose').click();cartPhoto.remove();
 v.eval('sb=null');v.eval(read('customer-bundles.js'));const result=v.KGNBundle.priceMarkup({sizeRates:{S:100},sizeOriginalRates:{S:200}},'S');assert.match(result,/50% off/);assert.match(result,/<del>/);assert.ok(!v.KGNBundle.priceMarkup({sizeRates:{S:100},sizeOriginalRates:{S:99}},'S').includes('<del>'));
 v.eval(read('commerce.js'));assert.ok(v.document.getElementById('kgnCheckout').hidden);assert.ok(v.document.getElementById('kgnTrackForm'));v.applyLang('ur');assert.equal(v.document.getElementById('kgnTrackTitle').textContent,'آرڈر ٹریکنگ');v.close();console.log('PASS catalogue pricing, four-photo cap/reorder/removal, rollback, persisted-save recovery, customer gallery, multilingual checkout and setup gating');
})().catch(e=>{console.error(e);process.exitCode=1});

async function testGalleryZoom(){
 for(const pointerSupport of [true,false]){
  const dom=new JSDOM('<!doctype html><html lang="hi"><body><button data-gallery="one">Open four photos</button><button data-gallery="two">Open single photo</button></body></html>',{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,$=id=>d.getElementById(id);
  w.eval=code=>require('node:vm').runInContext(code,dom.getInternalVMContext());
  if(pointerSupport)w.PointerEvent=w.MouseEvent;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
  w.eval('const products=[{id:"one",name:"Four photos",images:["1.jpg","2.jpg","3.jpg","4.jpg"]},{id:"two",name:"Single photo",image:"single.jpg"}];const displayName=p=>p.name;const imgSrc=p=>p;');
  w.eval(read('catalog-gallery.js'));await new Promise(r=>w.setTimeout(r,0));
  const viewport=$('kgnGalleryViewport'),image=$('kgnGalleryImage'),dialog=d.querySelector('.kgn-gallery');
  Object.defineProperties(viewport,{clientWidth:{value:400},clientHeight:{value:300}});
  Object.defineProperties(image,{naturalWidth:{value:800,configurable:true},naturalHeight:{value:600,configurable:true}});
  viewport.getBoundingClientRect=()=>({left:0,top:0,width:400,height:300});
  const open=()=>d.querySelector('[data-gallery="one"]').click();
  const zoom=()=>Number($('kgnGalleryZoomLevel').textContent.replace('×',''));
  const transform=()=>image.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([-\d.]+)\)/).slice(1).map(Number);
  const gesture=(name,id,x,y,kind='touch')=>{
   let e;
   if(pointerSupport){e=new w.MouseEvent('pointer'+name,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(e,{pointerId:{value:id},pointerType:{value:kind}})}
   else{e=new w.Event('touch'+({down:'start',move:'move',up:'end',cancel:'cancel'}[name]),{bubbles:true,cancelable:true});Object.defineProperty(e,'changedTouches',{value:[{identifier:id,clientX:x,clientY:y}]})}
   viewport.dispatchEvent(e);
  };
  const key=key=>viewport.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  open();assert.equal(zoom(),1);assert.ok($('kgnGalleryZoomOut').disabled);assert.ok(d.body.classList.contains('kgn-gallery-open'));
  // Every gallery photo supports zoom and starts fitted after changing thumbnails.
  for(let i=0;i<4;i++){
   $('kgnGalleryThumbs').children[i].click();assert.equal(zoom(),1);assert.ok(image.src.endsWith((i+1)+'.jpg'));
   $('kgnGalleryZoomIn').click();assert.equal(zoom(),1.5);
  }
  for(let i=0;i<10;i++)$('kgnGalleryZoomIn').click();assert.equal(zoom(),4);assert.ok($('kgnGalleryZoomIn').disabled);
  gesture('down',1,200,150);gesture('move',1,2000,2000);gesture('up',1,2000,2000);
  assert.deepEqual(transform(),[600,450,4],'Panning stops at photo edges');
  const current=$('kgnGalleryCount').textContent;key('ArrowRight');assert.equal($('kgnGalleryCount').textContent,current,'Arrow keys pan a zoomed photo without switching it');
  $('kgnGalleryNext').click();assert.equal(zoom(),1);assert.deepEqual(transform(),[0,0,1]);
  // Pinch zoom, then drag with the remaining finger, must not trigger a swipe.
  gesture('down',1,100,150);gesture('down',2,200,150);gesture('move',1,50,150);gesture('move',2,250,150);
  assert.equal(zoom(),2);const pinchedIndex=$('kgnGalleryCount').textContent;
  gesture('up',2,250,150);gesture('move',1,100,200);gesture('up',1,100,200);
  assert.equal($('kgnGalleryCount').textContent,pinchedIndex);assert.equal(zoom(),2);
  // Pinching inward returns to a centered fit and does not leave an offset.
  gesture('down',1,50,150);gesture('down',2,250,150);gesture('move',1,100,150);gesture('move',2,150,150);
  gesture('up',1,100,150);gesture('up',2,150,150);assert.equal(zoom(),1);assert.deepEqual(transform(),[0,0,1]);
  // Double-tap toggles zoom; cancelled/vertical gestures do not turn the page.
  for(let i=0;i<2;i++){gesture('down',1,200,150);gesture('up',1,200,150)}assert.equal(zoom(),2.5);
  $('kgnGalleryReset').click();assert.equal(zoom(),1);
  const before=$('kgnGalleryCount').textContent;
  gesture('down',1,300,150);gesture('move',1,100,150);gesture('cancel',1,100,150);assert.equal($('kgnGalleryCount').textContent,before);
  gesture('down',1,200,50);gesture('move',1,205,250);gesture('up',1,205,250);assert.equal($('kgnGalleryCount').textContent,before);
  gesture('down',1,300,150);gesture('move',1,100,150);gesture('up',1,100,150);assert.notEqual($('kgnGalleryCount').textContent,before,'A fitted photo still supports horizontal swipe navigation');
  // Narrow catalogue sheets cannot pan into empty horizontal space.
  Object.defineProperties(image,{naturalWidth:{value:200},naturalHeight:{value:1000}});
  key('+');key('+');gesture('down',1,200,150);gesture('move',1,500,500);gesture('up',1,500,500);assert.equal(transform()[0],0);assert.equal(transform()[1],150);
  key('0');assert.equal(zoom(),1);
  $('kgnGalleryClose').click();assert.ok(!d.body.classList.contains('kgn-gallery-open'));assert.equal(d.activeElement.dataset.gallery,'one');
  for(const [lang,reset] of [['en','Fit photo'],['hi','पूरी फोटो'],['ur','پوری تصویر']]){d.documentElement.lang=lang;open();assert.equal($('kgnGalleryReset').textContent,reset);$('kgnGalleryClose').click()}
  d.querySelector('[data-gallery="two"]').click();assert.equal(zoom(),1);assert.ok($('kgnGalleryNext').disabled);$('kgnGalleryZoomIn').click();assert.equal(zoom(),1.5);$('kgnGalleryClose').click();
  dom.window.close();
 }
 console.log('PASS catalogue zoom: all photos, 4x limit, pinch/pan bounds, double-tap, swipe/cancel, navigation reset, focus and three languages (pointer + touch fallback)');
}

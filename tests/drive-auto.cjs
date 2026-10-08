const {JSDOM}=require('jsdom'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../customer-data.js'),'utf8');
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const profile=id=>({user_id:id,shop_name:id===a?'Shop A':'Shop B',phone:'9000000000',address:'Market',city:'City'});
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(){
 const dom=new JSDOM('<html lang="en"><body><form id="kgnOrderForm"><input id="kgnBuyer" name="name"><input name="phone"><input name="address"><input name="city"><input name="pincode"></form><section id="kgnPrivacyInfo"></section></body></html>',{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});await tick();
 const w=dom.window,timers=new Map(),calls=[];let timerId=0,fail=false,hold=null;
 w.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId};w.clearTimeout=id=>timers.delete(id);w.confirm=()=>true;w.safeText=v=>String(v??'').replace(/[&<>"']/g,'');w.applyLang=lang=>w.document.documentElement.lang=lang;
 w.fakeDB={functions:{invoke:async(name,{body})=>{calls.push(body);if(body.action==='status')return {data:{available:true,connected:true,client_id:'fake'}};if(body.action==='save'){if(hold)await hold;if(fail)throw Error('Network');return {data:{saved:true,saved_at:'2026-10-08T09:00:00Z'}}}return {data:{connected:false}}}}};
 vm.runInContext('const sb=window.fakeDB;',dom.getInternalVMContext());vm.runInContext(source,dom.getInternalVMContext());
 const event=id=>w.document.dispatchEvent(new w.CustomEvent('kgn:retailer-profile',{detail:id?profile(id):null}));
 const run=async()=>{const t=[...timers.entries()].sort((x,y)=>x[1].delay-y[1].delay)[0];if(t){timers.delete(t[0]);await t[1].fn();await tick();}};
 const edit=value=>{const input=w.document.querySelector('[name="address"]');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const saved=()=>JSON.parse(w.localStorage.getItem('kgn_customer_data_v1_'+a));
 return {w,dom,event,run,edit,saved,calls,timers,setFail:v=>fail=v,setHold:v=>hold=v};
}
(async()=>{
 const c=await setup();c.event(a);await tick();assert.equal(c.calls.filter(x=>x.action==='save').length,0,'login must not overwrite a remote backup');
 c.w.document.getElementById('kgnDriveAuto').click();c.edit('New address');c.edit('Newest address');await c.run();
 assert.equal(c.calls.filter(x=>x.action==='save').length,1);assert.equal(c.calls.at(-1).backup.contact.address,'Newest address');assert.equal(c.calls.at(-1).account_id,a);assert.equal(c.saved().drive_pending,false);assert.equal(c.saved().drive_last_backup,'2026-10-08T09:00:00Z');
 // In-flight changes must not be dropped when the first save completes.
 let release;c.setHold(new Promise(r=>release=r));c.edit('In flight');const running=c.run();await tick();c.edit('Changed during upload');release();await running;c.setHold(null);assert.equal(c.saved().drive_pending,true);await c.run();assert.equal(c.calls.at(-1).backup.contact.address,'Changed during upload');assert.equal(c.saved().drive_pending,false);
 // A transient failure persists dirty state and schedules a bounded retry.
 c.setFail(true);c.edit('Retry address');await c.run();assert.equal(c.saved().drive_pending,true);assert.ok([...c.timers.values()].some(t=>t.delay>=15000&&t.delay<=300000));c.setFail(false);await c.run();assert.equal(c.saved().drive_pending,false);
 // Offline edits are retried on the online event, with no repeated consent.
 Object.defineProperty(c.w.navigator,'onLine',{configurable:true,value:false});c.edit('Offline address');const count=c.calls.length;await c.run();assert.equal(c.calls.length,count);Object.defineProperty(c.w.navigator,'onLine',{configurable:true,value:true});c.w.dispatchEvent(new c.w.Event('online'));await c.run();assert.equal(c.calls.at(-1).backup.contact.address,'Offline address');
 c.w.document.getElementById('kgnDriveAuto').click();c.edit('Paused address');const paused=c.calls.length;await c.run();assert.equal(c.calls.length,paused);assert.equal(c.saved().drive_pending,true);
 c.w.document.getElementById('kgnDriveAuto').click();let finish;c.setHold(new Promise(r=>finish=r));const pending=c.run();await tick();c.event(b);await tick();finish();await pending;c.setHold(null);assert.ok(!c.w.document.getElementById('kgnCustomerData').textContent.includes('Last successful backup'));assert.ok(!c.w.localStorage.getItem('kgn_customer_data_v1_'+b));
 c.event(a);await tick();assert.equal(c.w.document.querySelector('[name="address"]').value,'Paused address');await c.run();assert.equal(c.saved().drive_pending,false);
 for(const lang of ['hi','en','ur']){c.w.applyLang(lang);assert.ok(c.w.document.getElementById('kgnDriveAuto'));assert.ok(c.w.document.getElementById('kgnDriveNow'));}
 c.w.document.getElementById('kgnDriveDisconnect').click();await tick();assert.equal(c.saved().drive_auto,false);assert.ok(c.w.document.getElementById('kgnDriveConnect'));c.dom.window.close();
 console.log('PASS Drive auto: opt-in, debounce, in-flight edits, persisted retries, offline recovery, pause, logout isolation, resume, translations and disconnect');
})().catch(e=>{console.error(e);process.exitCode=1});

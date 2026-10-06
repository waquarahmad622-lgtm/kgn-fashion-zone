const {JSDOM,VirtualConsole}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const id='11111111-1111-4111-8111-111111111111';
(async()=>{
 for(const scenario of [{required:true,available:true,verify:true},{required:false,available:true,verify:true},{required:false,available:true,verify:false},{required:false,available:false,verify:false}]){
 const phoneRequired=scenario.required;
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/navigation/.test(e.message))errors.push(e)});
 const dom=new JSDOM(read('index.html'),{url:'https://example.test/index.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.eval=code=>vm.runInContext(code,dom.getInternalVMContext());await new Promise(r=>w.setTimeout(r,0));
 Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.TextEncoder=TextEncoder;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.eval(read('customer.js'));
 const sent=[],headers=[];let output={id,amount:33000,url:'https://rzp.io/direct'},cleared=0;
 const items=[{id:'p1',size:'S',pack:3,pieces:3,bundles:1,quantity:3,rate_paise:11000}];
 w.fetch=async()=>({ok:true,json:async()=>({external:{phone:scenario.available}})});w.KGN_CLOUD_CONFIG={url:'https://test.supabase.co',publishableKey:'public'};w.supabase={createClient:()=>({auth:{signInWithOtp:async()=>({error:null}),verifyOtp:async()=>({data:{session:{access_token:'verified-phone-jwt',expires_at:Math.floor(Date.now()/1000)+3600},user:{phone:'919000000000',phone_confirmed_at:new Date().toISOString()}}})}})};w.eval(read('checkout-phone.js'));
 w.fakeDB={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{orders_enabled:true,online_enabled:true,cod_enabled:false,direct_checkout_enabled:true,policy_version:'orders-v2',phone_verification_required:phoneRequired}})})})}),functions:{invoke:async(name,opts)=>{assert.equal(name,'kgn-checkout');sent.push(opts.body);headers.push(opts.headers);return {data:output,error:null}}},rpc:async name=>{assert.equal(name,'kgn_track_order');return {data:{id,checkout_mode:'direct',delivery_payment:'courier_collect',status:'confirmed',payment_method:'online',payment_status:'paid',shipping_paise:0,subtotal_paise:33000,items,events:[{status:'confirmed',at:new Date().toISOString()}],created_at:new Date().toISOString()}}}};
 w.eval('sb=window.fakeDB;products=[{id:"p1"}];');
 w.KGNBundle={ready:()=>true,getLines:()=>items.map(x=>({...x})),priceFor:()=>110,clearPurchased:()=>{cleared++}};
 w.eval(read('commerce.js'));await new Promise(r=>setTimeout(r,0));
 const $=id=>w.document.getElementById(id);assert.equal($('kgnCheckout').hidden,false);
 $('kgnOpenOrder').click();assert.equal($('kgnOrderForm').hidden,false);assert.match($('kgnCheckoutTotal').textContent,/330/);assert.match($('kgnCheckoutTotal').textContent,/courier|Courier/);assert.ok(!$('kgnPayment').textContent.includes('पुष्टि के बाद'));
 for(const [lang,notice] of [['en','Pay separately to courier'],['ur','کوریئر کو الگ'],['hi','Courier को अलग']]){w.applyLang(lang);assert.ok($('kgnCheckoutTotal').textContent.includes(notice))}
 for(const [key,value] of Object.entries({kgnBuyer:'Test buyer',kgnPhone:'9000000000',kgnAddress:'10 Test Road Test Market',kgnCity:'Test City',kgnPin:'272175'}))$(key).value=value;
 $('kgnOrderForm').elements.consent.checked=true;
 const submit=()=>$('kgnOrderForm').onsubmit({preventDefault(){}});
 if(phoneRequired){assert.equal($('kgnSubmitOrder').disabled,true);await submit();assert.equal(sent.length,0)}
 if(scenario.verify){await $('kgnSendOTP').onclick();$('kgnOTP').value='123456';await $('kgnVerifyOTP').onclick();assert.equal($('kgnSubmitOrder').disabled,false)}
 else if(scenario.available){await $('kgnSendOTP').onclick();$('kgnOTP').value='12';assert.equal($('kgnOrderForm').checkValidity(),true,'Partially entered optional OTP must not block payment');await $('kgnVerifyOTP').onclick();assert.equal($('kgnSubmitOrder').disabled,false)}
 else{assert.equal($('kgnSendOTP').disabled,true);assert.match($('kgnPhoneStatus').textContent,/उपलब्ध नहीं/);assert.equal($('kgnSubmitOrder').disabled,false)}
 await submit();assert.equal(sent.length,1);assert.equal(sent[0].phone_verification,scenario.verify);assert.equal(headers[0]?.Authorization,scenario.verify?'Bearer verified-phone-jwt':undefined);assert.equal(sent[0].expected_subtotal,33000);assert.equal(sent[0].token.length,64);assert.equal($('kgnContinuePayment').href,'https://rzp.io/direct');
 const stored=JSON.parse(w.localStorage.getItem('kgn_private_orders_v34'));assert.equal(stored[0].id,id);assert.equal(stored[0].token,sent[0].token);
 const attempt=w.localStorage.getItem('kgn_checkout_attempt_v36');assert.ok(!attempt.includes('Test buyer'));assert.ok(!attempt.includes('9000000000'));
 await submit();assert.equal(sent[1].token,sent[0].token,'Retry must reuse the same token');
 output={id,url:'https://attacker.example/pay'};await submit();assert.equal($('kgnContinuePayment'),null);assert.ok($('kgnOrderMessage').classList.contains('kgn-commerce-error'));
 await $('kgnTrackForm').onsubmit({preventDefault(){}});assert.equal(cleared,1);assert.equal($('kgnTrackResult').querySelector('a[href*="rzp.io"]'),null);assert.ok(!$('kgnTrackResult').textContent.includes('दुकान ने पुष्टि की'));assert.match($('kgnTrackResult').textContent,/Courier को अलग/);
 await $('kgnTrackForm').onsubmit({preventDefault(){}});assert.equal(cleared,1,'Reopening an old paid order must not clear a new cart');
 assert.equal(w.localStorage.getItem('kgn_checkout_attempt_v36'),null);assert.deepEqual(errors,[]);w.close();
 }
 console.log('PASS checkout UI: translated courier freight, goods total, persisted retry token, safe payment navigation and verified-payment cart clearing');
})().catch(e=>{console.error(e);process.exitCode=1});

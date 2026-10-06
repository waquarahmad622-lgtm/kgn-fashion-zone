const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),tick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
 const dom=new JSDOM('<html lang="en"><input id="kgnPhone"><input id="kgnBuyer"><textarea id="kgnAddress"></textarea><input id="kgnCity"><input id="kgnPin"><div id="kgnPhoneVerification"></div><div id="kgnDeliveryPreview"></div>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 let now=Date.now(),sent=[],verified=[],result,resolveOTP,signal,changes=0,verifyDeferred;
 w.Date.now=()=>now;w.KGN_CLOUD_CONFIG={url:'https://example.test',publishableKey:'public-only'};
 w.localStorage.setItem('existing_admin_session','untouched');
 w.OTPCredential=function(){};Object.defineProperty(w.navigator,'credentials',{value:{get:opts=>{signal=opts.signal;return new Promise(r=>resolveOTP=r)}}});
 w.supabase={createClient:(url,key,opts)=>{assert.equal(opts.auth.persistSession,false);assert.equal(opts.auth.autoRefreshToken,false);assert.equal(opts.auth.detectSessionInUrl,false);assert.equal(opts.auth.storageKey,'kgn_checkout_phone_v37');return {auth:{signInWithOtp:async args=>{sent.push(args);return {error:null}},verifyOtp:async args=>{verified.push(args);if(verifyDeferred)return verifyDeferred;return result}},rpc:async(name,args)=>({data:{name,phone:args.p_buyer.phone}})}}};
 w.eval(read('checkout-phone.js'));w.KGNPhone.attach({required:false});assert.equal($('kgnPhoneVerification').hidden,true);
 w.KGNPhone.attach({required:true,onChange:()=>changes++});assert.equal($('kgnPhoneVerification').hidden,false);assert.equal($('kgnOTP').autocomplete,'one-time-code');assert.equal($('kgnOTP').inputMode,'numeric');
 $('kgnPhone').value='123';await $('kgnSendOTP').onclick();assert.equal(sent.length,0);
 $('kgnPhone').value='9000000000';$('kgnBuyer').value='<script>alert(1)</script>';$('kgnAddress').value='10 Test Road';$('kgnCity').value='Test City';$('kgnPin').value='272175';
 await $('kgnSendOTP').onclick();assert.equal(sent.length,1);assert.equal(sent[0].phone,'+919000000000');assert.equal(sent[0].options.channel,'sms');assert.equal($('kgnSendOTP').disabled,true);
 assert.ok($('kgnDeliveryPreview').textContent.includes('+91 9000000000'));assert.equal($('kgnDeliveryPreview').querySelector('script'),null);
 resolveOTP({code:'123456'});await tick();assert.equal($('kgnOTP').value,'123456');assert.equal(verified.length,0,'Autofill never submits verification or payment');assert.equal(w.KGNPhone.getToken(),'');
 result={error:{message:'bad OTP'}};await $('kgnVerifyOTP').onclick();assert.equal(w.KGNPhone.getToken(),'');assert.match($('kgnPhoneStatus').textContent,/incorrect or expired/);assert.ok(signal.aborted);
 const session={access_token:'test-phone-jwt',expires_at:Math.floor(now/1000)+3600};result={data:{session,user:{phone:'919000000000',phone_confirmed_at:new Date().toISOString()}}};
 await $('kgnVerifyOTP').onclick();assert.equal(w.KGNPhone.getToken(),'test-phone-jwt');assert.equal($('kgnOTP').value,'');assert.ok($('kgnDeliveryPreview').textContent.includes('Mobile verified'));assert.equal(w.KGNPhone.getToken('9111111111'),'');
 assert.equal(w.localStorage.length,1);assert.equal(w.localStorage.getItem('existing_admin_session'),'untouched');assert.equal(w.sessionStorage.length,0);
 assert.equal((await w.KGNPhone.placeOrder({p_buyer:{phone:'9000000000'}})).data.phone,'9000000000');
 $('kgnPhone').value='9111111111';$('kgnPhone').dispatchEvent(new w.Event('input'));assert.equal(w.KGNPhone.getToken(),'');assert.ok(!$('kgnDeliveryPreview').textContent.includes('Mobile verified'));
 now+=61000;await $('kgnSendOTP').onclick();assert.equal(sent.length,2);$('kgnOTP').value='654321';let release;verifyDeferred=new Promise(r=>release=r);const pending=$('kgnVerifyOTP').onclick();$('kgnPhone').value='9222222222';$('kgnPhone').dispatchEvent(new w.Event('input'));release({data:{session,user:{phone:'919111111111',phone_confirmed_at:new Date().toISOString()}}});await pending;assert.equal(w.KGNPhone.getToken(),'','An old response cannot verify a changed number');assert.ok(changes>0);
 w.close();
 // Delivery contact stays in the authorized admin view and copies a useful address label.
 const admin=new JSDOM('<section id="inventoryPanel"></section>',{url:'https://example.test/admin.html',runScripts:'outside-only'}),a=admin.window;await tick();let copied='';a.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));a.sessionUser={id:'admin'};a.loadAdmin=async()=>{};
 const row={id:'test-order',buyer_name:'Test buyer',address:'10 Test Road',city:'Test City',pincode:'272175',phone:'9000000000',items:[],subtotal_paise:33000,shipping_paise:0,status:'confirmed',payment_method:'online',payment_status:'unpaid',created_at:new Date().toISOString(),phone_verified_at:null};
 a.db={from:table=>({select:()=>table==='kgn_commerce_settings'?{eq:()=>({maybeSingle:async()=>({data:{orders_enabled:true,online_enabled:true}})})}:{order:()=>({limit:async()=>({data:[row]})})}})};Object.defineProperty(a.navigator,'clipboard',{value:{writeText:async value=>copied=value}});
 a.eval(read('admin-orders.js'));await a.loadAdmin();assert.equal(a.document.querySelector('a[href^="tel:"]').href,'tel:+919000000000');assert.ok(!a.document.querySelector('.kgn-delivery-contact').textContent.includes('✓ OTP verified'));await a.document.querySelector('[data-delivery]').onclick();for(const value of ['10 Test Road','272175','Mobile: +91 9000000000','test-order'])assert.ok(copied.includes(value));row.phone_verified_at=new Date().toISOString();await a.loadAdmin();assert.ok(a.document.querySelector('.kgn-delivery-contact').textContent.includes('✓ OTP verified'));a.close();
 console.log('PASS mobile OTP: manual/autofill, resend limits, changed-number race, memory-only session, safe address preview and admin call/copy');
})().catch(e=>{console.error(e);process.exitCode=1});
  

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript'),path=require('node:path');
const id='11111111-1111-4111-8111-111111111111',token='a'.repeat(64),expiry=Math.floor(Date.now()/1000)+1800;
function fixture(options={}){
 const calls=[],writes=[];let handler,posts=0;
 const db={auth:{getUser:async jwt=>{calls.push({authJWT:jwt});return options.authError?{error:{message:'Expired'},data:{user:null}}:{data:{user:options.user||{id:'verified-user',phone:'919000000000',phone_confirmed_at:new Date().toISOString()}}}}},rpc:async(name,args)=>{calls.push({name,args});
  if(name==='kgn_checkout_expiry_candidates')return {data:options.stale||[]};
  if(name==='kgn_release_expired_checkout')return {data:true};
  if(name==='kgn_prepare_checkout'||name==='kgn_prepare_phone_checkout'||name==='kgn_prepare_retailer_checkout')return options.stockError?{error:{message:'Not enough unreserved stock'}}:{data:{id}};
  if(name==='kgn_claim_checkout_payment')return options.invalidKey?{error:{message:'Order ID or secure key is incorrect'}}:{data:options.claim||{amount:33000,expire_by:expiry}};
  throw Error('Unexpected RPC '+name);
 },from:table=>({select:()=>{const q={eq:()=>q,single:async()=>({data:{retailer_access_required:!!options.retailerGate}}),maybeSingle:async()=>({data:options.retailerStatus===null?null:{status:options.retailerStatus||'approved'}})};return q},update:values=>{writes.push({table,values});const q={eq:()=>q,select:()=>q,maybeSingle:async()=>({data:{id},error:null}),then:resolve=>Promise.resolve({error:null}).then(resolve)};return q}})};
 const env={RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'private-secret',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret',...options.env};
 const fetch=async(url,request)=>{
  if(request.method==='POST'){posts++;const body=JSON.parse(request.body);calls.push({gatewayBody:body});if(options.timeout)throw Error('Gateway timeout');return new Response(JSON.stringify({id:'plink_direct',short_url:'https://rzp.io/direct',amount:33000,currency:'INR',reference_id:id,expire_by:expiry,accept_partial:false,...options.link}),{status:200})}
  return new Response(JSON.stringify(options.expiredLink||{}),{status:200});
 };
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/kgn-checkout/index.ts'),'utf8').replace(/^import[^\n]*\n/,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},reportDiagnostics:true});
 assert.equal((code.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 vm.runInNewContext(code.outputText,{Deno:{env:{get:k=>env[k]},serve:h=>handler=h},createClient:()=>db,fetch,crypto:crypto.webcrypto,TextEncoder,Uint8Array,URL,Response,Request,AbortSignal,btoa,Promise});
 return {handler,calls,writes,posts:()=>posts};
}
const request=(body={},origin='https://waquarahmad622-lgtm.github.io')=>new Request('https://test.supabase.co/functions/v1/kgn-checkout',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({token,buyer:{name:'Test buyer'},lines:[{id,pack:3,pieces:3,bundles:1,size:'S'}],expected_subtotal:33000,policy:'orders-v2',...body})});
(async()=>{
 let f=fixture();assert.equal((await f.handler(request({},'https://attacker.example'))).status,403);assert.equal(f.calls.length,0);
 f=fixture();assert.equal((await f.handler(request({token:'short'}))).status,400);assert.equal(f.calls.length,0);
 f=fixture({stockError:true});assert.equal((await f.handler(request())).status,409);assert.equal(f.posts(),0);
 f=fixture({invalidKey:true});assert.equal((await f.handler(request({id}))).status,409);assert.equal(f.posts(),0);
 f=fixture();const response=await f.handler(request({amount:1,shipping_paise:-33000})),data=await response.json();assert.equal(response.status,200);assert.equal(data.amount,33000);assert.equal(data.url,'https://rzp.io/direct');const sent=f.calls.find(x=>x.gatewayBody).gatewayBody;assert.equal(sent.amount,33000);assert.equal(sent.accept_partial,false);assert.equal(sent.expire_by,expiry);assert.equal(sent.notify.sms,false);assert.equal(sent.notify.email,false);assert.equal(sent.notes.delivery_payment,'courier_collect');assert.ok(!('customer' in sent));assert.ok(!JSON.stringify(sent).includes(token));assert.ok(!JSON.stringify(data).includes('secret'));assert.match(sent.callback_url,/checkout_return=/);assert.equal(f.writes[0].values.payment_link_state,'ready');
 f=fixture({claim:{existing:true,url:'https://rzp.io/existing',amount:33000}});assert.equal((await (await f.handler(request({id}))).json()).url,'https://rzp.io/existing');assert.equal(f.posts(),0);
 f=fixture({claim:{paid:true}});assert.equal((await (await f.handler(request({id}))).json()).paid,true);assert.equal(f.posts(),0);
 f=fixture({timeout:true});assert.equal((await f.handler(request())).status,502);assert.equal(f.posts(),1);assert.equal(f.writes.at(-1).values.payment_link_state,'uncertain');
 f=fixture({link:{amount:1}});assert.equal((await f.handler(request())).status,502);assert.equal(f.writes.at(-1).values.payment_link_state,'uncertain');
 f=fixture({link:{short_url:'https://attacker.example/pay'}});assert.equal((await f.handler(request())).status,502);
 const phoneRequest=()=>{const r=request({phone_verification:true,buyer:{phone:'9000000000'},phone_user_id:'attacker-supplied-user'});r.headers.set('Authorization','Bearer sms-session');return r};
 f=fixture();assert.equal((await f.handler(request({phone_verification:true}))).status,401);assert.equal(f.posts(),0);
 for(const opts of [{authError:true},{user:{id:'other',phone:'919111111111',phone_confirmed_at:new Date().toISOString()}},{user:{id:'unconfirmed',phone:'919000000000'}}]){f=fixture(opts);assert.equal((await f.handler(phoneRequest())).status,401);assert.equal(f.posts(),0);assert.ok(!f.calls.some(x=>x.name==='kgn_prepare_phone_checkout'))}
 f=fixture();assert.equal((await f.handler(phoneRequest())).status,200);assert.equal(f.calls.find(x=>x.authJWT).authJWT,'sms-session');assert.equal(f.calls.find(x=>x.name==='kgn_prepare_phone_checkout').args.p_phone_user,'verified-user');assert.ok(!JSON.stringify(f.calls.find(x=>x.gatewayBody)).includes('sms-session'));
 const stale=[{id,payment_link_id:'plink_expired',payment_link_state:'ready',amount:33000}];
 const link={id:'plink_expired',reference_id:id,currency:'INR',amount:33000,amount_paid:0,status:'expired',payments:[]};
 f=fixture({stale,expiredLink:link,claim:{paid:true}});await f.handler(request({id}));assert.ok(f.calls.some(x=>x.name==='kgn_release_expired_checkout'));
 for(const changes of [{status:'created'},{status:'paid',amount_paid:33000},{reference_id:'wrong'},{payments:[{status:'captured'}]}]){f=fixture({stale,expiredLink:{...link,...changes},claim:{paid:true}});await f.handler(request({id}));assert.ok(!f.calls.some(x=>x.name==='kgn_release_expired_checkout'))}

 f=fixture({retailerGate:true});assert.equal((await f.handler(request())).status,401);assert.equal(f.posts(),0);
 const retailerRequest=()=>{const r=request();r.headers.set('Authorization','Bearer retailer-session');return r};
 for(const retailerStatus of ['pending','rejected','blocked',null]){f=fixture({retailerGate:true,retailerStatus});assert.equal((await f.handler(retailerRequest())).status,403);assert.equal(f.posts(),0);assert.ok(!f.calls.some(x=>x.name==='kgn_prepare_checkout'))}
 f=fixture({retailerGate:true});assert.equal((await f.handler(retailerRequest())).status,200);assert.equal(f.calls.find(x=>x.name==='kgn_prepare_retailer_checkout').args.p_retailer,'verified-user');
 f=fixture({retailerGate:true});const both=phoneRequest();both.headers.set('Authorization','Bearer retailer-session');both.headers.set('x-kgn-phone-authorization','Bearer sms-session');assert.equal((await f.handler(both)).status,200);assert.deepEqual(f.calls.filter(x=>x.authJWT).map(x=>x.authJWT),['retailer-session','sms-session']);
 f=fixture({retailerGate:true,claim:{existing:true,url:'https://rzp.io/existing',amount:33000}});assert.equal((await f.handler(request({id}))).status,200,'Existing private-key checkout remains usable');
 console.log('PASS direct checkout: private-key access, trusted totals, no duplicate links, callback privacy, uncertain results and verified expiry cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});

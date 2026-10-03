import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
const origin=Deno.env.get('KGN_SITE_ORIGIN')||'https://waquarahmad622-lgtm.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Cache-Control':'no-store','Content-Type':'application/json'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return json({error:'Use POST'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return json({error:'Origin not allowed'},403);
 const key=Deno.env.get('RAZORPAY_KEY_ID'),secret=Deno.env.get('RAZORPAY_KEY_SECRET');
 if(!key||!secret)return json({error:'Merchant payment account has not been configured'},503);
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return json({error:'Admin login required'},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
 const {data:auth,error:authError}=await userClient.auth.getUser(token);if(authError||!auth.user)return json({error:'Admin login required'},401);
 const {data:admin}=await userClient.from('admin_users').select('user_id').eq('user_id',auth.user.id).maybeSingle();if(!admin)return json({error:'Admin access required'},403);
 let id:string;try{const body=await req.json();id=body.id;if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw Error();}catch{return json({error:'Invalid order'},400)}
 const db=createClient(url,service,{auth:{persistSession:false}});
 const {data:claim,error}=await db.rpc('kgn_claim_payment_link',{p_id:id});if(error)return json({error:error.message},409);if(claim.existing)return json({url:claim.url});
 try{
  const response=await fetch('https://api.razorpay.com/v1/payment_links/',{method:'POST',headers:{Authorization:'Basic '+btoa(key+':'+secret),'Content-Type':'application/json'},body:JSON.stringify({amount:claim.amount,currency:'INR',accept_partial:false,reference_id:id,description:'K.G.N. Fashion Zone order '+id,notify:{sms:false,email:false},reminder_enable:false,notes:{kgn_order_id:id}}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Gateway could not create the link. Check the merchant dashboard before retrying.');
  const link=await response.json();const target=new URL(link.short_url);
  if(target.protocol!=='https:'||!['rzp.io','rzp.pay','razorpay.com'].some(h=>target.hostname===h||target.hostname.endsWith('.'+h))||target.username||target.password||link.amount!==claim.amount||link.currency!=='INR'||link.reference_id!==id||typeof link.id!=='string')throw Error('Gateway returned an unexpected link');
  const {error:saveError}=await db.from('kgn_orders').update({payment_link_id:link.id,payment_url:target.href,payment_link_state:'ready',updated_at:new Date().toISOString()}).eq('id',id).eq('payment_link_state','creating');if(saveError)throw Error('Link created but could not be saved. Reconcile this order in the gateway.');
  return json({url:target.href});
 }catch(error){await db.from('kgn_orders').update({payment_link_state:'uncertain'}).eq('id',id).eq('payment_link_state','creating');return json({error:error instanceof Error?error.message:'Payment setup failed'},502)}
});

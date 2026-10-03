import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Use POST',{status:405});
 const secret=Deno.env.get('RAZORPAY_WEBHOOK_SECRET');if(!secret)return new Response('Not configured',{status:503});
 const signature=req.headers.get('x-razorpay-signature')||'';if(!/^[0-9a-f]{64}$/i.test(signature))return new Response('Invalid signature',{status:401});
 const raw=await req.text();if(raw.length>262144)return new Response('Payload too large',{status:413});
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.match(/../g)!,h=>parseInt(h,16));
 if(!await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw)))return new Response('Invalid signature',{status:401});
 let event;try{event=JSON.parse(raw)}catch{return new Response('Invalid JSON',{status:400})}
 if(event.event!=='payment_link.paid')return new Response('Ignored',{status:200});
 const link=event.payload?.payment_link?.entity,payment=event.payload?.payment?.entity;
 if(!link||!payment||link.status!=='paid'||payment.status!=='captured'||payment.currency!=='INR'||link.currency!=='INR'||payment.amount!==link.amount||link.amount_paid!==link.amount||typeof payment.id!=='string'||typeof link.id!=='string'||!/^[0-9a-f-]{36}$/.test(link.reference_id||''))return new Response('Payment mismatch',{status:400});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {error}=await db.rpc('kgn_verify_payment',{p_id:link.reference_id,p_link:link.id,p_reference:payment.id,p_amount:link.amount,p_currency:link.currency});
 // A retry is safe if the link-save raced with the webhook; the RPC is idempotent.
 if(error)return new Response('Order verification pending',{status:409});return new Response('OK',{status:200});
});

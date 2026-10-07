import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const origin = Deno.env.get('KGN_SITE_ORIGIN') || 'https://waquarahmad622-lgtm.github.io';
const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Authorization'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max+1):'';
const alias=(phone:string)=>'retailer.'+phone+'@kgn-login.invalid';
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const client=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'Use POST'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply({error:'Origin not allowed'},403);
 if(Number(req.headers.get('content-length'))>2800000)return reply({error:'Photo too large'},413);
 try{
  const raw=await req.text();if(raw.length>2800000)return reply({error:'Photo too large'},413);
  const body=JSON.parse(raw);if(!body||Array.isArray(body))return reply({error:'Invalid request'},400);
  const db=client();
  if(body.action==='recoverPassword'){
   const phone=clean(body.phone,10),code=clean(body.code,10),password=typeof body.password==='string'?body.password:'';
   if(!/^[6-9][0-9]{9}$/.test(phone)||!/^\d{6,10}$/.test(code)||password.length<10||password.length>72||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return reply({error:'Check recovery details'},400);
   const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
   for(const [value,limit] of [['recovery:phone:'+phone,10],['recovery:ip:'+ip,30],['recovery:global',100]] as const){
    const {data,error}=await db.rpc('kgn_registration_limit',{p_key:await sha(value),p_limit:limit});
    if(error)return reply({error:'Recovery unavailable'},503);
    if(data!==true)return reply({error:'Too many attempts. Please try later'},429);
   }
   // Supabase consumes the expiring recovery code atomically. Never trust a
   // caller-supplied user ID, an unverified phone number, or a normal login JWT.
   const recovery=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const verified=await recovery.auth.verifyOtp({email:alias(phone),token:code,type:'recovery'});
   if(verified.error||!verified.data.user||!verified.data.session)return reply({error:'Invalid or expired reset code'},400);
   try{
    const user=verified.data.user;
    const target=await db.from('kgn_retailers').select('user_id').eq('user_id',user.id).eq('phone',phone).maybeSingle();
    if(user.email!==alias(phone)||target.error||!target.data)return reply({error:'Invalid or expired reset code'},400);
    const changed=await recovery.auth.updateUser({password});
    if(changed.error)return reply({error:'Password not changed. Ask for a new reset code'},409);
    return reply({reset:true});
   }finally{
    // Keep the recovery session server-side; customer explicitly logs in again.
    await recovery.auth.signOut({scope:'global'}).catch(()=>{});
   }
  }
  if(body.action==='register'){
   const phone=clean(body.phone,10),password=typeof body.password==='string'?body.password:'';
   const shop=clean(body.shop_name,100),name=clean(body.contact_name,100),address=clean(body.address,500),city=clean(body.city,100),gst=clean(body.gst,15).toUpperCase();
   if(!/^[6-9][0-9]{9}$/.test(phone)||password.length<10||password.length>72||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)||shop.length<2||shop.length>100||name.length<2||name.length>100||address.length<10||address.length>500||city.length<2||city.length>100||(gst&&!/^[A-Z0-9]{15}$/.test(gst))||body.consent!==true)return reply({error:'Check shop details and password'},400);
   if(typeof body.proof!=='string'||body.proof.length>2700000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.proof))return reply({error:'Add a shop photo or visiting card'},400);
   let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(body.proof.split(',')[1]),c=>c.charCodeAt(0));}catch{return reply({error:'Invalid photo'},400);}
   if(bytes.length<20||bytes.length>2000000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return reply({error:'Invalid photo'},400);
   const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
   for(const [value,limit] of [['phone:'+phone,3],['ip:'+ip,10],['global',100]] as const){
    const {data,error}=await db.rpc('kgn_registration_limit',{p_key:await sha(value),p_limit:limit});
    if(error)return reply({error:'Registration temporarily unavailable'},503);
    if(data!==true)return reply({error:'Too many attempts. Please try later'},429);
   }
   // This is an internal login identifier, NOT a verified customer email or phone.
   // Approval is stored only in the protected retailer table, never user metadata.
   const {data:created,error:createError}=await db.auth.admin.createUser({email:alias(phone),password,email_confirm:true,app_metadata:{kgn_identity:'unverified-mobile-login'}});
   if(createError||!created.user)return reply({error:'Account could not be created. If already registered, log in'},409);
   const uid=created.user.id,path=uid+'/'+crypto.randomUUID()+'.jpg';
   const upload=await db.storage.from('retailer-documents').upload(path,bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});
   if(upload.error){await db.auth.admin.deleteUser(uid);return reply({error:'Photo could not be saved. Try again'},503);}
   const saved=await db.from('kgn_retailers').insert({user_id:uid,phone,shop_name:shop,contact_name:name,address,city,gst,proof_path:path,status:'pending'});
   if(saved.error){await db.storage.from('retailer-documents').remove([path]);await db.auth.admin.deleteUser(uid);return reply({error:'Application could not be saved. Try again'},503);}
   // A separate auth client keeps the service client from adopting this user's JWT.
   const authClient=client();const {data,error}=await authClient.auth.signInWithPassword({email:alias(phone),password});
   if(error||!data.session)return reply({registered:true});
   return reply({registered:true,session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token}});
  }
  let uid:string|null=null;
  const bearer=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(bearer?.startsWith('eyJ')&&bearer!==Deno.env.get('SUPABASE_ANON_KEY')){
   const {data,error}=await db.auth.getUser(bearer);
   if(error||!data.user)return reply({error:'Please log in again'},401);
   uid=data.user.id;
  }
  if(body.action==='catalog'){
   const profile=uid?await db.from('kgn_retailers').select('user_id,phone,shop_name,contact_name,address,city,status,review_note').eq('user_id',uid).maybeSingle():{data:null,error:null};
   if(profile.error)return reply({error:'Could not check retailer access'},503);
   const approved=profile.data?.status==='approved';
   // Explicit public projection: never spread an unrestricted product into a guest response.
   const fields='id,sku,category,name_hi,name_en,name_ur,desc_hi,desc_en,desc_ur,moq,unit,is_new,is_featured,published,updated_at,size_options,pack_options,public_image_paths';
   const result=await db.from('products').select(fields+(approved?',rate,sale_rate,size_rates,size_original_rates,stock_qty,image_path,image_paths':'')).eq('published',true).order('updated_at',{ascending:false}).limit(250);
   if(result.error)return reply({error:'Catalogue unavailable'},503);
   const rows=await Promise.all((result.data||[]).map(async(row:any)=>{
    const out:any={...row,rate:approved?row.rate:null,sale_rate:approved?row.sale_rate:null,size_rates:approved?row.size_rates:{},size_original_rates:approved?row.size_original_rates:{},stock_qty:approved?row.stock_qty:null,image_urls:[]};
    if(approved){
     const paths=(row.image_paths?.length?row.image_paths:row.image_path?[row.image_path]:[]).slice(0,4);
     if(paths.length){const signed=await db.storage.from('product-photos').createSignedUrls(paths,300);if(signed.error)throw Error('Photo unavailable');out.image_urls=(signed.data||[]).map((x:any)=>x.signedUrl).filter(Boolean);}
    }else out.image_urls=(row.public_image_paths||[]).slice(0,4).map((path:string)=>db.storage.from('public-catalogue').getPublicUrl(path).data.publicUrl);
    delete out.image_path;delete out.image_paths;delete out.public_image_paths;
    return out;
   }));
   return reply({products:rows,profile:profile.data,approved});
  }
  if(body.action==='deleteProof'){
   if(!uid)return reply({error:'Admin login required'},401);
   const owner=await db.from('admin_users').select('user_id').eq('user_id',uid).maybeSingle();
   if(owner.error||!owner.data)return reply({error:'Admin only'},403);
   if(body.confirm!==true||typeof body.user_id!=='string'||!/^[0-9a-f-]{36}$/.test(body.user_id))return reply({error:'Confirm the selected retailer'},400);
   const target=await db.from('kgn_retailers').select('user_id,status,proof_path').eq('user_id',body.user_id).maybeSingle();
   if(target.error||!target.data)return reply({error:'Retailer not found'},404);
   if(target.data.status!=='approved')return reply({error:'Approve the retailer before deleting their proof'},409);
   const path=target.data.proof_path;
   if(!path)return reply({deleted:true});
   if(!path.startsWith(target.data.user_id+'/')||path.includes('..'))return reply({error:'Invalid document path'},409);
   // Storage API removes the object bytes; deleting storage metadata with SQL does not.
   const removed=await db.storage.from('retailer-documents').remove([path]);
   if(removed.error)return reply({error:'Photo could not be deleted. Try again'},503);
   // If the following update fails, retrying remove on the same path is safe.
   const updated=await db.from('kgn_retailers').update({proof_path:'',proof_deleted_at:new Date().toISOString(),gst:'',review_note:''}).eq('user_id',target.data.user_id).eq('proof_path',path).select('user_id');
   if(updated.error||!updated.data?.length)return reply({error:'Photo removed; refresh and retry to finish updating the record'},503);
   return reply({deleted:true});
  }
  if(body.action==='issueRecoveryCode'){
   if(!uid)return reply({error:'Admin login required'},401);
   const owner=await db.from('admin_users').select('user_id').eq('user_id',uid).maybeSingle();
   if(owner.error||!owner.data)return reply({error:'Admin only'},403);
   if(body.identity_checked!==true||typeof body.user_id!=='string'||!/^[0-9a-f-]{36}$/.test(body.user_id))return reply({error:'Verify the retailer identity first'},400);
   const target=await db.from('kgn_retailers').select('user_id,phone').eq('user_id',body.user_id).maybeSingle();
   if(target.error||!target.data)return reply({error:'Retailer not found'},404);
   const limited=await db.rpc('kgn_registration_limit',{p_key:await sha('recovery:issue:'+target.data.user_id),p_limit:5});
   if(limited.error||limited.data!==true)return reply({error:'Reset code limit reached. Try later'},429);
   // Generates a code without sending email/SMS or changing the old password.
   const generated=await db.auth.admin.generateLink({type:'recovery',email:alias(target.data.phone)});
   if(generated.error||generated.data.user?.id!==target.data.user_id||!/^\d{6,10}$/.test(generated.data.properties?.email_otp||''))return reply({error:'Could not create reset code'},503);
   return reply({code:generated.data.properties.email_otp});
  }
  if(body.action==='resetPassword'){
   if(!uid)return reply({error:'Admin login required'},401);
   const owner=await db.from('admin_users').select('user_id').eq('user_id',uid).maybeSingle();
   if(owner.error||!owner.data)return reply({error:'Admin only'},403);
   const target=await db.from('kgn_retailers').select('user_id').eq('user_id',body.user_id).maybeSingle();
   if(target.error||!target.data)return reply({error:'Retailer not found'},404);
   const temporary='Kgn-'+crypto.randomUUID().replaceAll('-','').slice(0,16);
   const changed=await db.auth.admin.updateUserById(target.data.user_id,{password:temporary});
   if(changed.error)return reply({error:'Could not reset password'},503);
   return reply({password:temporary});
  }
  return reply({error:'Unknown request'},400);
 }catch{return reply({error:'Connection failed. Please try again'},503);}
});
 
 

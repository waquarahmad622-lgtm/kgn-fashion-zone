import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const origin=Deno.env.get('KGN_SITE_ORIGIN')||'https://waquarahmad622-lgtm.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-requested-with','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Authorization'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const scope='https://www.googleapis.com/auth/drive.appdata';
const env=(key:string)=>Deno.env.get(key)||'';
const fetchTimed=(url:string,options:RequestInit={})=>fetch(url,{...options,signal:AbortSignal.timeout(15000)});
function validEncryptionKey(){try{return atob(env('KGN_BACKUP_ENCRYPTION_KEY')).length===32}catch{return false}}
async function crypt(value:string,uid:string,decode=false){
 const raw=Uint8Array.from(atob(env('KGN_BACKUP_ENCRYPTION_KEY')),c=>c.charCodeAt(0));
 if(raw.length!==32)throw Error('Configuration');
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
 const bytes=decode?Uint8Array.from(atob(value),c=>c.charCodeAt(0)):new TextEncoder().encode(value);
 const iv=decode?bytes.slice(0,12):crypto.getRandomValues(new Uint8Array(12));
 const params={name:'AES-GCM',iv,additionalData:new TextEncoder().encode(uid)};
 if(decode)return new TextDecoder().decode(await crypto.subtle.decrypt(params,key,bytes.slice(12)));
 const encoded=new Uint8Array(await crypto.subtle.encrypt(params,key,bytes));
 return btoa(String.fromCharCode(...iv,...encoded));
}
async function tokenRequest(body:Record<string,string>){
 const res=await fetchTimed('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:env('KGN_GOOGLE_CLIENT_ID'),client_secret:env('KGN_GOOGLE_CLIENT_SECRET')})});
 const result=await res.json();if(!res.ok){if(result.error==='invalid_grant')throw Error('reconnect_required');throw Error('Google authorization');}return result;
}
// Accept only customer-owned contact/receipt fields, never arbitrary app data or tokens.
function cleanBackup(value:any,uid:string){
 if(value?.format!=='kgn-customer-backup'||value.version!==1||value.account_id!==uid||!Array.isArray(value.orders)||value.orders.length>100)throw Error('Invalid backup');
 const text=(v:unknown,n:number)=>typeof v==='string'?v.slice(0,n):'';
 const number=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):0;
 return {format:'kgn-customer-backup',version:1,account_id:uid,exported_at:text(value.exported_at,40)||new Date().toISOString(),contact_updated_at:text(value.contact_updated_at,40),contact:{name:text(value.contact?.name,100),phone:text(value.contact?.phone,10),address:text(value.contact?.address,500),city:text(value.contact?.city,100),pincode:text(value.contact?.pincode,6)},orders:value.orders.map((o:any)=>({id:text(o.id,36),created_at:text(o.created_at,40),status:text(o.status,30),payment_status:text(o.payment_status,30),payment_method:text(o.payment_method,20),subtotal_paise:number(o.subtotal_paise),shipping_paise:number(o.shipping_paise),saved_at:text(o.saved_at,40),items:(Array.isArray(o.items)?o.items:[]).slice(0,30).map((x:any)=>({name:text(x.name,200),name_hi:text(x.name_hi,200),name_ur:text(x.name_ur,200),sku:text(x.sku,100),size:text(x.size,30),quantity:number(x.quantity),rate_paise:number(x.rate_paise)}))}))};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'Use POST'},405);
 if(req.headers.get('origin')!==origin||req.headers.get('x-requested-with')!=='KGNBackup')return reply({error:'Origin not allowed'},403);
 if(Number(req.headers.get('content-length'))>500000)return reply({error:'Backup too large'},413);
 try{
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const bearer=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!bearer?.startsWith('eyJ')||bearer===env('SUPABASE_ANON_KEY'))return reply({error:'Retailer login required'},401);
  const user=await db.auth.getUser(bearer);if(user.error||!user.data.user)return reply({error:'Please log in again'},401);
  const uid=user.data.user.id,profile=await db.from('kgn_retailers').select('user_id').eq('user_id',uid).maybeSingle();
  if(profile.error||!profile.data)return reply({error:'Retailer account required'},403);
  const raw=await req.text();if(raw.length>500000)return reply({error:'Backup too large'},413);
  const body=JSON.parse(raw),available=Boolean(env('KGN_GOOGLE_CLIENT_ID')&&env('KGN_GOOGLE_CLIENT_SECRET')&&validEncryptionKey());
  if(body.account_id&&body.account_id!==uid)return reply({error:'Retailer account changed',code:'account_changed'},403);
  const connection=async(action:string,extra:Record<string,unknown>={})=>{const r=await db.rpc('kgn_drive_connection',{p_user:uid,p_action:action,...extra});if(r.error)throw Error('Connection');return r.data};
  if(body.action==='status'){const c=await connection('get');return reply({available,connected:Boolean(c),last_backup_at:c?.file_id?c.updated_at:null,client_id:available?env('KGN_GOOGLE_CLIENT_ID'):null})}
  if(body.action==='disconnect'){
   const c=await connection('get');await connection('remove');
   // Disconnect remains possible when configuration is incomplete or the key changed.
   if(c)try{const refresh=await crypt(c.encrypted_token,uid,true);await fetchTimed('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:refresh})})}catch{}
   return reply({connected:false});
  }
  if(!available)return reply({error:'Google Drive backup is not available yet'},503);
  if(body.action==='connect'){
   if(body.consent!==true||typeof body.code!=='string'||body.code.length>4096)return reply({error:'Authorization required'},400);
   const token=await tokenRequest({code:body.code,grant_type:'authorization_code',redirect_uri:origin});
   if(!token.refresh_token||!String(token.scope||'').split(' ').includes(scope))return reply({error:'Authorize backup access again',code:'reconnect_required'},409);
   // Never preserve a file ID from a previously connected Google account.
   await connection('set',{p_token:await crypt(token.refresh_token,uid),p_file:null});return reply({connected:true});
  }
  const c=await connection('get');if(!c)return reply({error:'Connect Google Drive first',code:'reconnect_required'},409);
  const refresh=await crypt(c.encrypted_token,uid,true);
  if(!['save','restore'].includes(body.action))return reply({error:'Unknown request'},400);
  const token=await tokenRequest({refresh_token:refresh,grant_type:'refresh_token'});
  const auth={Authorization:'Bearer '+token.access_token};
  let fileId=c.file_id;
  // Reconnecting the same Google account reuses its account-specific file.
  if(!fileId){const q=new URLSearchParams({spaces:'appDataFolder',q:"name = 'kgn-"+uid+".json' and trashed = false",fields:'files(id)',pageSize:'1'});const res=await fetchTimed('https://www.googleapis.com/drive/v3/files?'+q,{headers:auth});if(!res.ok)throw Error('Drive');fileId=(await res.json()).files?.[0]?.id||null;}
  let existing=null;
  if(fileId){const res=await fetchTimed('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?alt=media',{headers:auth});if(res.ok){const data=await res.text();if(data.length>500000)throw Error('Backup size');existing=cleanBackup(JSON.parse(data),uid)}else if(res.status===404)fileId=null;else throw Error('Drive');}
  if(body.action==='restore')return existing?reply({backup:existing}):reply({error:'No backup found',code:'no_backup'},404);
  const incoming=cleanBackup(body.backup,uid);
  // A second phone must not erase older saved receipts when it first sends a backup.
  if(existing){const orders=new Map(existing.orders.map((o:any)=>[o.id,o]));for(const o of incoming.orders){const old=orders.get(o.id) as any;if(!old||(Date.parse(o.saved_at)||0)>=(Date.parse(old.saved_at)||0))orders.set(o.id,o);}incoming.orders=[...orders.values()].slice(-100) as any;if((!incoming.contact.name&&!incoming.contact.phone)||(Date.parse(incoming.contact_updated_at)||0)<=(Date.parse(existing.contact_updated_at)||0)){incoming.contact=existing.contact;incoming.contact_updated_at=existing.contact_updated_at;}}
  incoming.exported_at=new Date().toISOString();
  const contents=JSON.stringify(incoming);if(new TextEncoder().encode(contents).byteLength>500000)return reply({error:'Backup too large',code:'backup_too_large'},413);
  if(fileId){const res=await fetchTimed('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(fileId)+'?uploadType=media',{method:'PATCH',headers:{...auth,'Content-Type':'application/json'},body:contents});if(!res.ok)throw Error('Drive');}
  else{const boundary='kgn_'+crypto.randomUUID().replaceAll('-',''),meta={name:'kgn-'+uid+'.json',parents:['appDataFolder']};const res=await fetchTimed('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{...auth,'Content-Type':'multipart/related; boundary='+boundary},body:'--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+contents+'\r\n--'+boundary+'--'});if(!res.ok)throw Error('Drive');fileId=(await res.json()).id;}
  await connection('file',{p_file:fileId});return reply({saved:true,saved_at:incoming.exported_at});
 }catch(error){if(error instanceof Error&&error.message==='reconnect_required')return reply({error:'Reconnect Google Drive',code:'reconnect_required'},409);return reply({error:'Backup could not complete. Your phone copy is unchanged'},503)}
});
  

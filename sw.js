const CACHE='kgn-cloud-v11-static-1';
const STATIC=['./index.html','./app.css','./customer.js','./catalog-data.js','./manifest.webmanifest','./logo.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));self.skipWaiting()});
self.addEventListener('activate', event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kgn-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch', event=>{
 if(event.request.method!=='GET')return;
 const u=new URL(event.request.url);
 if(u.origin!==self.location.origin)return; // Do not cache Supabase/Auth requests.
 if(u.pathname.endsWith('/admin.html')||u.pathname.endsWith('/admin.js')||u.pathname.endsWith('/cloud-config.js'))return; // Always network for admin and config.
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match('./index.html')));return;
 }
 event.respondWith(fetch(event.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{})}return r}).catch(()=>caches.match(event.request)));
});

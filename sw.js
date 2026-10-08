const CACHE='kgn-cloud-v50-drive-backup-20261008';
const STATIC=['./customer-data.js?v=50','./retailer-access.js?v=49','./retailer-access.css?v=46','./commerce.css?v=43','./catalog-gallery.js?v=40','./commerce.js?v=43','./checkout-phone.js?v=38','./customer-bundles.js?v=41','./account-deletion.html','./order-privacy.html','./privacy-policy.html','./mobile-compat.js?v=32','./home-sample-lehenga-v31.webp','./home-sample-coat-v31.webp','./home-sample-kids-v31.webp','./home-sample-frock-v31.webp','./home-sample-kurti-v31.webp','./index.html','./app.css?v=39','./share-app.css?v=1','./share-app.js?v=2','./customer.js?v=41','./catalog-data.js','./manifest.webmanifest','./logo.png','./icon-192.png','./icon-512.png','./icon-maskable-192.png','./icon-maskable-512.png','./frock.png','./jeans-top.png','./coat-set.png','./skirt-top.png','./western-suit.png','./kurti-pant.png','./lehenga.png','./pant-shirt.png','./baba-suit.png','./t-shirt.png'];
self.addEventListener('install', event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));self.skipWaiting()});
self.addEventListener('activate', event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kgn-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch', event=>{
 if(event.request.method!=='GET')return;
 const u=new URL(event.request.url);
 if(u.origin!==self.location.origin)return; // Do not cache Supabase/Auth requests.
 if(/\/(?:admin(?:-[^/]*)?\.(?:js|html|css)|inventory\.html|cloud-config\.js)$/.test(u.pathname))return; // Always network for admin and config.
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(u.pathname.endsWith('/account-deletion.html')?'./account-deletion.html':u.pathname.endsWith('/order-privacy.html')?'./order-privacy.html':u.pathname.endsWith('/privacy-policy.html')?'./privacy-policy.html':'./index.html')));return;
 }
 event.respondWith(fetch(event.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{})}return r}).catch(()=>caches.match(event.request)));
});
 
 
 
 
 

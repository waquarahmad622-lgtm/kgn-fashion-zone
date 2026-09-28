/* KGN V22 corrected: size-wise wholesale listing and pricing. No credentials. */
(()=>{'use strict';
const SIZES=['0-0','16-18','20-20','20-24','26-30','32-34','32-36','38-40','32-32','20-30','22-32','28-32','32-40','34-36','S','M','L','XL','XXL','XXXL','4XL'];
const PACKS=[3,4,5,6];
const $=id=>document.getElementById(id);
if(!document.querySelector('link[data-kgn-pack-style]')){
  const l=document.createElement('link');l.rel='stylesheet';l.href='./bundle.css?v=22';l.dataset.kgnPackStyle='';document.head.append(l);
}
let sizes=[],packs=[],rates={};
const ui=document.createElement('section');
ui.className='kgn-pack-editor';
ui.innerHTML=`<h3>📏 Size और 📦 Bundle</h3><p class="kgn-help">Admin कोई भी Size और 3/4/5/6 Piece Bundle एक साथ चुन सकता है। ग्राहक पर Size-wise नियम लागू होंगे।</p><div class="kgn-option-title">📏 Available sizes (multi-select)</div><div id="kgnSizeButtons" class="kgn-chip-grid"></div><div class="kgn-option-title">📦 Available bundle types (multi-select)</div><div id="kgnPackButtons" class="kgn-chip-grid"></div><p id="kgnPackSummary" class="kgn-help" aria-live="polite"></p><div class="kgn-option-title">💰 हर Size का Wholesale Rate (₹ प्रति Piece)</div><p class="kgn-help">एक Size का प्रति Piece Rate समान है, चाहे ग्राहक 3 या 6 Piece चुने। हर Size का अलग Rate भरें।</p><div id="kgnSizeRates"></div>`;
function draw(){
  if(!$('kgnSizeButtons'))return;
  $('kgnSizeButtons').innerHTML=SIZES.map(s=>`<button type="button" data-size="${s}" class="kgn-chip ${sizes.includes(s)?'selected':''}" aria-pressed="${sizes.includes(s)}">${s}</button>`).join('');
  $('kgnPackButtons').innerHTML=PACKS.map(n=>`<button type="button" data-pack="${n}" class="kgn-chip ${packs.includes(n)?'selected':''}" aria-pressed="${packs.includes(n)}">📦 ${n} Piece</button>`).join('');
  $('kgnPackSummary').textContent='Sizes: '+(sizes.join(', ')||'None')+' · Bundles: '+(packs.join(', ')||'None');
  $('kgnSizeRates').innerHTML=sizes.map(v=>`<label class="kgn-rate-row"><strong>📏 ${v}</strong><span>₹ <input type="number" inputmode="decimal" min="0" max="99999999" step="0.01" required data-rate-size="${v}" value="${rates[v]??''}" placeholder="₹ प्रति Piece"></span></label>`).join('')||'<p class="kgn-help">Rate भरने के लिए पहले Size चुनें।</p>';
}
function mount(){
  const form=$('productForm');if(!form||$('kgnSizeButtons'))return;
  const globalRate=$('rate'),sale=$('sale_rate'),moq=$('moq');
  if(globalRate){globalRate.readOnly=true;globalRate.closest('label').hidden=true;globalRate.title='Size-wise Rate से अपने आप सेट होता है';}
  if(sale){sale.readOnly=true;sale.closest('label').hidden=true;sale.title='V20 में Size-wise Sale Rate उपलब्ध नहीं है';}
  if(moq){moq.readOnly=true;moq.title='Bundle buttons से अपने आप सेट होता है';}
  const anchor=$('unit')?.closest('.grid2')||form.querySelector('.toggles');
  if(anchor)anchor.before(ui);else form.append(ui);
  ui.addEventListener('input',e=>{const r=e.target.closest('[data-rate-size]');if(r)rates[r.dataset.rateSize]=r.value;});
  ui.addEventListener('click',e=>{
    const s=e.target.closest('[data-size]'),b=e.target.closest('[data-pack]');
    if(!s&&!b)return;
    if(s){const v=s.dataset.size;sizes=sizes.includes(v)?sizes.filter(x=>x!==v):[...sizes,v];}
    if(b){const v=Number(b.dataset.pack);packs=packs.includes(v)?packs.filter(x=>x!==v):[...packs,v];}
    packs.sort((a,b)=>a-b);if(moq)moq.value=packs[0]||'';draw();
  });
  draw();
}
function install(){
  mount();if(typeof window.openEditor!=='function'||typeof window.formPayload!=='function')return;
  const originalOpen=window.openEditor;
  window.openEditor=function(id=null){
    originalOpen(id);
    const p=typeof products!=='undefined'?products.find(x=>x.id===id):null;
    sizes=Array.isArray(p?.size_options)?p.size_options.filter(x=>SIZES.includes(x)):[];
    packs=Array.isArray(p?.pack_options)&&p.pack_options.length?p.pack_options.map(Number).filter(x=>PACKS.includes(x)):PACKS.includes(Number(p?.moq))?[Number(p.moq)]:[];
    packs.sort((a,b)=>a-b);
    const moq=$('moq');if(moq)moq.value=packs[0]||p?.moq||'';
    rates=p?.size_rates&&typeof p.size_rates==='object'&&!Array.isArray(p.size_rates)?{...p.size_rates}:{};
    draw();
  };
  const originalPayload=window.formPayload;
  window.formPayload=function(){
    if(!sizes.length)throw Error('कम से कम एक Size चुनें।');
    if(!packs.length)throw Error('कम से कम एक Bundle चुनें।');
    const priceMap={};
    for(const size of sizes){
      const raw=String(rates[size]??'').trim(),value=Number(raw);
      if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(value)||value<0||value>99999999)throw Error(size+' का सही ₹/Piece Rate भरें (अधिकतम 2 दशमलव)।');
      priceMap[size]=value;
    }
    const moq=$('moq');if(moq)moq.value=Math.min(...packs);
    const rate=$('rate'),sale=$('sale_rate');
    if(rate)rate.value=Math.min(...Object.values(priceMap));
    if(sale)sale.value='';
    const row=originalPayload();
    row.size_options=[...sizes];row.pack_options=[...packs];row.size_rates=priceMap;
    row.moq=Math.min(...packs);row.rate=Math.min(...Object.values(priceMap));row.sale_rate=null;
    return row;
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

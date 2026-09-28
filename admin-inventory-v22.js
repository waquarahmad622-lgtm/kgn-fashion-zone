/* KGN V22: attach existing secure inventory UI to admin.html.
   Uses the existing authorized db client and server-side kgn_stock_action RPC. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
if(!$('invProduct'))return;
const invActions={opening:'Opening',purchase:'Received',sale:'Sale/Dispatch',return:'Return',damage:'Damaged/Lost',correction:'Correction'};
function stockText(p){return p?.stock_qty===null || p?.stock_qty===undefined ? 'Not counted' : p.stock_qty+' '+(p.unit||'unit');}
function renderInventoryStats(){const known=products.filter(p=>p.stock_qty!==null),unknown=products.length-known.length;
  $('inventoryTotal').textContent=known.length;
  $('inventoryZero').textContent=known.filter(p=>p.stock_qty===0).length;
  $('inventoryUnknown').textContent=unknown;
}
async function renderInventory(){renderInventoryStats();const select=$('invProduct'),previous=select.value;select.replaceChildren();
  if(!products.length){const opt=document.createElement('option');opt.value='';opt.textContent='Add a product first';select.append(opt);$('invCurrent').textContent='—';$('invHistory').textContent='No products yet.';$('invApply').disabled=true;return;}
  for(const p of products){const opt=document.createElement('option');opt.value=p.id;opt.textContent=(p.name_hi||p.name_en||p.sku)+' · '+(p.sku||p.category);select.append(opt);}
  if(products.some(p=>p.id===previous))select.value=previous;
  $('invApply').disabled=busy;await showInventoryForProduct();}
async function showInventoryForProduct(){const p=products.find(x=>x.id===$('invProduct').value);$('invCurrent').textContent=stockText(p);
  if(!p){$('invHistory').textContent='Select a product.';return;}
  $('invAction').value=p.stock_qty===null?'opening':'purchase';syncInventoryAction();
  $('invHistory').textContent='Loading history…';const {data,error}=await db.from('inventory_movements')
    .select('action,delta,previous_qty,new_qty,note,created_at').eq('product_id',p.id)
    .order('created_at',{ascending:false}).limit(30);
  const host=$('invHistory');host.replaceChildren();
  if(error){host.textContent='History unavailable: '+error.message;return;}
  if(!data?.length){host.textContent='No movement yet. Enter opening stock if not counted.';return;}
  for(const m of data){const row=document.createElement('div');row.className='movement';
    const heading=document.createElement('strong');heading.textContent=(invActions[m.action]||m.action)+' · '+(m.delta>0?'+':'')+m.delta;
    const sub=document.createElement('small');sub.textContent=(m.previous_qty===null?'Not counted':m.previous_qty)+' → '+m.new_qty+' · '+new Date(m.created_at).toLocaleString('en-IN');
    row.append(heading,sub);if(m.note){const note=document.createElement('p');note.textContent=m.note;row.append(note);}host.append(row);}
}
function syncInventoryAction(){const action=$('invAction').value;const p=products.find(x=>x.id===$('invProduct').value);
  $('invQtyLabel').textContent=action==='correction'?'Verified total stock':'Quantity';
  $('invQty').min=['opening','correction'].includes(action)?'0':'1';
  $('invQty').placeholder=action==='correction'?'Counted total after correction':'Whole number';
  if(p && p.stock_qty===null && action!=='opening')status('First use Opening stock for a product that has never been counted.');
}
async function applyInventory(e){e.preventDefault();if(busy)return;
  const id=$('invProduct').value,action=$('invAction').value,raw=$('invQty').value.trim(),qty=Number(raw),note=$('invNote').value.trim();
  if(!id||raw===''||!Number.isSafeInteger(qty)||qty<0||qty>10000000){status('Enter a valid non-negative whole number.','error');return;}
  if(!['opening','correction'].includes(action)&&qty===0){status('Quantity must be positive.','error');return;}
  if(['damage','correction'].includes(action)&&!note){status('A note is required for damage or correction.','error');return;}
  const p=products.find(x=>x.id===id);
  if(!confirm((p?.name_hi||'Product')+' · '+(invActions[action]||action)+' · '+qty+'?\nThis will update cloud stock and the audit log.'))return;
  setBusy(true);
  try{const {data,error}=await db.rpc('kgn_stock_action',{p_product_id:id,p_action:action,p_quantity:qty,p_note:note});if(error)throw error;
    $('invQty').value='';$('invNote').value='';status('✓ Stock saved in Cloud. New balance: '+data,'ok');
    await loadAdmin();$('invProduct').value=id;await showInventoryForProduct();
  }catch(err){console.error(err);status('Stock update failed: '+(err.message||'Unknown error'),'error');}
  finally{setBusy(false);}
}

const originalLoad=window.loadAdmin;
if(typeof originalLoad!=='function')return;
window.loadAdmin=async function(...args){
  const result=await originalLoad(...args);
  await renderInventory();
  return result;
};
$('inventoryForm').addEventListener('submit',applyInventory);
$('invProduct').addEventListener('change',showInventoryForProduct);
$('invAction').addEventListener('change',syncInventoryAction);
$('reloadInventory').addEventListener('click',()=>window.loadAdmin().catch(e=>status('Inventory reload failed: '+e.message,'error')));
})();

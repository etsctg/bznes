/* ================= হোল্ড (একসাথে একাধিক স্লিপ) =================
   গ্রাহক অর্ধেক লিখতে লিখতে ব্যস্ত হলে বা ভিড়ে একাধিক স্লিপ চললে — "⏸️ হোল্ড" চাপলে বর্তমান স্লিপ জমা থাকে
   ও নতুন স্লিপ শুরু হয়। নতুন এন্ট্রি খুললেই উপরে হোল্ড-করা স্লিপগুলো চিপ হয়ে দেখায়; চাপলে আগের স্লিপ ফিরে আসে।
   (এই ডিভাইসের ব্রাউজারে জমা থাকে, ইউজার-ভেদে আলাদা; সর্বোচ্চ ২০টি।) */
const HOLD_KEY = 'erp_holds_v1';
function holdLoad(){ try{ return JSON.parse(localStorage.getItem(HOLD_KEY)||'[]'); }catch(e){ return []; } }
function holdSaveAll(a){ try{ localStorage.setItem(HOLD_KEY, JSON.stringify(a.slice(-20))); }catch(e){ console.warn('হোল্ড সংরক্ষণ হয়নি', e); } }
function holdList(kind){ const u = currentUser && currentUser.username; return holdLoad().filter(h=>h.kind===kind && h.user===u); }
function holdCart(kind){ return kind==='sale' ? saleCart : purchaseCart; }
function holdSnapshot(kind){
  const g = id=>{ const e = document.getElementById(id); return e ? e.value : ''; };
  if(kind==='sale') return {cart:JSON.parse(JSON.stringify(saleCart)), f:{date:g('sf_date'), party:g('sf_customer'), discPct:g('sf_discPct'), discAmt:g('sf_discAmt'), paid:g('sf_paid')}};
  return {cart:JSON.parse(JSON.stringify(purchaseCart.map(l=>{ const c = {...l}; delete c._landed; return c; }))),
          extras:JSON.parse(JSON.stringify(purchaseExtras)), alloc:purchaseAllocBy, f:{date:g('pf2_date'), party:g('pf2_supplier'), paid:g('pf2_paid')}};
}
function holdPush(kind){
  const snap = holdSnapshot(kind);
  const sel = document.getElementById(kind==='sale'?'sf_customer':'pf2_supplier');
  const tot = document.getElementById(kind==='sale'?'sf_total':'pf2_total');
  const a = holdLoad();
  a.push({id:Date.now(), kind, user:currentUser.username, at:new Date().toISOString(), label:(sel&&sel.selectedOptions[0]?sel.selectedOptions[0].textContent:'').trim(), total:tot?tot.textContent:'', n:snap.cart.length, ...snap});
  holdSaveAll(a);
}
function holdCurrent(kind){
  if(!holdCart(kind).length){ toast('স্লিপে কোনো পণ্য নেই'); return; }
  holdPush(kind);
  toast('⏸️ হোল্ডে রাখা হলো — নতুন স্লিপ শুরু করুন');
  kind==='sale' ? openSaleModal() : openPurchaseModal();
}
function holdResume(kind, id){
  const h = holdLoad().find(x=>x.id===id); if(!h) return;
  if(holdCart(kind).length) holdPush(kind);                  // বর্তমান স্লিপও হোল্ডে যায় (অদলবদল)
  holdSaveAll(holdLoad().filter(x=>x.id!==id));
  kind==='sale' ? openSaleModal() : openPurchaseModal();
  const set = (i,v)=>{ const e = document.getElementById(i); if(e && v!=null && v!=='') e.value = v; };
  if(kind==='sale'){
    saleCart = h.cart; set('sf_date',h.f.date); set('sf_customer',h.f.party); set('sf_discPct',h.f.discPct); set('sf_discAmt',h.f.discAmt); set('sf_paid',h.f.paid);
    renderSaleLines(); calcSaleTotal();
  } else {
    purchaseCart = h.cart; purchaseExtras = h.extras||[]; purchaseAllocBy = h.alloc||'value';
    const al = document.getElementById('pf_allocBy'); if(al) al.value = purchaseAllocBy;
    set('pf2_date',h.f.date); set('pf2_supplier',h.f.party); set('pf2_paid',h.f.paid);
    purRenderExtras(); renderPurchaseLines(); calcPurchaseTotal();
  }
  holdBarInit(kind);
}
function holdDrop(kind, id){
  if(!confirm('এই হোল্ড-করা স্লিপ মুছে ফেলবেন?')) return;
  holdSaveAll(holdLoad().filter(x=>x.id!==id)); holdBarInit(kind);
}
function holdBarInit(kind){
  const bar = document.getElementById('holdBar'); if(!bar) return;
  const hs = holdList(kind);
  bar.innerHTML = hs.length ? `<div class="hold-bar">⏸️ হোল্ডে আছে (${hs.length}): ${hs.map(h=>`<span class="hold-chip"><a onclick="holdResume('${kind}',${h.id})" title="এই স্লিপ খুলুন">${esc(h.label||'—')} • ${h.n}টি • ${esc(h.total)}</a><a onclick="holdDrop('${kind}',${h.id})" title="মুছুন" style="opacity:.7;">✖</a></span>`).join('')}</div>` : '';
}
/* "বাতিল" চাপলে স্লিপে পণ্য থাকলে হোল্ডে রাখার সুযোগ */
function entryCancel(kind){
  const editing = kind==='sale' ? editingSaleId : editingPurchaseId;
  if(!editing && holdCart(kind).length){
    if(confirm('এই স্লিপে পণ্য আছে।\n\nঠিক আছে = হোল্ডে রাখুন (পরে ফিরিয়ে আনা যাবে)\nCancel = মুছে ফেলুন')) holdPush(kind);
  }
  closeModal();
}

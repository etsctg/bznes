/* ================= POS-স্টাইল এন্ট্রি বার (শেয়ার্ড — সেল ও পারচেজ দুটোতেই) =================
   পণ্য-খোঁজা/বাছাই, কার্ট-লাইন রেন্ডার, কিবোর্ড-ফ্লো (↑↓ Enter), এবং
   ক্রয়-ফর্ম থেকে নতুন পণ্য কুইক-ক্রিয়েট। sales.js ও purchase.js উভয়েই
   এই ফাইলের ফাংশন ব্যবহার করে (ENTRY_CFG দিয়ে)। */

/* =====================================================================
   POS-স্টাইল দ্রুত এন্ট্রি (বিক্রয় ও ক্রয় — দুটোতেই একই কোড)
   -------------------------------------------------------------------
   একটাই এন্ট্রি বার: পণ্য লিখুন → ↑/↓ দিয়ে তালিকা থেকে বাছাই → Enter → পরিমাণ
   → Enter = লাইনটা নিচের তালিকায় যোগ হয়ে কার্সর আবার "পণ্য" ঘরে ফিরে আসে।
   খালি পণ্য-ঘরে Enter চাপলে কার্সর সরাসরি "জমা" ঘরে চলে যায়।
   নিচের তালিকায় প্রতিটা লাইনের পাশে ✏️ এডিট ও 🗑️ মুছুন বাটন থাকে।
   মাউস/টাচে তালিকার আইটেমে ট্যাপ করলেও সাথে সাথে বাছাই হয়।
   ===================================================================== */
function productSuggestMatches(query){
  const q = query.trim().toLowerCase();
  let res;
  if(!q) res = [...DB.products].sort((a,b)=>String(a.name).localeCompare(String(b.name),'bn'));
  else {
    const words = q.split(/\s+/).filter(Boolean);
    res = DB.products.filter(p=>{
      const hay = [p.name, p.brand, p.size, p.color, p.shelf].filter(Boolean).join(' ').toLowerCase();
      return words.every(w=>hay.includes(w));
    });
  }
  const limit = q ? 30 : 50;
  const out = res.slice(0, limit); out.more = res.length > limit;
  return out;
}
function productShort(p){
  const bits = [p.brand, p.size, p.color].filter(Boolean).join(' ');
  return p.name + (bits ? ' — ' + bits : '');
}
const ENTRY_CFG = {
  sale:     { pre:'saleEnt',  cart:()=>saleCart,     price:p=>p.sellPrice, priceLbl:'বিক্রয়মূল্য', recalc:()=>calcSaleTotal(),     renderList:()=>renderSaleLines(),     paidId:'sf_paid' },
  purchase: { pre:'purchEnt', cart:()=>purchaseCart, price:p=>p.buyPrice,  priceLbl:'গড় ক্রয়মূল্য',   recalc:()=>calcPurchaseTotal(), renderList:()=>renderPurchaseLines(), paidId:'pf2_paid' }
};
const entryState = { sale:{productId:'',active:0,matches:[]}, purchase:{productId:'',active:0,matches:[]} };
function eEl(kind, suf){ return document.getElementById(ENTRY_CFG[kind].pre + suf); }
function entryReset(kind){ entryState[kind] = {productId:'', active:0, matches:[], unit:'main'}; const u = eEl(kind,'Unit'); if(u){ u.classList.add('hidden'); u.innerHTML=''; } }
function entryProduct(kind){ const st = entryState[kind]; return st.productId ? DB.products.find(x=>x.id==st.productId) : null; }
function entryFactor(kind){ const p = entryProduct(kind), st = entryState[kind]; if(!p || st.unit!=='alt') return 1; const f = Number(p.factor); return (p.altUnit && f>0) ? f : 1; }
/* পণ্যে বিকল্প একক থাকলে এন্ট্রি বারে একক-নির্বাচক দেখায় (ক্রয়ে ডিফল্ট = বিকল্প একক, বিক্রয়ে = প্রধান একক) */
function entrySetupUnit(kind, defaultUnit){
  const p = entryProduct(kind), sel = eEl(kind,'Unit'); if(!sel) return;
  if(p && p.altUnit && Number(p.factor)>0){
    sel.innerHTML = `<option value="main">${esc(p.unit)}</option><option value="alt">${esc(p.altUnit)}</option>`;
    sel.classList.remove('hidden'); entryState[kind].unit = defaultUnit; sel.value = defaultUnit;
  } else { sel.classList.add('hidden'); sel.innerHTML=''; entryState[kind].unit = 'main'; }
}
function entryShownPrice(kind, p){   // নির্বাচিত এককে প্রতি-একক দাম
  const f = entryFactor(kind);
  return kind==='purchase' ? r2(p.buyPrice*f) : r2(p.sellPrice*f);
}
function entryUnitChanged(kind){
  const st = entryState[kind], sel = eEl(kind,'Unit'), p = entryProduct(kind); if(!p) return;
  const oldF = entryFactor(kind);
  st.unit = sel.value;
  const newF = entryFactor(kind);
  if(kind==='purchase'){ const pe = eEl(kind,'Price'); const v = Number(pe.value); if(pe.value!=='' && !isNaN(v)) pe.value = r2(v/oldF*newF); }
  else eEl(kind,'Price').value = money(p.sellPrice*newF);
  entryUpdateSub(kind);
  const q = eEl(kind,'Qty'); q.focus(); q.select();
}
function entryHideSugg(kind){ const b = eEl(kind,'Sugg'); if(b){ b.classList.add('hidden'); b.innerHTML=''; } }
function entrySuggOpen(kind){ const b = eEl(kind,'Sugg'); return !!(b && !b.classList.contains('hidden') && entryState[kind].matches.length); }
function entryRenderSugg(kind){
  const st = entryState[kind], box = eEl(kind,'Sugg'), cfg = ENTRY_CFG[kind];
  if(!box) return;
  const newRow = kind==='purchase'
    ? `<div class="sugg-new" onmousedown="event.preventDefault();openQuickProduct()">➕ ${eEl(kind,'Prod').value.trim()?`"${esc(eEl(kind,'Prod').value.trim())}" নামে `:''}নতুন পণ্য যোগ করুন</div>` : '';
  if(!st.matches.length){ box.innerHTML = newRow + '<div class="sugg-empty">কোনো পণ্য পাওয়া যায়নি</div>'; box.classList.remove('hidden'); return; }
  box.innerHTML = newRow + st.matches.map((p,idx)=>{
    const bits = [p.brand, p.size, p.color].filter(Boolean).join(' ');
    const stockColor = p.stock<=0 ? 'var(--danger-text)' : (p.stock<=p.lowStock ? 'var(--amber-2)' : 'var(--success)');
    return `<div class="sugg-row ${idx===st.active?'active':''}" data-idx="${idx}"
        onmousedown="event.preventDefault();entryPick('${kind}',${p.id})"
        onmouseenter="entrySetActive('${kind}',${idx},false)">
      <div class="sugg-name">${esc(p.name)}${bits?` <span class="sugg-bits">— ${esc(bits)}</span>`:''}</div>
      <div class="sugg-meta"><span class="sugg-price">${cfg.priceLbl} ${money(cfg.price(p))}</span><span class="sugg-stock" style="color:${stockColor};">স্টক: ${p.stock} ${esc(p.unit||'')}</span></div>
    </div>`;
  }).join('') + (st.matches.more ? '<div class="sugg-empty">আরও পণ্য আছে — নাম লিখে খুঁজুন</div>' : '');
  box.classList.remove('hidden');
}
function entrySetActive(kind, idx, scroll){
  const st = entryState[kind], box = eEl(kind,'Sugg'); if(!box) return;
  st.active = idx; st.navigated = true;
  box.querySelectorAll('.sugg-row').forEach((r,i)=>{
    r.classList.toggle('active', i===idx);
    if(scroll && i===idx) r.scrollIntoView({block:'nearest'});
  });
}
/* পণ্য-ঘরে ক্লিক/ফোকাস করলেই তালিকা খোলে — তাই মাউসে ক্লিক করে ↑ ↓ দিয়েও বাছাই করা যায় */
function entryOpenList(kind){
  const st = entryState[kind], inp = eEl(kind,'Prod'); if(!inp) return;
  const p = entryProduct(kind);
  let list;
  if(p){ const base = productSuggestMatches(''); list = [p, ...base.filter(x=>x.id!==p.id)]; list.more = base.more; }
  else list = productSuggestMatches(inp.value);
  st.matches = list; st.active = 0; st.navigated = false;
  entryRenderSugg(kind);
}
/* ক্রয় এন্ট্রির সময়ই নতুন পণ্য তৈরি — স্টক পেজে না গিয়ে। স্টক ০ দিয়ে তৈরি হয়; এই ক্রয়ই স্টক বাড়াবে। */
function openQuickProduct(){
  const panel = document.getElementById('purchNewProd'); if(!panel) return;
  const txt = eEl('purchase','Prod').value.trim();
  panel.classList.remove('hidden'); entryHideSugg('purchase');
  const n = document.getElementById('np_name');
  if(txt && !entryState.purchase.productId) n.value = txt;
  setTimeout(()=>{ (n.value ? document.getElementById('np_buy') : n).focus(); panel.scrollIntoView({block:'nearest', behavior:'smooth'}); }, 40);
}
function closeQuickProduct(){
  const panel = document.getElementById('purchNewProd'); if(!panel) return;
  panel.classList.add('hidden');
  ['np_name','np_buy','np_sell','np_brand','np_size','np_color','np_shelf','np_alt','np_factor'].forEach(i=>{ const e = document.getElementById(i); if(e) e.value=''; });
  document.getElementById('np_unit').value = 'পিস'; document.getElementById('np_low').value = 5;
  eEl('purchase','Prod').focus();
}
function saveQuickProduct(){
  const v = id => document.getElementById(id).value.trim();
  const name = v('np_name');
  if(!name){ alert('পণ্যের নাম দিন'); document.getElementById('np_name').focus(); return; }
  const alt = v('np_alt'), factor = Number(v('np_factor'))||0;
  if(alt && !(factor>0)){ alert('বিকল্প একক দিলে "১ বিকল্প = কত?" ঘরটাও দিতে হবে'); document.getElementById('np_factor').focus(); return; }
  const brand = v('np_brand'), size = v('np_size'), color = v('np_color');
  const dup = DB.products.find(x=>x.name.trim().toLowerCase()===name.toLowerCase() && (x.brand||'').toLowerCase()===brand.toLowerCase() && (x.size||'').toLowerCase()===size.toLowerCase() && (x.color||'').toLowerCase()===color.toLowerCase());
  if(dup){ toast('✅ এই পণ্য আগে থেকেই আছে — সেটাই বাছাই করা হলো'); closeQuickProduct(); entryPick('purchase', dup.id); return; }
  const id = genId();
  const data = {id, name, brand, size, color, shelf:v('np_shelf'), unit: v('np_unit')||'পিস', altUnit: alt, factor: alt?factor:0,
    stock:0, buyPrice: Number(v('np_buy'))||0, sellPrice: Number(v('np_sell'))||0, lowStock: Number(v('np_low'))||5};
  DB.products.push(data);                                   // সাথে সাথে তালিকায় আসে
  fireWrite(fsDB.collection('erp_products').doc(String(id)).set(data), 'নতুন পণ্য');
  logAudit('নতুন পণ্য (ক্রয় ফর্ম থেকে)', name);
  closeQuickProduct();
  entryPick('purchase', id);
  toast('✅ নতুন পণ্য যোগ হয়েছে: '+name);
}
function entryTyped(kind){
  const st = entryState[kind];
  st.productId = ''; st.navigated = false;
  eEl(kind,'Price').value = ''; eEl(kind,'Sub').value = ''; eEl(kind,'Info').innerHTML = ''; eEl(kind,'Msg').textContent = '';
  const sellEl = eEl(kind,'Sell'); if(sellEl){ sellEl.value=''; sellEl.placeholder='অপরিবর্তিত'; }
  const _u = eEl(kind,'Unit'); if(_u){ _u.classList.add('hidden'); _u.innerHTML=''; } st.unit='main';
  st.matches = productSuggestMatches(eEl(kind,'Prod').value);
  st.active = 0;
  entryRenderSugg(kind);
}
function entryKeydown(e, kind){
  const st = entryState[kind], cfg = ENTRY_CFG[kind], open = entrySuggOpen(kind);
  const txt = eEl(kind,'Prod').value.trim();
  if(e.key==='ArrowDown'){
    e.preventDefault();
    if(open) entrySetActive(kind, (st.active+1)%st.matches.length, true);
    else entryOpenList(kind);
  } else if(e.key==='ArrowUp'){
    if(open){ e.preventDefault(); entrySetActive(kind, (st.active-1+st.matches.length)%st.matches.length, true); }
  } else if(e.key==='Enter'){
    e.preventDefault();
    if(open && (txt || st.navigated)){ entryPick(kind, st.matches[st.active].id); }
    else if(st.productId){ const q = eEl(kind,'Qty'); q.focus(); q.select(); }
    else if(kind==='purchase' && txt && !st.matches.length){ openQuickProduct(); }
    else if(!txt && cfg.cart().length){ const pe = document.getElementById(cfg.paidId); if(pe){ pe.focus(); pe.select(); } }
  } else if(e.key==='Tab' && !e.shiftKey && open && !st.productId && txt){
    e.preventDefault(); entryPick(kind, st.matches[st.active].id);
  } else if(e.key==='Escape' && !eEl(kind,'Sugg').classList.contains('hidden')){
    e.stopPropagation(); entryHideSugg(kind);
  }
}
function entryPick(kind, id){
  const p = DB.products.find(x=>x.id==id); if(!p) return;
  const st = entryState[kind], cfg = ENTRY_CFG[kind];
  st.productId = p.id;
  eEl(kind,'Prod').value = productShort(p);
  entryHideSugg(kind);
  entrySetupUnit(kind, kind==='purchase' ? 'alt' : 'main');
  eEl(kind,'Price').value = kind==='purchase' ? entryShownPrice(kind,p) : money(entryShownPrice(kind,p));
  const sellEl = eEl(kind,'Sell'); if(sellEl){ sellEl.value=''; sellEl.placeholder = money(p.sellPrice); }
  const qEl = eEl(kind,'Qty'); if(!Number(qEl.value)) qEl.value = 1;
  entryUpdateSub(kind);
  qEl.focus(); qEl.select();
}
function entryPriceOf(kind){   // সবসময় প্রতি-প্রধান-এককের দাম ফেরত দেয়
  const p = entryProduct(kind);
  if(!p) return 0;
  if(kind==='purchase'){ const v = eEl(kind,'Price').value; return v===''||isNaN(Number(v)) ? p.buyPrice : Number(v)/entryFactor(kind); }
  return ENTRY_CFG[kind].price(p);
}
function entryUpdateSub(kind){
  const p = entryProduct(kind);
  const qty = (Number(eEl(kind,'Qty').value)||0) * entryFactor(kind);
  eEl(kind,'Sub').value = p ? money(r2(entryPriceOf(kind)*qty)) : '';
  eEl(kind,'Info').innerHTML = entryInfoHtml(kind);
}
/* ক্রয় করতে গিয়ে দাম বদলালে — নতুন "গড় ক্রয়মূল্য" (Weighted Average Cost) আগেই হিসাব করে দেখানো হয়:
   নতুন গড় = (পুরনো স্টক × পুরনো গড় + নতুন পরিমাণ × নতুন দাম) ÷ (মোট স্টক)
   এতে একই পণ্যের স্টক আলাদা না হয়েও লাভ-ক্ষতির হিসাব সঠিক থাকে। */
function purchaseProjection(){
  const st = entryState.purchase, p = st.productId ? DB.products.find(x=>x.id==st.productId) : null;
  if(!p) return null;
  const qty = (Number(eEl('purchase','Qty').value)||0) * entryFactor('purchase');
  const price = entryPriceOf('purchase');
  const stockQty = Math.max(0, p.stock);
  const avg = (stockQty+qty)>0 ? (stockQty*p.buyPrice + qty*price)/(stockQty+qty) : price;
  const newSell = Number(eEl('purchase','Sell').value)||0;
  const sell = newSell>0 ? newSell : p.sellPrice;
  const sug = Math.ceil(p.buyPrice>0 ? avg*p.sellPrice/p.buyPrice : avg*1.1);
  return {p, qty, price, avg:Math.round(avg*100)/100, sell, newSell, margin:Math.round((sell-avg)*100)/100, pct: avg>0?(sell-avg)/avg*100:0, sug};
}
function entrySuggestSell(){
  const pr = purchaseProjection(); if(!pr) return;
  eEl('purchase','Sell').value = pr.sug;
  entryUpdateSub('purchase');
}
function entryInfoHtml(kind){
  const st = entryState[kind], p = entryProduct(kind);
  if(!p) return '';
  const f = entryFactor(kind), qEnt = Number(eEl(kind,'Qty').value)||0;
  const stockColor = p.stock<=0 ? 'var(--danger-text)' : (p.stock<=p.lowStock ? 'var(--amber-2)' : 'var(--success)');
  const altStock = (p.altUnit && p.factor>0) ? ` (≈ ${r2(p.stock/p.factor)} ${esc(p.altUnit)})` : '';
  const stockTxt = `বর্তমান স্টক: <b style="color:${stockColor};">${p.stock} ${esc(p.unit||'')}</b>${altStock}`;
  const subTxt = qEnt>0 ? `<span class="info-sub"> • সাবটোটাল <b>${money(r2(entryPriceOf(kind)*qEnt*f))}</b></span>` : '';
  const conv = (f!==1 && qEnt>0) ? `<div style="margin-top:3px;">🔁 ${qEnt} ${esc(p.altUnit)} = <b>${r2(qEnt*f)} ${esc(p.unit)}</b> (স্টক/হিসাবে প্রধান এককে যাবে)</div>` : '';
  if(kind==='sale'){
    const loss = p.sellPrice < p.buyPrice, mgr = hasAccess('manager');
    let h = `বিক্রয়মূল্য: <b>${money(p.sellPrice)}/${esc(p.unit)}</b>${f!==1?` (<b>${money(r2(p.sellPrice*f))}/${esc(p.altUnit)}</b>)`:''} • ${stockTxt}${subTxt}`;
    if(mgr) h += ` • লাভ/${esc(p.unit)}: <b style="color:${loss?'var(--danger-text)':'var(--success)'};">${money(r2(p.sellPrice-p.buyPrice))}</b>`;
    h += conv;
    if(loss) h += `<div style="color:var(--danger-text);font-weight:700;margin-top:3px;">⚠️ বিক্রয়মূল্য ক্রয়মূল্যের চেয়ে কম — এই দামে বিক্রি করলে লোকসান হবে${mgr?'':' (ম্যানেজারকে জানান)'}</div>`;
    return h;
  }
  const pr = purchaseProjection();
  let h = `বর্তমান গড় ক্রয়মূল্য: <b>${money(p.buyPrice)}/${esc(p.unit)}</b> • বিক্রয়মূল্য: <b>${money(p.sellPrice)}/${esc(p.unit)}</b> • ${stockTxt}${subTxt}` + conv;
  if(pr && pr.qty>0){
    const col = pr.margin<=0 ? 'var(--danger-text)' : 'var(--success)';
    h += `<div style="margin-top:3px;">এই ক্রয়ের পর নতুন গড় ক্রয়মূল্য ≈ <b>${money(pr.avg)}/${esc(p.unit)}</b> • ${money(pr.sell)}-এ বিক্রি করলে লাভ/${esc(p.unit)}: <b style="color:${col};">${money(pr.margin)} (${pr.pct.toFixed(1)}%)</b></div>`;
    if(pr.margin<=0) h += `<div style="color:var(--danger-text);font-weight:700;margin-top:3px;">⚠️ এই দামে বিক্রয়মূল্য ≤ ক্রয়মূল্য — লোকসান! বিক্রয়মূল্য বাড়ান।</div>`;
    if(pr.newSell<=0 && Math.abs(pr.price-p.buyPrice)>0.0001 && pr.sug!==p.sellPrice){
      h += `<div style="margin-top:3px;">💡 দাম বদলেছে। আগের লাভের হার ঠিক রাখতে বিক্রয়মূল্য <a href="javascript:void(0)" onmousedown="event.preventDefault()" onclick="entrySuggestSell()" style="color:var(--teal-2);font-weight:800;text-decoration:underline;">${money(pr.sug)} বসান</a></div>`;
    }
  }
  return h;
}
function entryQtyKeydown(e, kind){
  if(e.key==='Enter'){
    e.preventDefault();
    if(kind==='purchase'){ const pe = eEl(kind,'Price'); pe.focus(); pe.select(); }  // ক্রয়ে দাম নিশ্চিত করে তারপর যোগ
    else entryAdd(kind);
  } else if(e.key==='ArrowUp'){ e.preventDefault(); eEl(kind,'Prod').focus(); }
  else if(e.key==='Backspace' && !e.target.value){ eEl(kind,'Prod').focus(); }
}
function entryPriceKeydown(e, kind){
  if(e.key==='Enter'){ e.preventDefault(); entryAdd(kind); }
}
function entryAdd(kind){
  const st = entryState[kind], cfg = ENTRY_CFG[kind];
  const msg = eEl(kind,'Msg'); msg.textContent = '';
  if(!st.productId){ msg.textContent = 'আগে তালিকা থেকে একটি পণ্য বাছাই করুন'; eEl(kind,'Prod').focus(); return false; }
  const p = DB.products.find(x=>x.id==st.productId);
  if(!p){ msg.textContent = 'পণ্যটি খুঁজে পাওয়া যায়নি'; return false; }
  const qEnt = Number(eEl(kind,'Qty').value)||0;
  if(qEnt<=0){ msg.textContent = 'পরিমাণ ০ এর বেশি হতে হবে'; eEl(kind,'Qty').focus(); return false; }
  const f = entryFactor(kind), useAlt = f!==1;
  const qty = Number((qEnt*f).toFixed(6));            // সবসময় প্রধান এককে
  const cart = cfg.cart();
  const color = kind==='purchase' ? eEl(kind,'Color').value.trim() : '';
  const shelf = kind==='purchase' ? eEl(kind,'Shelf').value.trim() : '';
  let price = 0, newSell = 0, dispPrice = useAlt ? entryShownPrice(kind,p) : null;
  if(kind==='purchase'){
    const pv = eEl(kind,'Price').value;
    const shown = pv==='' ? entryShownPrice(kind,p) : Number(pv);
    if(isNaN(shown) || shown<0){ msg.textContent = 'ক্রয়মূল্য সঠিক দিন'; eEl(kind,'Price').focus(); return false; }
    price = Number((shown/f).toFixed(6));             // প্রতি-প্রধান-একক দাম
    if(useAlt) dispPrice = shown;
    newSell = Number(eEl(kind,'Sell').value)||0;
  }
  const dispUnit = useAlt ? p.altUnit : '';
  const idx = cart.findIndex(l=> l.productId==p.id && (kind==='sale' || ((l.color||'')===color && (l.shelf||'')===shelf && Number(l.price)===price && (Number(l.newSell)||0)===newSell && (l.dispUnit||'')===dispUnit)));
  const already = idx>=0 ? cart[idx].qty : 0;
  if(kind==='sale'){
    const orig = editingSaleId ? currentSalesRows().find(x=>x.id===editingSaleId) : null;
    const origQty = orig ? orig.items.filter(it=>it.productId==p.id).reduce((s,it)=>s+it.qty,0) : 0;
    const avail = p.stock + origQty - already;
    if(qty>avail){
      msg.textContent = `স্টক অপর্যাপ্ত! "${p.name}" আর সর্বোচ্চ ${Math.max(0,r2(avail))} ${p.unit||''} যোগ করা যাবে`;
      const q = eEl(kind,'Qty'); q.focus(); q.select(); return false;
    }
  }
  if(idx>=0){
    const l = cart[idx];
    l.qty = Number((l.qty+qty).toFixed(6));
    if(l.dispUnit && l.dispUnit===dispUnit) l.dispQty = Number(((l.dispQty||0)+qEnt).toFixed(6));
    else { delete l.dispQty; delete l.dispUnit; delete l.dispPrice; }
  } else {
    const line = kind==='sale' ? {productId:p.id, qty} : {productId:p.id, qty, color, shelf, price, newSell};
    if(useAlt){ line.dispQty = qEnt; line.dispUnit = dispUnit; line.dispPrice = dispPrice; }
    cart.push(line);
  }
  entryReset(kind);
  ['Prod','Qty','Price','Sub'].forEach(x=>eEl(kind,x).value='');
  if(kind==='purchase'){ eEl(kind,'Color').value=''; eEl(kind,'Shelf').value=''; eEl(kind,'Sell').value=''; eEl(kind,'Sell').placeholder='অপরিবর্তিত'; }
  eEl(kind,'Info').innerHTML = '';
  cfg.renderList(); cfg.recalc();
  eEl(kind,'Prod').focus();
  return true;
}
/* সেভ করার আগে — এন্ট্রি বারে বাছাই করা কিন্তু "যোগ" না করা পণ্য থাকলে সেটা নিজেই যোগ হয়ে যায় */
function entryFlush(kind){
  const st = entryState[kind], txt = eEl(kind,'Prod')?.value.trim();
  if(!st.productId){
    if(txt){ eEl(kind,'Msg').textContent = `"${txt}" — তালিকা থেকে বাছাই করে ➕ যোগ করুন, অথবা লেখাটা মুছে দিন`; eEl(kind,'Prod').focus(); return false; }
    return true;
  }
  return entryAdd(kind);
}
function entryEditLine(kind, i){
  const cfg = ENTRY_CFG[kind], cart = cfg.cart(), line = cart[i]; if(!line) return;
  if(entryState[kind].productId || eEl(kind,'Prod').value.trim()){ if(!entryFlush(kind)) return; }
  const idx = cart.indexOf(line);
  cart.splice(idx,1);
  const p = DB.products.find(x=>x.id==line.productId);
  entryReset(kind);
  entryState[kind].productId = line.productId;
  eEl(kind,'Prod').value = p ? productShort(p) : '';
  const wasAlt = !!(line.dispUnit && p && p.altUnit);
  entrySetupUnit(kind, wasAlt ? 'alt' : 'main');
  eEl(kind,'Qty').value = wasAlt ? line.dispQty : line.qty;
  if(kind==='purchase'){
    eEl(kind,'Color').value = line.color||''; eEl(kind,'Shelf').value = line.shelf||'';
    eEl(kind,'Price').value = wasAlt ? line.dispPrice : (line.price!=null ? line.price : (p?p.buyPrice:''));
    eEl(kind,'Sell').value = line.newSell>0 ? line.newSell : '';
    eEl(kind,'Sell').placeholder = p ? money(p.sellPrice) : 'অপরিবর্তিত';
  } else if(p){ eEl(kind,'Price').value = money(entryShownPrice(kind,p)); }
  entryUpdateSub(kind);
  cfg.renderList(); cfg.recalc();
  const q = eEl(kind,'Qty'); q.focus(); q.select();
}
function cartRowsHtml(kind, cart){
  if(!cart.length) return '<div class="cart-empty">এখনো কোনো পণ্য যোগ হয়নি<br>উপরের বারে পণ্য ও পরিমাণ দিয়ে Enter চাপুন</div>';
  const cfg = ENTRY_CFG[kind];
  const delFn = kind==='sale' ? 'removeSaleLine' : 'removePurchaseLine';
  return cart.map((l,i)=>{
    const p = DB.products.find(x=>x.id==l.productId);
    const price = (kind==='purchase' && l.price!=null) ? Number(l.price) : (p ? cfg.price(p) : 0);
    const bits = p ? [p.brand, p.size, p.color].filter(Boolean).join(' ') : '';
    const extra = kind==='purchase'
      ? [l.color?('রং: '+l.color):'', l.shelf?('শেলফ: '+l.shelf):'', l.newSell>0?('নতুন বিক্রয়মূল্য: '+money(l.newSell)):''].filter(Boolean).join(' • ') : '';
    return `<div class="cart-row">
      <div>
        <div class="cr-name">${i+1}. ${esc(p?p.name:'মুছে ফেলা পণ্য')}${bits?` <span class="sugg-bits">— ${esc(bits)}</span>`:''}</div>
        <div class="cr-meta">${l.dispUnit ? `${l.dispQty} ${esc(l.dispUnit)} (${l.qty} ${esc(p?p.unit||'':'')}) × ${money(l.dispPrice!=null?l.dispPrice:price)}/${esc(l.dispUnit)}` : `${money(r2(price))} × ${l.qty} ${esc(p?p.unit||'':'')}`}${extra?' • '+esc(extra):''}</div>
      </div>
      <div class="cr-sub">${money(r2(price*l.qty))}</div>
      <div class="cr-actions">
        <button type="button" class="icon-btn" onclick="entryEditLine('${kind}',${i})" title="এডিট (পরিমাণ/দাম বদলান)">✏️</button>
        <button type="button" class="icon-btn" onclick="${delFn}(${i})" title="মুছুন">🗑️</button>
      </div>
    </div>`;
  }).join('');
}
let saleSuggestCache = {}; // (পুরনো রেফারেন্সের জন্য — এখন ব্যবহৃত হয় না)
function renderSaleLines(){
  const box = document.getElementById('saleItemsBox'); if(!box) return;
  box.innerHTML = cartRowsHtml('sale', saleCart);
}
function removeSaleLine(i){ saleCart.splice(i,1); renderSaleLines(); calcSaleTotal(); eEl('sale','Prod')?.focus(); }
/* ডিসকাউন্ট % বা টাকা — দুটো ঘরই আছে, যেকোনো একটায় লিখলে অন্যটা
   স্বয়ংক্রিয়ভাবে হিসাব হয়ে যায় (changedField বলে দেয় কোনটা এইমাত্র বদলালো) */
function setField(id, val){ const e = document.getElementById(id); if(!e) return; if(e.tagName==='INPUT') e.value = val; else e.textContent = val; }
function calcSaleTotal(changedField){
  let subtotal = 0;
  saleCart.forEach(l=>{ if(l.productId){ const p = DB.products.find(x=>x.id==l.productId); if(p) subtotal += p.sellPrice * (l.qty||0); } });
  subtotal = r2(subtotal);
  setField('sf_subtotal', money(subtotal));

  const pctEl = document.getElementById('sf_discPct');
  const amtEl = document.getElementById('sf_discAmt');
  let pct = Number(pctEl?.value)||0;
  let amt = Number(amtEl?.value)||0;

  if(changedField==='pct'){
    pct = Math.max(0, Math.min(100, pct));
    amt = Math.round(subtotal * pct / 100);
    if(amtEl) amtEl.value = amt;
  } else if(changedField==='amt'){
    amt = Math.max(0, Math.min(subtotal, amt));
    pct = subtotal>0 ? Math.round((amt/subtotal)*10000)/100 : 0;
    if(pctEl) pctEl.value = pct;
  } else {
    // পণ্য/জমা পরিবর্তনের সময় — আগের % বজায় রেখে টাকা পুনঃগণনা
    amt = Math.round(subtotal * pct / 100);
    if(amtEl) amtEl.value = amt;
  }

  const grandTotal = Math.max(0, subtotal - amt);
  setField('sf_total', money(grandTotal));

  /* গ্রাহক সর্বমোটের চেয়ে বড় নোট/বেশি টাকা দিলে — বাকি কখনোই ঋণাত্মক দেখানো হয় না;
     বাড়তি অংশ আলাদাভাবে "ফেরত দিন" হিসেবে দেখানো হয়, আর হিসাবে (due/paid) সবসময়
     বাস্তবসম্মত (০ বা ধনাত্মক) মান থাকে — এভাবেই ঋণাত্মক-বাকির সমস্যাটা সমাধান হয়। */
  const paidRaw = Number(document.getElementById('sf_paid')?.value)||0;
  const due = Math.max(0, grandTotal - paidRaw);
  const changeBack = Math.max(0, paidRaw - grandTotal);
  setField('sf_due', money(due));
  const dueNode = document.getElementById('sf_due'); if(dueNode) dueNode.style.color = due>0 ? 'var(--warn-text)' : 'var(--success)';
  const changeRow = document.getElementById('sf_changeRow');
  if(changeRow){ if(changeBack>0){ changeRow.classList.remove('hidden'); setField('sf_change', money(changeBack)); } else changeRow.classList.add('hidden'); }

  return grandTotal;
}
function saveSale(){
  if(!entryFlush('sale')) return;
  const items = saleCart.filter(l=>l.productId && l.qty>0).map(l=>{
    const p = DB.products.find(x=>x.id==l.productId);
    return {productId:p.id, qty:Number(l.qty), price:p.sellPrice, buyPrice:p.buyPrice, _stock:p.stock, _name:p.name, ...(l.dispUnit?{dispQty:l.dispQty,dispUnit:l.dispUnit,dispPrice:r2(p.sellPrice*(p.factor>0?p.factor:1))}:{})};
  });
  if(!items.length){ alert('অন্তত একটি পণ্য যোগ করুন'); return; }

  // এডিট মোডে হলে — এই বিক্রয়ে আগে যে পরিমাণ পণ্য ব্যবহার হয়েছিল সেটা প্রথমে
  // স্টকে ফেরত ধরে নিয়ে (সেভের সময় রিভার্স+পুনরায় প্রয়োগ হবে) এভেইলেবিলিটি চেক হয়
  const original = editingSaleId ? currentSalesRows().find(x=>x.id===editingSaleId) : null;
  const origQtyByProduct = {};
  if(original) original.items.forEach(it=>{ origQtyByProduct[it.productId] = (origQtyByProduct[it.productId]||0) + it.qty; });

  for(const it of items){
    const availableStock = it._stock + (origQtyByProduct[it.productId]||0);
    if(it.qty > availableStock){ alert(`"${it._name}" এর স্টক অপর্যাপ্ত! সর্বোচ্চ পাওয়া যাবে: ${availableStock}`); return; }
  }
  const custId = Number(document.getElementById('sf_customer').value);
  const cust = DB.customers.find(c=>c.id===custId);
  if(!cust){ alert('এই ভাউচারের কাস্টমার মুছে ফেলা হয়েছে — তালিকা থেকে অন্য একজন কাস্টমার বেছে নিন।'); return; }
  const date = document.getElementById('sf_date').value || todayStr();
  const paidRaw = Number(document.getElementById('sf_paid').value)||0;
  const subtotal = r2(items.reduce((s,it)=>s+it.price*it.qty,0));
  const discountPercent = Math.max(0, Math.min(100, Number(document.getElementById('sf_discPct').value)||0));
  const discount = Math.max(0, Math.min(subtotal, Number(document.getElementById('sf_discAmt').value)||0));
  const total = subtotal - discount;
  const cogs = r2(items.reduce((s,it)=>s+it.buyPrice*it.qty,0));
  // গ্রাহক সর্বমোটের চেয়ে বেশি টাকা দিলে সেই বাড়তি অংশ "ফেরত" — ইনভয়েসে paid হিসেবে
  // কখনোই total-এর বেশি জমা হয় না, তাই due কখনো ঋণাত্মক হয় না এবং হিসাবে কোনো
  // অবাস্তব "নেগেটিভ বাকি" থেকে যায় না; ফেরত দেওয়া অংশ শুধু রেকর্ডের জন্য changeGiven-এ থাকে
  const paid = Math.min(paidRaw, total);
  const changeGiven = Math.max(0, paidRaw - total);
  const due = total - paid;
  const saleId = original ? original.id : genId();

  const batch = fsDB.batch();

  // ---- স্টক: পুরনো (এডিট হলে) + নতুন মিলিয়ে নিট পরিবর্তন — প্রতি পণ্যে একবারই আপডেট ----
  const netQtyChange = {}; // ধনাত্মক মানে স্টকে যোগ হবে
  if(original) original.items.forEach(it=>{ netQtyChange[it.productId] = (netQtyChange[it.productId]||0) + it.qty; });
  items.forEach(it=>{ netQtyChange[it.productId] = (netQtyChange[it.productId]||0) - it.qty; });
  Object.keys(netQtyChange).forEach(pid=>{
    const p = DB.products.find(x=>x.id==pid);
    if(p && netQtyChange[pid]!==0) batch.update(fsDB.collection('erp_products').doc(String(pid)), {stock: p.stock + netQtyChange[pid]});
  });
  // স্বচ্ছতার জন্য স্টক-লেজারে রিভার্স ও নতুন এন্ট্রি আলাদাভাবে লগ হয়
  if(original) original.items.forEach(it=>logStockMove(batch, {productId:it.productId, qty:it.qty, type:'sale-edit-revert', refType:'sale', refId:saleId, date:original.date}));
  items.forEach(it=>logStockMove(batch, {productId:it.productId, qty:-it.qty, type: original?'sale-edit-apply':'sale', refType:'sale', refId:saleId, date}));

  // ---- কাস্টমার বাকি: পুরনো কাস্টমার থেকে রিভার্স (যদি থাকে), নতুন কাস্টমারে প্রয়োগ ----
  if(original && original.customerId===custId){
    batch.update(fsDB.collection('erp_customers').doc(String(custId)), {due: cust.due - original.due + due});
  } else {
    if(original){
      const oldCust = DB.customers.find(c=>c.id===original.customerId);
      if(oldCust) batch.update(fsDB.collection('erp_customers').doc(String(original.customerId)), {due: oldCust.due - original.due});
    }
    batch.update(fsDB.collection('erp_customers').doc(String(custId)), {due: (cust.due||0) + due});
  }

  batch.set(fsDB.collection('erp_sales').doc(String(saleId)), {
    id:saleId, date, customerId:custId, customerName: cust.name,
    items: items.map(({productId,qty,price,buyPrice,dispQty,dispUnit,dispPrice})=>({productId,qty,price,buyPrice, ...(dispUnit?{dispQty,dispUnit,dispPrice}:{})})), subtotal, discount, discountPercent,
    total, paid, due, cogs, changeGiven,
    createdBy: original?original.createdBy:(currentUser?currentUser.name:''),
    createdByUsername: original?original.createdByUsername:(currentUser?currentUser.username:''),
    ...(original?{editedBy: currentUser?currentUser.name:'', editedAt: new Date().toISOString()}:{})
  });

  // ---- পরিসংখ্যান (দৈনিক/সর্বমোট) নিট আপডেট ----
  if(original && original.date===date){
    applyStatsDelta(batch, date, {totalSales: total-original.total, totalCogs: cogs-original.cogs});
  } else {
    if(original) applyStatsDelta(batch, original.date, {totalSales:-original.total, totalCogs:-original.cogs, salesCount:-1});
    applyStatsDelta(batch, date, {totalSales: total, totalCogs: cogs, salesCount: 1});
  }

  if(original) logAudit('বিক্রয় এন্ট্রি এডিট', `${refNo('INV', saleId)} — ${money(original.total)} → ${money(total)}`);
  closeModal();
  fireWrite(batch.commit(), original?'বিক্রয় এডিট':'বিক্রয় এন্ট্রি');
  editingSaleId = null;
}
function deleteSale(id){
  const _s0 = currentSalesRows().find(x=>x.id===id);
  if(_s0 && _s0.returnedTotal>0){ alert('এই ভাউচারে পণ্য ফেরত নেওয়া হয়েছে — তাই মোছা যায় না (স্টক দু-বার যোগ হয়ে যেত)।'); return; }
  if(!confirm('এই বিক্রয় এন্ট্রি মুছে ফেলতে চান? (স্টক ফেরত যাবে)')) return;
  const s = currentSalesRows().find(x=>x.id===id);
  if(!s) return;
  const batch = fsDB.batch();
  s.items.forEach(it=>{
    const p = DB.products.find(x=>x.id===it.productId);
    if(p) batch.update(fsDB.collection('erp_products').doc(String(it.productId)), {stock: p.stock + it.qty});
    logStockMove(batch, {productId:it.productId, qty:it.qty, type:'sale-void', refType:'sale', refId:id, date: s.date});
  });
  const cust = DB.customers.find(c=>c.id===s.customerId);
  if(cust) batch.update(fsDB.collection('erp_customers').doc(String(s.customerId)), {due: (cust.due||0) - s.due});
  batch.delete(fsDB.collection('erp_sales').doc(String(id)));
  applyStatsDelta(batch, s.date, {totalSales: -s.total, totalCogs: -(s.cogs||0), salesCount: -1});
  logAudit('বিক্রয় এন্ট্রি মোছা', refNo('INV', id) + ' — ' + money(s.total));
  fireWrite(batch.commit(), 'বিক্রয় মোছা');
}


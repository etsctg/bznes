/* ================= ক্রয়ের অতিরিক্ত খরচ (ল্যান্ডেড কস্ট) + ক্রয় ফেরত =================
   ১) লোডিং/বোঝাই, পরিবহন, প্যাকিং ইত্যাদি অতিরিক্ত খরচ ক্রয়-ভাউচারের সাথেই যোগ হয় এবং
      পণ্যের ক্রয়মূল্যে (ল্যান্ডেড দর) বণ্টন হয়ে যায় → গড় ক্রয়মূল্য ও লাভের হিসাব সঠিক থাকে।
      সাপ্লায়ারের বিলে যোগ হওয়া খরচ (যেমন বিলে লেখা গাড়িভাড়া) বাকি/জমায় যায়; বাকি খরচ (লেবার,
      গাড়িওয়ালা ইত্যাদি) নগদ — ক্যাশবুকে আলাদা লাইনে খরচ হিসেবে দেখায়।
   ২) ক্রয় ফেরত: সাপ্লায়ারকে ফেরত দেওয়া পণ্য স্টক থেকে কমে, আগে সাপ্লায়ারের বাকি থেকে কাটে,
      বাকিটা নগদ ফেরত পাওয়া ধরা হয়। প্রতিটা ফেরতের আলাদা ভাউচার (PRT-...)। */

const _inc = n => firebase.firestore.FieldValue.increment(r2(n));   // একসাথে একাধিক ডিভাইসে এন্ট্রি দিলে স্টক/বাকি যেন "ওভাররাইট" না হয়

/* ---------- ১) অতিরিক্ত খরচ ---------- */
const EXTRA_TYPES = [['labor','লেবার/বোঝাই খরচ'],['unload','আনলোড/নামানো খরচ'],['transport','পরিবহন/গাড়িভাড়া'],['packing','প্যাকিং খরচ'],['other','অন্যান্য খরচ']];
let purchaseExtras = [];          // {type, note, amount, onBill}
let purchaseAllocBy = 'value';    // 'value' = ক্রয়মূল্যের অনুপাতে, 'qty' = পরিমাণের অনুপাতে
function extraLabel(t){ const f = EXTRA_TYPES.find(x=>x[0]===t); return f ? f[1] : 'অন্যান্য খরচ'; }

/* বিশুদ্ধ হিসাব: প্রতিটা লাইনের প্রতি-একক ল্যান্ডেড দাম = দাম + (খরচের ভাগ ÷ পরিমাণ) */
function computeLanded(lines, extraTotal, by){
  const ex = Number(extraTotal)||0;
  if(!(ex>0)) return lines.map(l=>l.price);
  let base = by==='qty' ? lines.map(l=>l.qty) : lines.map(l=>l.qty*l.price);
  let sum = base.reduce((a,b)=>a+b,0);
  if(!(sum>0)){ base = lines.map(l=>l.qty); sum = base.reduce((a,b)=>a+b,0); }
  return lines.map((l,i)=> (l.qty>0 && sum>0) ? Math.round((l.price + ex*base[i]/sum/l.qty)*10000)/10000 : l.price);
}
function cleanExtras(){
  return purchaseExtras.map(e=>({type:e.type||'other', label:extraLabel(e.type), note:String(e.note||'').trim(), amount:r2(e.amount), onBill:!!e.onBill})).filter(e=>e.amount>0);
}
function extrasSplit(list){
  const bill = r2(list.filter(e=>e.onBill).reduce((s,e)=>s+e.amount,0)), cash = r2(list.filter(e=>!e.onBill).reduce((s,e)=>s+e.amount,0));
  return {bill, cash, all:r2(bill+cash)};
}
/* বর্তমান কার্টের প্রতিটা লাইনের ল্যান্ডেড দর (কার্টের লাইনে _landed বসিয়ে দেয়) */
function purchaseLanded(){
  const lines = purchaseCart.filter(l=>l.productId && l.qty>0);
  const prices = lines.map(l=>{ const p = DB.products.find(x=>x.id==l.productId); return (l.price!=null && !isNaN(Number(l.price))) ? Number(l.price) : (p?p.buyPrice:0); });
  const ex = extrasSplit(cleanExtras()).all;
  const landed = computeLanded(lines.map((l,i)=>({qty:l.qty, price:prices[i]})), ex, purchaseAllocBy);
  purchaseCart.forEach(l=>{ delete l._landed; });
  lines.forEach((l,i)=>{ l._landed = landed[i]; });
  return {lines, prices, landed, ex};
}
function extrasPanelHtml(){
  return `
    <details class="np-more" id="pf_extraDetails" ${purchaseExtras.length?'open':''} style="margin:10px 0;">
      <summary>🚚 অতিরিক্ত খরচ (লোডিং/পরিবহন/প্যাকিং…) — পণ্যের ক্রয়মূল্যে যোগ হবে</summary>
      <div style="padding:8px 0;">
        <div id="pf_extraRows"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;">
          <button type="button" class="btn btn-outline small-btn" onclick="addPurchaseExtra('labor')">＋ লেবার/বোঝাই</button>
          <button type="button" class="btn btn-outline small-btn" onclick="addPurchaseExtra('transport')">＋ পরিবহন</button>
          <button type="button" class="btn btn-outline small-btn" onclick="addPurchaseExtra('packing')">＋ প্যাকিং</button>
          <button type="button" class="btn btn-outline small-btn" onclick="addPurchaseExtra('other')">＋ অন্যান্য</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12.5px;">
          <span>খরচ ভাগ হবে:</span>
          <select id="pf_allocBy" onchange="purSetAlloc(this.value)"><option value="value" ${purchaseAllocBy==='value'?'selected':''}>পণ্যের ক্রয়মূল্যের অনুপাতে</option><option value="qty" ${purchaseAllocBy==='qty'?'selected':''}>পরিমাণের অনুপাতে (প্রতি একক সমান)</option></select>
        </div>
        <div id="pf_extraSummary" class="set-note" style="margin-top:8px;max-width:none;"></div>
      </div>
    </details>
    <details class="np-more" id="pf_priceDetails" open style="margin:10px 0;">
      <summary>💰 বিক্রয়মূল্য নির্ধারণ (ল্যান্ডেড ক্রয়মূল্য দেখে)</summary>
      <div style="padding:8px 0;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:12.5px;">
          <span>সব লাইনে লাভ %:</span><input id="pf_marginPct" type="number" inputmode="decimal" min="0" step="any" placeholder="যেমন ১৫" style="width:90px;">
          <button type="button" class="btn btn-outline small-btn" onclick="purApplyMargin()">প্রয়োগ করুন</button>
          <span style="color:var(--muted);">(নতুন গড় ক্রয়মূল্যের ওপর, পূর্ণ টাকায় উঠিয়ে)</span>
        </div>
        <div id="pf_priceRows" style="overflow-x:auto;"></div>
      </div>
    </details>`;
}
function purRenderExtras(){
  const host = document.getElementById('pf_extraRows'); if(!host) return;
  host.innerHTML = purchaseExtras.map((e,i)=>`
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;padding:6px;border:1px dashed var(--line);border-radius:8px;">
      <select onchange="purExtraSet(${i},'type',this.value)" style="flex:1 1 140px;">${EXTRA_TYPES.map(([k,l])=>`<option value="${k}" ${e.type===k?'selected':''}>${l}</option>`).join('')}</select>
      <input type="text" value="${esc(e.note||'')}" placeholder="ভাউচার নং / কাকে দেওয়া (ঐচ্ছিক)" oninput="purExtraSet(${i},'note',this.value)" style="flex:2 1 170px;">
      <input type="number" inputmode="decimal" min="0" step="any" value="${e.amount||''}" placeholder="৳ টাকা" oninput="purExtraSet(${i},'amount',this.value)" onfocus="this.select()" style="flex:1 1 90px;max-width:130px;">
      <label style="font-size:11.5px;display:flex;gap:4px;align-items:center;" title="টিক দিলে এই খরচ সাপ্লায়ারের বিলের মোটে যোগ হবে (বাকি/জমা তাতে ধরা হবে)। টিক না দিলে এটা নগদ আলাদা পরিশোধ — ক্যাশবুকে খরচ হিসেবে যাবে।"><input type="checkbox" ${e.onBill?'checked':''} onchange="purExtraSet(${i},'onBill',this.checked)"> সাপ্লায়ারের বিলে</label>
      <button type="button" class="icon-btn" onclick="purExtraDel(${i})" title="মুছুন">🗑️</button>
    </div>`).join('') || '<div style="font-size:12px;color:var(--muted);">কোনো অতিরিক্ত খরচ নেই — নিচের বাটনে চেপে যোগ করুন।</div>';
}
function addPurchaseExtra(type){
  purchaseExtras.push({type:type||'other', note:'', amount:'', onBill:false});
  const d = document.getElementById('pf_extraDetails'); if(d) d.open = true;
  purRenderExtras(); purRefreshExtraUI();
  const rows = document.querySelectorAll('#pf_extraRows input[type=number]'); if(rows.length) rows[rows.length-1].focus();
}
function purExtraSet(i, k, v){
  const e = purchaseExtras[i]; if(!e) return;
  e[k] = (k==='amount') ? v : (k==='onBill' ? !!v : v);
  calcPurchaseTotal();
}
function purExtraDel(i){ purchaseExtras.splice(i,1); purRenderExtras(); calcPurchaseTotal(); }
function purSetAlloc(v){ purchaseAllocBy = v==='qty' ? 'qty' : 'value'; calcPurchaseTotal(); }
function purSetNewSell(i, v){
  const l = purchaseCart[i]; if(!l) return;
  l.newSell = Number(v)||0;
  renderPurchaseLines();
  const cell = document.getElementById('pf_pm_'+i); if(cell) cell.innerHTML = purMarginCell(i);
}
/* এই লাইনের লক্ষ্য-পণ্য (রং-ভ্যারিয়েন্ট থাকলে সেটা) — না থাকলে নতুন ভ্যারিয়েন্ট ধরা হয় */
function purTargetProduct(l){
  const base = DB.products.find(x=>x.id==l.productId); if(!base) return null;
  const color = (l.color||'').trim(); if(!color) return base;
  return DB.products.find(x=>x.name===base.name && (x.brand||'')===(base.brand||'') && (x.size||'')===(base.size||'') && (x.color||'')===color) || {...base, stock:0, buyPrice:0, _new:true};
}
function purNewAvg(l){
  const t = purTargetProduct(l); if(!t || l._landed==null) return null;
  const st = Math.max(0, t.stock||0);
  return (st + l.qty)>0 ? (st*(t.buyPrice||0) + l.qty*l._landed)/(st+l.qty) : l._landed;
}
function purMarginCell(i){
  const l = purchaseCart[i], t = l ? purTargetProduct(l) : null; if(!t) return '';
  const avg = purNewAvg(l); const sell = l.newSell>0 ? l.newSell : t.sellPrice;
  if(avg==null || !(avg>0)) return '';
  const pct = (sell-avg)/avg*100, col = sell<=avg ? 'var(--danger-text)' : 'var(--success)';
  return `<b style="color:${col};">${pct.toFixed(1)}%</b>${sell<=avg?' ⚠️':''}`;
}
function purRenderPricing(){
  const host = document.getElementById('pf_priceRows'); if(!host) return;
  if(!purchaseCart.filter(l=>l.productId && l.qty>0).length){ host.innerHTML = '<div style="font-size:12px;color:var(--muted);">পণ্য যোগ করলে এখানে ল্যান্ডেড দর ও বিক্রয়মূল্য ঠিক করার ঘর আসবে।</div>'; return; }
  host.innerHTML = `<table style="min-width:560px;"><tr><th>পণ্য</th><th class="num">এই ব্যাচের ল্যান্ডেড দর</th><th class="num">নতুন গড় ক্রয়মূল্য</th><th class="num">বর্তমান বিক্রয়</th><th class="num">নতুন বিক্রয়মূল্য</th><th class="num">লাভ%</th></tr>
    ${purchaseCart.map((l,i)=>{
      if(!l.productId || !(l.qty>0)) return '';
      const t = purTargetProduct(l); if(!t) return '';
      const avg = purNewAvg(l), land = l._landed;
      return `<tr><td>${esc(t.name)}${t.color?' ('+esc(t.color)+')':(l.color?' ('+esc(l.color)+')':'')}</td>
        <td class="num">${money(r2(land))}</td><td class="num">${avg==null?'-':money(r2(avg))}</td><td class="num">${money(t.sellPrice)}</td>
        <td class="num"><input type="number" inputmode="decimal" min="0" step="any" value="${l.newSell>0?l.newSell:''}" placeholder="${t.sellPrice}" style="width:96px;" oninput="purSetNewSell(${i},this.value)" onfocus="this.select()"></td>
        <td class="num" id="pf_pm_${i}">${purMarginCell(i)}</td></tr>`;
    }).join('')}</table>`;
}
function purApplyMargin(){
  const m = Number(document.getElementById('pf_marginPct')?.value);
  if(!(m>=0)){ toast('লাভ % দিন'); return; }
  purchaseLanded();
  purchaseCart.forEach(l=>{ if(l.productId && l.qty>0){ const avg = purNewAvg(l); if(avg>0) l.newSell = Math.ceil(avg*(1+m/100)); } });
  renderPurchaseLines(); purRenderPricing();
}
/* মোট/সারসংক্ষেপ/প্রাইসিং টেবিল আবার আঁকা (calcPurchaseTotal থেকে ডাকা হয়) */
function purRefreshExtraUI(){
  const info = purchaseLanded();
  const sp = extrasSplit(cleanExtras());
  const sum = document.getElementById('pf_extraSummary');
  if(sum){
    const goods = r2(info.lines.reduce((s,l,i)=>s+l.qty*info.prices[i],0));
    sum.innerHTML = sp.all>0
      ? `মোট অতিরিক্ত খরচ <b>${money(sp.all)}</b> (সাপ্লায়ারের বিলে ${money(sp.bill)} • নগদ আলাদা ${money(sp.cash)}) → পণ্যের মূল্য ${money(goods)} + খরচ = <b>ল্যান্ডেড মোট ${money(r2(goods+sp.all))}</b>।${sp.cash>0?`<br>নগদ ${money(sp.cash)} ক্যাশবুকে "ক্রয়-সংশ্লিষ্ট খরচ" হিসেবে বের হবে।`:''}`
      : 'অতিরিক্ত খরচ যোগ করলে এখানে হিসাব দেখাবে।';
  }
  const cashRow = document.getElementById('pf2_cashExtraRow');
  if(cashRow){ if(sp.cash>0){ cashRow.classList.remove('hidden'); setField('pf2_cashExtra', money(sp.cash)); } else cashRow.classList.add('hidden'); }
  purRenderPricing();
}

/* ---------- ২) ক্রয় ফেরত ---------- */
let pretCtx = null;
function openPurchaseReturnModal(purId){
  const pur = currentPurchaseRows().find(x=>x.id===purId);
  if(!pur){ alert('এন্ট্রিটি বর্তমান তালিকায় পাওয়া যায়নি — তারিখ রেঞ্জ বদলে আবার চেষ্টা করুন।'); return; }
  if(!hasAccess('manager')){ alert('ক্রয় ফেরত শুধু ম্যানেজার/এডমিন নিতে পারেন।'); return; }
  const ret = pur.retQty || {}, consumed = {};
  pretCtx = {pur, value:0, applied:0, cash:0, landedValue:0, wasted:0};
  const rows = pur.items.map((it,i)=>{
    const p = DB.products.find(x=>x.id===it.productId);
    const usedBefore = Math.max(0, Math.min(it.qty, (ret[it.productId]||0) - (consumed[it.productId]||0)));
    consumed[it.productId] = (consumed[it.productId]||0) + usedBefore;
    const remain = r2(it.qty - usedBefore), max = r2(Math.max(0, Math.min(remain, p?p.stock:0)));
    return `<tr><td>${esc(p?p.name+(p.color?' ('+p.color+')':''):'মুছে ফেলা পণ্য')}</td><td class="num">${it.qty} ${esc(p?p.unit:'')}</td><td class="num">${usedBefore||'-'}</td><td class="num">${p?p.stock:0}</td>
      <td class="num"><input class="pret-in" type="number" inputmode="decimal" step="any" min="0" max="${max}" data-i="${i}" value="0" ${max<=0?'disabled':''} oninput="calcPurchaseReturn()" onfocus="this.select()"></td></tr>`;
  }).join('');
  openModal(`
    <div class="entry-head"><h3>↩️ ক্রয় ফেরত — ${refNo('PUR', pur.id)}</h3></div>
    <div class="entry-body">
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">সাপ্লায়ার: <b style="color:var(--ink);">${esc(pur.supplierName)}</b> • ভাউচারে বাকি (দেনা): <b style="color:var(--ink);">${money(pur.due)}</b> ${hintIc('ফেরতের মূল্য = ফেরত পণ্যের ক্রয়-ভাউচারের দর। আগে সাপ্লায়ারের এই ভাউচারের বাকি থেকে কাটা হয়, বাকিটা নগদ ফেরত পাওয়া ধরা হয়। স্টকে যতটা আছে তার বেশি ফেরত দেওয়া যায় না।')}</div>
      <div class="tbl-wrap"><table>
        <tr><th>পণ্য</th><th class="num">কেনা</th><th class="num">আগে ফেরত</th><th class="num">এখন স্টকে</th><th class="num">এখন ফেরত</th></tr>
        ${rows}
      </table></div>
      <div class="sum-compact" style="margin-top:10px;">
        <div class="sum-line"><span>ফেরতের মূল্য (সাপ্লায়ারের কাছে)</span><b id="pret_value">৳0</b></div>
        <div class="sum-line"><span>দেনা/বাকি থেকে কাটা যাবে</span><b id="pret_due">৳0</b></div>
        <div class="sum-line"><span>💵 নগদ ফেরত পাবেন</span><b id="pret_cash" style="color:var(--success);">৳0</b></div>
        <div class="sum-line" id="pret_wasteRow" style="display:none;"><span>অতিরিক্ত খরচের অংশ (ফেরত হয় না — খরচে যাবে)</span><b id="pret_waste" style="color:var(--warn-text);">৳0</b></div>
        <div class="sum-inputs" style="grid-template-columns:1fr 1.6fr;">
          <div><label>তারিখ</label><input id="pret_date" type="date" value="${todayStr()}"></div>
          <div><label>কারণ/নোট</label><input id="pret_note" type="text" placeholder="যেমন: নষ্ট/ভুল মাল"></div>
        </div>
      </div>
      <div id="pret_prev" style="margin-top:10px;"></div>
    </div>
    <div class="entry-foot"><div class="foot-btns" style="margin-left:auto;">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" onclick="savePurchaseReturn()">↩️ ফেরত সংরক্ষণ</button>
    </div></div>`);
  document.getElementById('modalBox').className = 'modal entry-modal';
  calcPurchaseReturn();
  loadPrevPurchaseReturns(pur.id);
}
function calcPurchaseReturn(){
  const c = pretCtx; if(!c) return;
  let value = 0, landedValue = 0;
  document.querySelectorAll('.pret-in').forEach(inp=>{
    const it = c.pur.items[Number(inp.dataset.i)], max = Number(inp.max)||0;
    let q = Number(inp.value)||0; if(q<0) q = 0; if(q>max){ q = max; inp.value = max; }
    value += q*it.price; landedValue += q*(it.landed!=null ? it.landed : it.price);
  });
  c.value = r2(value); c.landedValue = r2(landedValue); c.wasted = r2(Math.max(0, landedValue - value));
  c.applied = r2(Math.min(c.pur.due, c.value)); c.cash = r2(c.value - c.applied);
  setField('pret_value', money(c.value)); setField('pret_due', money(c.applied)); setField('pret_cash', money(c.cash));
  const wr = document.getElementById('pret_wasteRow'); if(wr){ wr.style.display = c.wasted>0 ? '' : 'none'; setField('pret_waste', money(c.wasted)); }
}
async function loadPrevPurchaseReturns(purId){
  const host = document.getElementById('pret_prev'); if(!host) return;
  try{
    const snap = await fsDB.collection('erp_purchase_returns').where('purchaseId','==',purId).get();
    const rows = snap.docs.map(d=>d.data()).sort((a,b)=>b.id-a.id);
    if(!rows.length || !document.getElementById('pret_prev')) return;
    host.innerHTML = `<div style="font-size:12.5px;font-weight:700;margin-bottom:4px;">আগের ফেরত ভাউচার</div>` + rows.map(r=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line);"><span>${refNo('PRT',r.id)} • ${fmtDate(r.date)} • ${money(r.amount)}</span><span><button class="icon-btn" onclick='printPurchaseReturn(${attrJson(r)})'>🖨️</button><button class="icon-btn" onclick='sharePurchaseReturn(${attrJson(r)})'>📤</button></span></div>`).join('');
  }catch(e){ console.warn('আগের ক্রয় ফেরত লোড হয়নি:', e); }
}
function savePurchaseReturn(){
  const c = pretCtx; if(!c) return;
  calcPurchaseReturn();
  const pur = c.pur, items = [];
  document.querySelectorAll('.pret-in').forEach(inp=>{
    const q = Number(inp.value)||0; if(q<=0) return;
    const it = pur.items[Number(inp.dataset.i)];
    items.push({productId:it.productId, qty:q, price:it.price, landed:(it.landed!=null?it.landed:it.price)});
  });
  if(!items.length){ alert('অন্তত একটি পণ্যের ফেরত পরিমাণ দিন'); return; }
  const qtyByProd = {}; items.forEach(i=>{ qtyByProd[i.productId] = r2((qtyByProd[i.productId]||0)+i.qty); });
  for(const pid of Object.keys(qtyByProd)){
    const p = DB.products.find(x=>x.id==pid);
    if(!p || qtyByProd[pid] > p.stock + 1e-9){ alert(`"${p?p.name:'পণ্য'}" এর স্টক (${p?p.stock:0}) ফেরত পরিমাণের চেয়ে কম — এতটা ফেরত দেওয়া যাবে না।`); return; }
  }
  const date = document.getElementById('pret_date').value || todayStr();
  const note = document.getElementById('pret_note').value.trim();
  const retId = genId(), batch = fsDB.batch();
  // স্টক কমানো + গড় ক্রয়মূল্য ঠিক রাখা (ফেরত পণ্যের ল্যান্ডেড মূল্য স্টক-মান থেকে বাদ)
  Object.keys(qtyByProd).forEach(pid=>{
    const p = DB.products.find(x=>x.id==pid), q = qtyByProd[pid];
    const lv = items.filter(i=>i.productId==pid).reduce((s,i)=>s+i.qty*i.landed,0);
    const upd = {stock:_inc(-q)}, newStock = p.stock - q;
    if(newStock>0){ const val = Math.max(0,p.stock)*(p.buyPrice||0) - lv; if(val>0) upd.buyPrice = Math.round(val/newStock*100)/100; }
    batch.update(fsDB.collection('erp_products').doc(String(pid)), upd);
  });
  items.forEach(i=>logStockMove(batch, {productId:i.productId, qty:-i.qty, type:'purchase-return', refType:'preturn', refId:retId, date}));
  if(c.applied>0) batch.update(fsDB.collection('erp_suppliers').doc(String(pur.supplierId)), {due:_inc(-c.applied)});
  const newRet = {...(pur.retQty||{})}; Object.keys(qtyByProd).forEach(pid=>{ newRet[pid] = r2((newRet[pid]||0)+qtyByProd[pid]); });
  const upd = {retQty:newRet, returnedTotal:r2((pur.returnedTotal||0)+c.value), refundedCash:r2((pur.refundedCash||0)+c.cash), due:r2(pur.due-c.applied), returnCount:(pur.returnCount||0)+1};
  batch.update(fsDB.collection('erp_purchases').doc(String(pur.id)), upd);
  const rec = {id:retId, date, purchaseId:pur.id, purRef:refNo('PUR',pur.id), supplierId:pur.supplierId, supplierName:pur.supplierName, items, amount:c.value, appliedToDue:c.applied, cashRefund:c.cash, wasted:c.wasted, note, createdBy:currentUser?currentUser.name:'', at:new Date().toISOString()};
  batch.set(fsDB.collection('erp_purchase_returns').doc(String(retId)), rec);
  applyStatsDelta(batch, date, {totalPurchase:-c.value, totalPurchaseReturns:c.value, purchaseReturnCount:1, totalCogs:c.wasted});
  logAudit('ক্রয় ফেরত', `${refNo('PUR',pur.id)} — ${money(c.value)} (নগদ ফেরত ${money(c.cash)})`);
  Object.assign(pur, upd);
  fireWrite(batch.commit(), 'ক্রয় ফেরত');
  pretCtx = null;
  showPurchaseReturnReceipt(rec);
}
function buildPurchaseReturnModel(rec){
  const items = rec.items.map(it=>{ const p = DB.products.find(x=>x.id===it.productId); return {name:esc(p?p.name+(p.color?' ('+p.color+')':''):'—'), qty:esc(`${it.qty} ${p?p.unit:''}`), rate:money(it.price), sub:money(r2(it.price*it.qty))}; });
  const totals = [{label:'ফেরতের মূল্য', value:money(rec.amount), bold:true}];
  if(rec.appliedToDue>0) totals.push({label:'দেনা/বাকি থেকে কাটা হলো', value:money(rec.appliedToDue)});
  totals.push({label:'নগদ ফেরত পাওয়া গেল', value:money(rec.cashRefund), bold:true});
  const sup = DB.suppliers.find(c=>c.id===rec.supplierId), ref = refNo('PRT', rec.id);
  return {title:'ক্রয় ফেরত ভাউচার', file:ref,
    meta:[['ভাউচার #',ref],['তারিখ',fmtDate(rec.date)],['সাপ্লায়ার',esc(rec.supplierName)],['মূল ক্রয়',esc(rec.purRef)]],
    items, totals, rateLabel:'দর', by:maskUser(rec.createdBy)||'', footer:esc(DB.settings?.footer||'ধন্যবাদ।'),
    waPhone:waNumber(sup&&sup.phone),
    waText:`${DB.settings?.shopName||'ব্যবসা ম্যানেজার'}\nক্রয় ফেরত ${ref} (${fmtDate(rec.date)})\nমূল ক্রয়: ${rec.purRef}\nফেরতের মূল্য: ${money(rec.amount)}\nনগদ ফেরত: ${money(rec.cashRefund)}`};
}
function printPurchaseReturn(rec){ printDoc(buildPurchaseReturnModel(rec)); }
function sharePurchaseReturn(rec){ shareDoc(buildPurchaseReturnModel(rec)); }
function showPurchaseReturnReceipt(rec){
  openModal(`
    <h3>✅ ক্রয় ফেরত সংরক্ষিত হয়েছে</h3>
    <div style="font-size:14px;line-height:1.9;margin-bottom:10px;">
      <div><b>${esc(rec.supplierName)}</b> — ${esc(rec.purRef)} • ${refNo('PRT',rec.id)}</div>
      <div>ফেরতের মূল্য: <b>${money(rec.amount)}</b></div>
      ${rec.appliedToDue>0?`<div>দেনা/বাকি থেকে কাটা: <b>${money(rec.appliedToDue)}</b></div>`:''}
      <div>💵 নগদ ফেরত পাবেন: <b style="color:var(--success);">${money(rec.cashRefund)}</b></div>
      <div style="font-size:12px;color:var(--muted);">ফেরত দেওয়া পণ্য স্টক থেকে কমেছে।</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
      <button class="btn btn-outline" onclick='sharePurchaseReturn(${attrJson(rec)})'>📤 শেয়ার</button>
      <button class="btn btn-gold" onclick='printPurchaseReturn(${attrJson(rec)})'>🖨️ প্রিন্ট</button>
    </div>`);
}

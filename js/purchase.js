/* ================= ক্রয় =================
   ক্রয় তালিকা, বিস্তারিত, এন্ট্রি/এডিট (গড়-ক্রয়মূল্য পুনর্গণনাসহ), ডিলিট। */

/* ================= PURCHASE ================= */
let rangePurchaseRows = null;
function currentPurchaseRows(){ return rangePurchaseRows || DB.purchases; }
function renderPurchase(){
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar">
      <div><h2>ক্রয় হিসাব</h2><div class="sub">ডিফল্টভাবে আজকের ক্রয় দেখাচ্ছে (রিয়েল-টাইম) — যেকোনো পেজ থেকে F3 চাপলেই নতুন ক্রয় খুলবে</div></div>
      <button class="btn btn-gold" onclick="openPurchaseModal()">+ নতুন ক্রয় যোগ করুন (F3)</button>
    </div>
    <div class="toolbar">
      <input type="date" id="purFrom" value="${todayStr()}" onchange="renderPurchaseTable()">
      <span style="color:var(--muted);font-size:12px;">থেকে</span>
      <input type="date" id="purTo" value="${todayStr()}" onchange="renderPurchaseTable()">
      <button class="btn btn-outline small-btn" onclick="document.getElementById('purFrom').value='';document.getElementById('purTo').value='';renderPurchaseTable();">সব সময়</button>
      ${voucherSearchHtml('purchase')}
      <select id="purViewMode" onchange="renderPurchaseTable()">
        <option value="invoice">ভিউ: ভাউচার-ভিত্তিক</option>
        <option value="items">ভিউ: পণ্য-ভিত্তিক রিপোর্ট</option>
      </select>
      <div class="spacer"></div>
      <span style="color:var(--muted);font-size:12.5px;" id="purCountLbl"></span>
    </div>
    <div class="card"><div class="tbl-wrap" id="purchaseTableWrap"></div></div>
    <div class="card" style="margin-top:16px;" id="purUserBreakdownCard"></div>
  `;
  rangePurchaseRows = null;
  renderPurchaseTable();
}
async function renderPurchaseTable(keep){
  const from = document.getElementById('purFrom')?.value;
  const to = document.getElementById('purTo')?.value;
  const isToday = from===todayStr() && to===todayStr();
  let truncated = false;
  if(isToday){
    rangePurchaseRows = null;
  } else if(keep===true && rangePurchaseRows){
    /* সার্চ লেখার সময় আগের লোড করা সারিই ব্যবহার হয় */
  } else {
    document.getElementById('purchaseTableWrap').innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted);">লোড হচ্ছে...</div>`;
    const res = await loadPurchaseRange(from||null, to||null);
    if(document.getElementById('purFrom')===null) return;
    rangePurchaseRows = res.rows; truncated = res.truncated;
  }
  const rows = voucherFilter([...currentPurchaseRows()].sort((a,b)=>b.id-a.id), 'purchase');
  const countLbl = document.getElementById('purCountLbl');
  if(countLbl) countLbl.textContent = `দেখানো হচ্ছে: ${rows.length} টি` + (truncated?` (সাম্প্রতিক সর্বোচ্চ ${RANGE_LOAD_LIMIT}টি — তারিখ রেঞ্জ ছোট করে আরও নির্দিষ্টভাবে দেখুন)`:'');
  const viewMode = document.getElementById('purViewMode')?.value||'invoice';
  if(viewMode==='items'){ renderPurchaseItemReport(rows); renderUserBreakdownCard(rows, 'purUserBreakdownCard', 'ক্রয়'); return; }
  document.getElementById('purchaseTableWrap').innerHTML = `
    <table>
      <tr><th>#</th><th>তারিখ</th><th>সাপ্লায়ার</th><th class="num">মোট</th><th class="num">জমা</th><th class="num">বাকি</th><th>স্ট্যাটাস</th><th></th></tr>
      ${rows.map(s=>`
        <tr>
          <td>${voucherLink('PUR', s, 'purchase')}</td><td>${fmtDate(s.date)}</td><td>${esc(s.supplierName)}</td>
          <td class="num">${money(s.total)}</td><td class="num">${money(s.paid)}</td><td class="num">${money(s.due)}</td>
          <td>${s.due<=0?'<span class="pill ok">পরিশোধিত</span>':'<span class="pill warn">বাকি আছে</span>'}${s.returnedTotal>0?' <span class="pill warn">↩️ ফেরত</span>':''}${s.extraTotal>0||(s.extras&&s.extras.length)?' <span class="pill" title="অতিরিক্ত খরচ যুক্ত">🚚</span>':''}</td>
          <td><button class="icon-btn" onclick="viewPurchaseDetail(${s.id})" title="বিস্তারিত">👁️</button>
              ${hasAccess('manager')?`<button class="icon-btn" onclick="openPurchaseReturnModal(${s.id})" title="ক্রয় ফেরত (সাপ্লায়ারকে)">↩️</button>`:''}
              <button class="icon-btn" onclick="printPurchaseVoucher(${s.id})" title="প্রিন্ট">🖨️</button>
              <button class="icon-btn" onclick="sharePurchaseVoucher(${s.id})" title="ছবি শেয়ার">📤</button>
              ${s.due>0?`<button class="icon-btn" onclick="openInvoicePaymentModal('purchase',${s.id})" title="বাকি পরিশোধ">💳</button>`:''}
              ${hasAccess('manager')?`<button class="icon-btn" onclick="deletePurchase(${s.id})" title="মুছুন">🗑️</button>`:''}</td>
        </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);">কোনো ক্রয় নেই</td></tr>`}
    </table>
  `;
  renderUserBreakdownCard(rows, 'purUserBreakdownCard', 'ক্রয়');
}
/* "পণ্য-ভিত্তিক রিপোর্ট" ভিউ — প্রতিটা ভাউচারের প্রতিটা পণ্য-লাইন আলাদা সারি হিসেবে
   দেখায়: তারিখ, পণ্য, পরিমাণ, দর, মোট, পার্টি, এন্ট্রি করেছেন, অ্যাকশন। */
function renderPurchaseItemReport(rows){
  const lines = [];
  rows.forEach(pur=>{
    pur.items.forEach(it=>{
      const p = DB.products.find(pp=>pp.id===it.productId);
      lines.push({pur, productName:p?(p.name+(p.color?' ('+p.color+')':'')):'পণ্য মুছে ফেলা হয়েছে', unit:p?p.unit:'', qty:it.qty, price:it.price, qtyCell: it.dispUnit?`${it.dispQty} ${it.dispUnit}`:String(it.qty), rateCell: itemRateText(it)});
    });
  });
  const totalLineAmt = lines.reduce((s,l)=>s+l.price*l.qty,0);
  document.getElementById('purchaseTableWrap').innerHTML = `
    <table>
      <tr><th>তারিখ</th><th>পণ্য</th><th class="num">পরিমাণ</th><th class="num">দর</th><th class="num">মোট</th><th>পার্টি</th><th>এন্ট্রি করেছেন</th><th>অ্যাকশন</th></tr>
      ${lines.map(l=>`
        <tr>
          <td>${fmtDate(l.pur.date)}</td><td>${esc(l.productName)} ${esc(l.unit)}</td>
          <td class="num">${esc(l.qtyCell)}</td><td class="num">${esc(l.rateCell)}</td><td class="num">${money(r2(l.price*l.qty))}</td>
          <td>${esc(l.pur.supplierName)}</td><td>${esc(maskUser(l.pur.createdBy)||'-')}</td>
          <td><button class="icon-btn" onclick="viewPurchaseDetail(${l.pur.id})" title="বিস্তারিত">👁️</button>
              <button class="icon-btn" onclick="printPurchaseVoucher(${l.pur.id})" title="প্রিন্ট">🖨️</button>
              <button class="icon-btn" onclick="sharePurchaseVoucher(${l.pur.id})" title="ছবি শেয়ার">📤</button>
              ${l.pur.due>0?`<button class="icon-btn" onclick="openInvoicePaymentModal('purchase',${l.pur.id})" title="বাকি পরিশোধ">💳</button>`:''}
              ${hasAccess('manager')?`<button class="icon-btn" onclick="deletePurchase(${l.pur.id})" title="মুছুন">🗑️</button>`:''}</td>
        </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);">কোনো ক্রয় নেই</td></tr>`}
      <tr><td colspan="4" class="foot-total">সর্বমোট</td><td class="foot-total num">${money(totalLineAmt)}</td><td colspan="3"></td></tr>
    </table>
  `;
}
/* ক্রয়ের বিস্তারিত — কোন পণ্য কত পরিমাণ কত দরে ক্রয় হলো, স্পষ্টভাবে দেখার জন্য।
   প্রতিটা পণ্যের পাশে "স্টক হিস্টোরি" বাটন আছে — স্টকে কোনো গরমিল মনে হলে
   এখান থেকেই সরাসরি সেই পণ্যের সম্পূর্ণ ক্রয়/বিক্রয় লেনদেনের ট্রেস দেখা যায়। */
function viewPurchaseDetail(id){
  const pur = currentPurchaseRows().find(x=>x.id===id);
  if(!pur) return;
  const rows = pur.items.map(it=>{
    const p = DB.products.find(pp=>pp.id===it.productId);
    return `<tr><td>${esc(p?p.name+(p.color?' ('+p.color+')':''):'পণ্য মুছে ফেলা হয়েছে')}</td><td class="num">${esc(itemQtyText(it,p))}</td><td class="num">${esc(itemRateText(it))}</td><td class="num">${money(r2(it.price*it.qty))}</td>
      <td>${p?`<button class="icon-btn" onclick="closeModal();openStockLedger(${p.id})" title="স্টক হিস্টোরি">🕓</button>`:''}</td></tr>`;
  }).join('');
  openModal(`
    <h3>ক্রয় বিস্তারিত — ${refNo('PUR', pur.id)}</h3>
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">তারিখ: ${fmtDate(pur.date)} • সাপ্লায়ার: ${esc(pur.supplierName)}${maskUser(pur.createdBy)?' • এন্ট্রি করেছেন: '+esc(maskUser(pur.createdBy)):''}${pur.editedBy?' • সর্বশেষ এডিট: '+esc(pur.editedBy):''}</div>
    <div class="tbl-wrap"><table>
      <tr><th>পণ্য</th><th class="num">পরিমাণ</th><th class="num">ক্রয়মূল্য</th><th class="num">সাবটোটাল</th><th></th></tr>
      ${rows}
      ${(pur.extras&&pur.extras.length)?`<tr><td colspan="3" style="color:var(--muted);">পণ্যের মূল্য</td><td class="num">${money(pur.goodsTotal!=null?pur.goodsTotal:pur.total)}</td><td></td></tr>
        ${pur.extras.map(e=>`<tr><td colspan="3">🚚 ${esc(e.label||extraLabel(e.type))}${e.note?' — '+esc(e.note):''} <span style="font-size:11px;color:var(--muted);">(${e.onBill?'সাপ্লায়ারের বিলে':'নগদ আলাদা'}, পণ্যের দামে ভাগ হয়েছে)</span></td><td class="num">${money(e.amount)}</td><td></td></tr>`).join('')}`:''}
      <tr><td colspan="3" class="foot-total">${pur.extraBill>0?'সাপ্লায়ারকে মোট':'সর্বমোট'}</td><td class="foot-total num">${money(pur.total)}</td><td></td></tr>
      ${pur.returnedTotal>0?`<tr><td colspan="3" style="color:var(--warn-text);">↩️ ক্রয় ফেরত (সাপ্লায়ারকে)</td><td class="num">-${money(pur.returnedTotal)}</td><td></td></tr>${pur.refundedCash>0?`<tr><td colspan="3">নগদ ফেরত পাওয়া গেছে</td><td class="num">${money(pur.refundedCash)}</td><td></td></tr>`:''}`:''}
      ${pur.changeGiven
        ? `<tr><td colspan="3">আপনি দিয়েছেন</td><td class="num">${money(r2(pur.paid+pur.changeGiven))}</td><td></td></tr>
           <tr><td colspan="3" style="color:var(--success);">ফেরত নেওয়া হয়েছে</td><td class="num" style="color:var(--success);">${money(pur.changeGiven)}</td><td></td></tr>`
        : `<tr><td colspan="3">জমা</td><td class="num">${money(pur.paid)}</td><td></td></tr>`}
      <tr><td colspan="3"><b>বাকি</b></td><td class="num"><b>${money(pur.due)}</b></td><td></td></tr>
    </table></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
      ${pur.due>0?`<button class="btn btn-outline" onclick="openInvoicePaymentModal('purchase',${pur.id})">💳 বাকি পরিশোধ</button>`:''}
      ${hasAccess('manager')?`<button class="btn btn-outline" onclick="closeModal();openPurchaseReturnModal(${pur.id})">↩️ ক্রয় ফেরত</button>`:''}
      ${(canEditVoucher(pur) && !(pur.returnedTotal>0))?`<button class="btn btn-outline" onclick="openPurchaseModal(${pur.id})">✏️ এডিট করুন</button>`:''}
      <button class="btn btn-outline" onclick="sharePurchaseVoucher(${pur.id})">📤 শেয়ার</button>
      <button class="btn btn-gold" onclick="printPurchaseVoucher(${pur.id})">🖨️ প্রিন্ট করুন</button>
    </div>
  `);
}
/* প্রতিটা ক্রয়-লাইনে এখন রং ও শেলফ (দুটোই ঐচ্ছিক) দেওয়া যায় — একই পণ্যের ভিন্ন
   রং ভিন্ন স্টক-লাইন হিসেবে স্বয়ংক্রিয়ভাবে তৈরি/আপডেট হয়ে যায় (নিচে savePurchase দেখুন) */
let purchaseCart = [];
let editingPurchaseId = null;
function openPurchaseModal(editId){
  let existing = null;
  if(editId){
    existing = currentPurchaseRows().find(x=>x.id===editId);
    if(!existing){ alert('এই এন্ট্রি বর্তমান তালিকায় লোড নেই — তারিখ রেঞ্জ "আজ" করে বা সেই তারিখ বেছে আবার চেষ্টা করুন।'); return; }
    if(!canEditVoucher(existing)){ alert('আপনি শুধু নিজের তৈরি করা এন্ট্রি এডিট করতে পারবেন (ম্যানেজার/এডমিন সবগুলো করতে পারবেন)।'); return; }
    if(existing.returnedTotal>0){ alert('এই ভাউচারে পণ্য ফেরত দেওয়া হয়েছে — তাই এডিট করা যায় না (স্টক/হিসাব গোলমাল হয়ে যেত)।'); return; }
  }
  purchaseExtras = existing && existing.extras ? existing.extras.map(e=>({type:e.type, note:e.note||'', amount:e.amount, onBill:!!e.onBill})) : [];
  purchaseAllocBy = (existing && existing.allocBy) || 'value';
  editingPurchaseId = editId || null;
  purchaseCart = existing ? existing.items.map(it=>({productId:it.productId, qty:it.qty, color:'', shelf:'', price:it.price, newSell:0, ...(it.dispUnit?{dispQty:it.dispQty,dispUnit:it.dispUnit,dispPrice:it.dispPrice}:{})})) : [];
  entryReset('purchase');
  openModal(`
    <div class="entry-head"><h3>${existing?`ক্রয় এডিট করুন — ${refNo('PUR', existing.id)}`:'🛒 নতুন ক্রয় এন্ট্রি'}</h3></div>
    <div class="entry-body">
    <div id="holdBar"></div>
    ${existing?`<div style="font-size:11.5px;color:var(--amber-2);margin-bottom:8px;">⚠️ এডিট করলে প্রতিটা লাইনের আগের ক্রয়মূল্যই থাকবে (বদলাতে লাইনের ✏️ চাপুন)। পণ্যের গড় ক্রয়মূল্য নতুন করে হিসাব হবে।</div>`:''}
    <div class="form-row">
      <div><label>তারিখ</label><input id="pf2_date" type="date" value="${existing?existing.date:todayStr()}"></div>
      <div><label>সাপ্লায়ার</label>
        <div style="display:flex;gap:6px;">
          <select id="pf2_supplier" style="flex:1;min-width:0;">${(existing && !DB.suppliers.find(c=>c.id===existing.supplierId)) ? `<option value="${existing.supplierId}" selected>⚠ ${esc(existing.supplierName)} (মুছে ফেলা)</option>` : ''}${DB.suppliers.map(c=>`<option value="${c.id}" ${existing&&existing.supplierId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
          <button type="button" class="btn btn-outline small-btn" style="flex:0 0 auto;" onclick="toggleQuickAddParty('purchase')" title="নতুন সাপ্লায়ার যোগ করুন">+</button>
        </div>
        <div id="pf_quickAddBox" class="hidden" style="margin-top:8px;padding:9px;border:1px dashed var(--line);border-radius:8px;">
          <div class="form-row" style="margin-bottom:8px;">
            <input type="text" id="pf_newSupName" placeholder="সাপ্লায়ারের নাম">
            <input type="text" id="pf_newSupPhone" placeholder="মোবাইল নম্বর (ঐচ্ছিক)">
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button type="button" class="btn btn-outline small-btn" onclick="toggleQuickAddParty('purchase')">বাতিল</button>
            <button type="button" class="btn btn-gold small-btn" onclick="quickAddParty('purchase')">যোগ করুন</button>
          </div>
        </div>
      </div>
    </div>
    <div class="entry-bar">
      <div class="eb-prod">
        <label>পণ্য</label>
        <div class="eb-inrow">
          <input type="text" id="purchEntProd" autocomplete="off" placeholder="🔍 নাম / কোড লিখুন বা স্ক্যান করুন (না থাকলে ＋)"
            oninput="entryTyped('purchase')" onkeydown="entryKeydown(event,'purchase')" onfocus="this.select();entryOpenList('purchase')" onclick="entryOpenList('purchase')"
            onblur="setTimeout(()=>entryHideSugg('purchase'),200)">
          <button type="button" class="np-btn" onclick="scanForEntry('purchase')" title="ক্যামেরায় বারকোড স্ক্যান">📷</button><button type="button" class="np-btn" onclick="openQuickProduct()" title="তালিকায় নেই? এখান থেকেই নতুন পণ্য যোগ করুন">＋</button>
        </div>
        <div class="sugg-box hidden" id="purchEntSugg"></div>
      </div>
      <div class="eb-info" id="purchEntInfo"></div>
      <div class="eb-row">
        <div class="il-field"><label>পরিমাণ</label><div class="qty-unit"><input class="il-qty" type="number" inputmode="decimal" min="0" step="any" id="purchEntQty" placeholder="১"
          oninput="entryUpdateSub('purchase')" onkeydown="entryQtyKeydown(event,'purchase')" onfocus="this.select()"><select class="il-unit hidden" id="purchEntUnit" onchange="entryUnitChanged('purchase')"></select></div></div>
        <div class="il-field"><label>ক্রয়মূল্য (আজকের দাম)</label><input class="il-price" type="number" inputmode="decimal" min="0" step="any" id="purchEntPrice"
          oninput="entryUpdateSub('purchase')" onkeydown="entryPriceKeydown(event,'purchase')" onfocus="this.select()"></div>
        <div class="il-field"><label>নতুন বিক্রয়মূল্য</label><input class="il-price" type="number" inputmode="decimal" min="0" step="any" id="purchEntSell" placeholder="অপরিবর্তিত"
          oninput="entryUpdateSub('purchase')" onkeydown="entryPriceKeydown(event,'purchase')" onfocus="this.select()"></div>
        <div class="il-field il-sub-field"><label>সাবটোটাল</label><input class="il-subtotal" readonly id="purchEntSub" tabindex="-1"></div>
        <button type="button" class="btn btn-gold eb-add" onclick="entryAdd('purchase')">➕ যোগ (Enter)</button>
      </div>
      <div class="eb-extra">
        <input type="text" id="purchEntColor" placeholder="রং (ঐচ্ছিক — নতুন রং হলে নতুন লাইন তৈরি হবে)" onkeydown="if(event.key==='Enter'){event.preventDefault();entryAdd('purchase');}">
        <input type="text" id="purchEntShelf" placeholder="শেলফ (ঐচ্ছিক)" onkeydown="if(event.key==='Enter'){event.preventDefault();entryAdd('purchase');}">
      </div>
      <div class="eb-msg" id="purchEntMsg"></div>
    </div>
    <div class="np-panel hidden" id="purchNewProd">
      <div class="np-head"><b>➕ নতুন পণ্য যোগ</b><button type="button" class="il-remove" onclick="closeQuickProduct()" title="বন্ধ">✖</button></div>
      <div class="np-grid">
        <input id="np_name" class="np-full" placeholder="পণ্যের নাম *" title="পণ্যের নাম">
        <input id="np_unit" placeholder="একক (কেজি/পিস)" title="প্রধান একক — স্টক এই এককে থাকবে" value="পিস">
        <input id="np_low" type="number" inputmode="decimal" placeholder="লো-স্টক লিমিট" title="স্টক এর নিচে নামলে সতর্কতা" value="5">
        <input id="np_buy" type="number" inputmode="decimal" step="any" placeholder="ক্রয়মূল্য (প্রতি একক)" title="প্রতি প্রধান এককের ক্রয়মূল্য">
        <input id="np_sell" type="number" inputmode="decimal" step="any" placeholder="বিক্রয়মূল্য (প্রতি একক)" title="প্রতি প্রধান এককের বিক্রয়মূল্য" onkeydown="if(event.key==='Enter'){event.preventDefault();saveQuickProduct();}">
      </div>
      <details class="np-more"><summary>আরও (কোড/বারকোড, ব্র্যান্ড, সাইজ, রং, শেলফ, বিকল্প একক)</summary>
        <div class="np-grid">
          <input id="np_code" placeholder="কোড/বারকোড (খালি = নিজে তৈরি)" title="কোম্পানির বারকোড স্ক্যান/লিখতে পারেন; খালি রাখলে ইউনিক নম্বর নিজে বসবে">
          <input id="np_brand" placeholder="ব্র্যান্ড" title="কোম্পানি/ব্র্যান্ড">
          <input id="np_size" placeholder="সাইজ/ওজন" title="সাইজ বা ওজন">
          <input id="np_color" placeholder="রং" title="রং (ঐচ্ছিক)">
          <input id="np_shelf" placeholder="শেলফ" title="শেলফ/তাক নম্বর">
          <input id="np_alt" placeholder="বিকল্প একক (বস্তা)" title="ঐচ্ছিক — যেমন বস্তা">
          <input id="np_factor" type="number" inputmode="decimal" step="any" placeholder="১ বিকল্প = কত?" title="১ বিকল্প একক = কত প্রধান একক">
        </div>
      </details>
      <div class="np-actions">
        <button type="button" class="btn btn-outline small-btn" onclick="closeQuickProduct()">বাতিল</button>
        <button type="button" class="btn btn-gold small-btn" onclick="saveQuickProduct()">✔ যোগ করুন ও বাছাই</button>
      </div>
    </div>
    <div class="cart-list" id="purchaseItemsBox"></div>
    ${extrasPanelHtml()}
    <div class="sum-compact">
      <div class="sum-inputs one">
        <div><label>জমা/পরিশোধিত ৳ (Enter = সংরক্ষণ)</label><input id="pf2_paid" type="number" inputmode="decimal" value="${existing?r2(existing.paid+(existing.changeGiven||0)):0}" oninput="calcPurchaseTotal()" onfocus="this.select()" onkeydown="if(event.key==='Enter'){event.preventDefault();savePurchase();}"></div>
      </div>
    </div>
    </div>
    <div class="entry-foot">
      <div class="foot-sum">
        <div class="fs-total"><span>মোট</span><b id="pf2_total">৳0</b></div>
        <div class="fs-sub"><span>বাকি (দেনা) <b id="pf2_due">৳0</b></span><span id="pf2_cashExtraRow" class="fs-change hidden">🧾 নগদ অতিরিক্ত খরচ <b id="pf2_cashExtra">৳0</b></span><span id="pf2_changeRow" class="fs-change hidden">💵 ফেরত নিন <b id="pf2_change">৳0</b></span></div>
      </div>
      <div class="foot-btns">
        ${existing?'':`<button class="btn btn-outline" onclick="holdCurrent('purchase')" title="এই স্লিপ জমা রেখে নতুন স্লিপ শুরু করুন">⏸️ হোল্ড</button>`}
        <button class="btn btn-outline" onclick="entryCancel('purchase')">বাতিল</button>
        <button class="btn btn-gold" id="modalSaveBtn" onclick="savePurchase()">${existing?'সংরক্ষণ':'💾 সংরক্ষণ'}</button>
      </div>
    </div>
  `);
  document.getElementById('modalBox').className='modal entry-modal purchase-theme';
  renderPurchaseLines();
  purRenderExtras();
  calcPurchaseTotal();
  if(!existing) holdBarInit('purchase');
  setTimeout(()=>document.getElementById('purchEntProd')?.focus(), 0);
}
function renderPurchaseLines(){
  const box = document.getElementById('purchaseItemsBox'); if(!box) return;
  box.innerHTML = cartRowsHtml('purchase', purchaseCart);
}
function removePurchaseLine(i){ purchaseCart.splice(i,1); renderPurchaseLines(); calcPurchaseTotal(); eEl('purchase','Prod')?.focus(); }
function calcPurchaseTotal(){
  let goods = 0;
  purchaseCart.forEach(l=>{ if(l.productId){ const p = DB.products.find(x=>x.id==l.productId); if(p) goods += ((l.price!=null)?Number(l.price):p.buyPrice)*(l.qty||0); } });
  const sp = extrasSplit(cleanExtras());
  const total = r2(goods + sp.bill);          // সাপ্লায়ারকে দেয় মোট = পণ্য + বিলে-যুক্ত খরচ
  setField('pf2_total', money(total));
  // বিক্রয়ের মতোই: বেশি টাকা দিলে বাকি ঋণাত্মক হয় না, বাড়তি অংশ "ফেরত পাবেন" হিসেবে আলাদা দেখায়
  const paidRaw = Number(document.getElementById('pf2_paid')?.value)||0;
  const due = Math.max(0, total - paidRaw);
  const changeBack = Math.max(0, paidRaw - total);
  setField('pf2_due', money(due));
  const dueNode = document.getElementById('pf2_due'); if(dueNode) dueNode.style.color = due>0 ? 'var(--warn-text)' : 'var(--success)';
  const changeRow = document.getElementById('pf2_changeRow');
  if(changeRow){ if(changeBack>0){ changeRow.classList.remove('hidden'); setField('pf2_change', money(changeBack)); } else changeRow.classList.add('hidden'); }
  purRefreshExtraUI();
  return total;
}
/* প্রতিটা লাইনের জন্য: রং খালি থাকলে সরাসরি বাছাই করা পণ্যেরই স্টক বাড়ে (আগের মতো সহজ)।
   রং দেওয়া থাকলে — একই নাম+ব্র্যান্ড+সাইজ+রং মিলে এমন পণ্য খোঁজা হয়; পেলে তার স্টক বাড়ে,
   না পেলে বাছাই করা পণ্যের তথ্য কপি করে নতুন রং-ভিত্তিক পণ্য-লাইন তৈরি হয়। */
function savePurchase(){
  if(!entryFlush('purchase')) return;
  const rawLines = purchaseCart.filter(l=>l.productId && l.qty>0);
  if(!rawLines.length){ alert('অন্তত একটি পণ্য যোগ করুন'); return; }
  const supId = Number(document.getElementById('pf2_supplier').value);
  const sup = DB.suppliers.find(c=>c.id===supId);
  if(!sup){ alert('এই ভাউচারের সাপ্লায়ার মুছে ফেলা হয়েছে — তালিকা থেকে অন্য একজন সাপ্লায়ার বেছে নিন।'); return; }
  const date = document.getElementById('pf2_date').value || todayStr();
  const paidRaw = Number(document.getElementById('pf2_paid').value)||0;
  const original = editingPurchaseId ? currentPurchaseRows().find(x=>x.id===editingPurchaseId) : null;
  if(original && original.returnedTotal>0){ alert('এই ভাউচারে ফেরত আছে — এডিট করা যায় না।'); return; }
  const purId = original ? original.id : genId();

  /* অতিরিক্ত খরচ → প্রতিটা লাইনের ল্যান্ডেড দর (দাম + খরচের ভাগ) */
  const extras = cleanExtras(), sp = extrasSplit(extras);
  const linePrices = rawLines.map(l=>{ const b0 = DB.products.find(x=>x.id===l.productId); return (l.price!=null && !isNaN(Number(l.price))) ? Number(l.price) : b0.buyPrice; });
  const landedArr = computeLanded(rawLines.map((l,i)=>({qty:l.qty, price:linePrices[i]})), sp.all, purchaseAllocBy);

  const resolvedItems = []; // {productId, qty, price, landed}
  const batch = fsDB.batch();
  // এডিট হলে — আগের সব আইটেমের পরিমাণ প্রথমে "বিয়োগ" হিসেবে ধরা হয় (রিভার্স),
  // তারপর নতুন প্রতিটা লাইনের পরিমাণ "যোগ" হয় — প্রতি পণ্যে একবারেই নিট আপডেট হবে
  const netQtyChange = {};
  const costAdds = {};   // পণ্য আইডি -> {qty, value, lastPrice, sell} — এই ক্রয়ে যা যোগ হচ্ছে (value ল্যান্ডেড মূল্যে)
  const origCost = {};   // এডিট হলে — আগের ক্রয়ের মান (রিভার্সের জন্য)
  if(original) original.items.forEach(it=>{
    netQtyChange[it.productId] = (netQtyChange[it.productId]||0) - it.qty;
    const oc = origCost[it.productId] || (origCost[it.productId] = {qty:0, value:0});
    oc.qty += it.qty; oc.value += it.qty*(it.landed!=null ? it.landed : it.price);
  });

  for(let li=0; li<rawLines.length; li++){
    const line = rawLines[li];
    const base = DB.products.find(x=>x.id===line.productId);
    const color = (line.color||'').trim();
    const shelf = (line.shelf||'').trim();
    const linePrice = linePrices[li], landed = landedArr[li];
    const lineSell = Number(line.newSell)||0;
    const dispExtra = line.dispUnit ? {dispQty:line.dispQty,dispUnit:line.dispUnit,dispPrice:line.dispPrice} : {};

    let targetId;
    if(!color && !shelf){
      targetId = base.id; // সহজ পথ: সরাসরি বাছাই করা পণ্য
    } else {
      const existingVariant = color
        ? DB.products.find(x=>
            x.name===base.name && (x.brand||'')===(base.brand||'') && (x.size||'')===(base.size||'') && (x.color||'')===color)
        : base;
      if(existingVariant){
        targetId = existingVariant.id;
        if(shelf && shelf!==existingVariant.shelf) batch.update(fsDB.collection('erp_products').doc(String(existingVariant.id)), {shelf});
      } else {
        const newId = genId();
        batch.set(fsDB.collection('erp_products').doc(String(newId)), {
          id:newId, code:reserveProductCode(), name:base.name, brand:base.brand||'', size:base.size||'', unit:base.unit,
          altUnit:base.altUnit||'', factor:base.factor||0,
          buyPrice:Math.round(landed*100)/100, sellPrice:(lineSell>0?lineSell:base.sellPrice), lowStock:base.lowStock,
          color, shelf, stock: line.qty
        });
        logStockMove(batch, {productId: newId, qty: line.qty, type:'purchase', refType:'purchase', refId: purId, date});
        resolvedItems.push({productId: newId, qty: line.qty, price: linePrice, landed, ...dispExtra});
        continue; // নতুন ভ্যারিয়েন্ট — নেট-চেঞ্জের হিসাবে ঢুকবে না, আলাদাভাবেই তৈরি হলো
      }
    }
    netQtyChange[targetId] = (netQtyChange[targetId]||0) + line.qty;
    const ca = costAdds[targetId] || (costAdds[targetId] = {qty:0, value:0, lastPrice:landed, sell:0});
    ca.qty += line.qty; ca.value += line.qty*landed; ca.lastPrice = landed; if(lineSell>0) ca.sell = lineSell;
    resolvedItems.push({productId: targetId, qty: line.qty, price: linePrice, landed, ...dispExtra});
    logStockMove(batch, {productId: targetId, qty: line.qty, type: original?'purchase-edit-apply':'purchase', refType:'purchase', refId: purId, date});
  }
  if(original) original.items.forEach(it=>logStockMove(batch, {productId: it.productId, qty: -it.qty, type:'purchase-edit-revert', refType:'purchase', refId: purId, date: original.date}));

  /* স্টকের পাশাপাশি "গড় ক্রয়মূল্য" (Weighted Average Cost) হালনাগাদ হয় — এখন ল্যান্ডেড মূল্যে
     (পণ্যের দাম + লোডিং/পরিবহন/প্যাকিংয়ের ভাগ):
     নতুন গড় = (আগের স্টক-মান − বাতিল হওয়া অংশ + নতুন ক্রয়ের ল্যান্ডেড মান) ÷ নতুন স্টক।
     স্টক বাড়ানো/কমানো increment দিয়ে — তাই একসাথে একাধিক ডিভাইসে এন্ট্রি দিলেও গোলমাল হয় না। */
  Object.keys(netQtyChange).forEach(pid=>{
    const p = DB.products.find(x=>x.id==pid); if(!p) return;
    const upd = {}, net = netQtyChange[pid], add = costAdds[pid], oc = origCost[pid];
    if(net!==0) upd.stock = _inc(net);
    if(add || oc){
      const finalStock = p.stock + net;
      const value = Math.max(0,p.stock)*(p.buyPrice||0) - (oc?oc.value:0) + (add?add.value:0);
      if(finalStock>0 && value>0) upd.buyPrice = Math.round(value/finalStock*100)/100;
      else if(add) upd.buyPrice = Math.round(add.lastPrice*100)/100;
    }
    if(add && add.sell>0 && add.sell!==p.sellPrice){
      upd.sellPrice = add.sell;
      logAudit('ক্রয়ের সময় বিক্রয়মূল্য পরিবর্তন', `${p.name}: ${money(p.sellPrice)} → ${money(add.sell)}`);
    }
    if(Object.keys(upd).length) batch.update(fsDB.collection('erp_products').doc(String(pid)), upd);
  });

  const goodsTotal = r2(resolvedItems.reduce((s,it)=>s+it.price*it.qty,0));
  const total = r2(goodsTotal + sp.bill);     // সাপ্লায়ারের কাছে মোট দেনা (পণ্য + বিলে-যুক্ত খরচ)
  const paid = Math.min(paidRaw, total);      // বেশি দিলে বাড়তি অংশ ফেরত — due কখনো ঋণাত্মক হবে না
  const changeGiven = Math.max(0, paidRaw - total);
  const due = r2(total - paid);

  // ---- সাপ্লায়ার বাকি: পুরনো সাপ্লায়ার থেকে রিভার্স (যদি থাকে), নতুনে প্রয়োগ (increment) ----
  if(original && original.supplierId===supId){
    batch.update(fsDB.collection('erp_suppliers').doc(String(supId)), {due: _inc(due - original.due)});
  } else {
    if(original){
      const oldSup = DB.suppliers.find(c=>c.id===original.supplierId);
      if(oldSup) batch.update(fsDB.collection('erp_suppliers').doc(String(original.supplierId)), {due: _inc(-original.due)});
    }
    batch.update(fsDB.collection('erp_suppliers').doc(String(supId)), {due: _inc(due)});
  }

  batch.set(fsDB.collection('erp_purchases').doc(String(purId)), {
    id:purId, date, supplierId:supId, supplierName: sup.name, items: resolvedItems, total, goodsTotal, paid, due, changeGiven,
    extras, extraBill:sp.bill, extraCash:sp.cash, allocBy:purchaseAllocBy,
    createdBy: original?original.createdBy:(currentUser?currentUser.name:''),
    createdByUsername: original?original.createdByUsername:(currentUser?currentUser.username:''),
    ...(original?{editedBy: currentUser?currentUser.name:'', editedAt: new Date().toISOString()}:{})
  });

  const oExtra = original ? (original.extraCash||0) : 0;
  if(original && original.date===date){
    applyStatsDelta(batch, date, {totalPurchase: total-original.total, totalPurchaseExtra: sp.cash-oExtra});
  } else {
    if(original) applyStatsDelta(batch, original.date, {totalPurchase:-original.total, totalPurchaseExtra:-oExtra, purchaseCount:-1});
    applyStatsDelta(batch, date, {totalPurchase: total, totalPurchaseExtra: sp.cash, purchaseCount: 1});
  }

  if(original) logAudit('ক্রয় এন্ট্রি এডিট', `${refNo('PUR', purId)} — ${money(original.total)} → ${money(total)}`);
  closeModal();
  fireWrite(batch.commit(), original?'ক্রয় এডিট':'ক্রয় এন্ট্রি');
  editingPurchaseId = null;
}
function deletePurchase(id){
  const pur = currentPurchaseRows().find(x=>x.id===id);
  if(!pur) return;
  if(pur.returnedTotal>0){ alert('এই ভাউচারে পণ্য ফেরত দেওয়া হয়েছে — তাই মোছা যায় না (স্টক দু-বার কমে যেত)।'); return; }
  if(!confirm('এই ক্রয় এন্ট্রি মুছে ফেলতে চান? (স্টক থেকে বাদ যাবে)')) return;
  const batch = fsDB.batch();
  pur.items.forEach(it=>{
    const p = DB.products.find(x=>x.id===it.productId);
    if(p) batch.update(fsDB.collection('erp_products').doc(String(it.productId)), {stock: _inc(-it.qty)});
    logStockMove(batch, {productId: it.productId, qty: -it.qty, type:'purchase-void', refType:'purchase', refId: id, date: pur.date});
  });
  const sup = DB.suppliers.find(c=>c.id===pur.supplierId);
  if(sup) batch.update(fsDB.collection('erp_suppliers').doc(String(pur.supplierId)), {due: _inc(-pur.due)});
  batch.delete(fsDB.collection('erp_purchases').doc(String(id)));
  applyStatsDelta(batch, pur.date, {totalPurchase: -pur.total, totalPurchaseExtra: -(pur.extraCash||0), purchaseCount: -1});
  logAudit('ক্রয় এন্ট্রি মোছা', refNo('PUR', id) + ' — ' + money(pur.total));
  fireWrite(batch.commit(), 'ক্রয় মোছা');
}

/* ================= বিক্রয় =================
   বিক্রয় তালিকা, বিস্তারিত, এন্ট্রি/এডিট, ডিসকাউন্ট, ডিলিট, এবং
   কাস্টমার/সাপ্লায়ার কুইক-অ্যাড (sale ও purchase দুই ফর্মেই ব্যবহৃত)। */

/* ================= SALES ================= */
let rangeSalesRows = null; // null মানে "আজকের" লাইভ ডেটা দেখানো হচ্ছে; অ্যারে থাকলে মানে কাস্টম তারিখ-রেঞ্জ লোড করা আছে
function currentSalesRows(){ return rangeSalesRows || DB.sales; }
function renderSales(){
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar">
      <div><h2>বিক্রয় হিসাব</h2><div class="sub">ডিফল্টভাবে আজকের বিক্রয় দেখাচ্ছে (রিয়েল-টাইম) — যেকোনো পেজ থেকে F2 চাপলেই নতুন বিক্রয় খুলবে</div></div>
      <button class="btn btn-gold" onclick="openSaleModal()">+ নতুন বিক্রয় যোগ করুন (F2)</button>
    </div>
    <div class="toolbar">
      <input type="date" id="saleFrom" value="${todayStr()}" onchange="renderSalesTable()">
      <span style="color:var(--muted);font-size:12px;">থেকে</span>
      <input type="date" id="saleTo" value="${todayStr()}" onchange="renderSalesTable()">
      <button class="btn btn-outline small-btn" onclick="document.getElementById('saleFrom').value='';document.getElementById('saleTo').value='';renderSalesTable();">সব সময়</button>
      <select id="saleViewMode" onchange="renderSalesTable()">
        <option value="invoice">ভিউ: ইনভয়েস-ভিত্তিক</option>
        <option value="items">ভিউ: পণ্য-ভিত্তিক রিপোর্ট</option>
      </select>
      <div class="spacer"></div>
      <span style="color:var(--muted);font-size:12.5px;" id="saleCountLbl"></span>
    </div>
    <div class="card"><div class="tbl-wrap" id="salesTableWrap"></div></div>
    <div class="card" style="margin-top:16px;" id="saleUserBreakdownCard"></div>
  `;
  rangeSalesRows = null;
  renderSalesTable();
}
/* কে কত টাকার বিক্রয়/ক্রয় করলো — বর্তমানে স্ক্রিনে দেখানো তারিখ-রেঞ্জ অনুযায়ী
   (পুরো ইতিহাস স্ক্যান না করে, তাই পারফরম্যান্সে প্রভাব পড়ে না) */
function renderUserBreakdownCard(rows, elId, label){
  const el = document.getElementById(elId);
  if(!el) return;
  const byUser = {};
  rows.forEach(r=>{
    const name = r.createdBy || 'অজানা';
    if(!byUser[name]) byUser[name] = {count:0, total:0};
    byUser[name].count++; byUser[name].total += r.total;
  });
  const names = Object.keys(byUser).sort((a,b)=>byUser[b].total-byUser[a].total);
  el.innerHTML = `
    <h3>👤 ইউজার-ভিত্তিক ${label} (এই তালিকায় দেখানো রেঞ্জ অনুযায়ী)</h3>
    <div class="tbl-wrap"><table>
      <tr><th>ইউজার</th><th class="num">এন্ট্রি সংখ্যা</th><th class="num">মোট টাকা</th></tr>
      ${names.map(n=>`<tr><td>${esc(n)}</td><td class="num">${byUser[n].count}</td><td class="num">${money(byUser[n].total)}</td></tr>`).join('')
        || `<tr><td colspan="3" style="text-align:center;color:var(--muted);">কোনো ডেটা নেই</td></tr>`}
    </table></div>
  `;
}
async function renderSalesTable(){
  const from = document.getElementById('saleFrom')?.value;
  const to = document.getElementById('saleTo')?.value;
  const isToday = from===todayStr() && to===todayStr();
  let truncated = false;
  if(isToday){
    rangeSalesRows = null; // লাইভ আজকের ডেটা ব্যবহার হবে
  } else {
    document.getElementById('salesTableWrap').innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted);">লোড হচ্ছে...</div>`;
    const res = await loadSalesRange(from||null, to||null);
    if(document.getElementById('saleFrom')===null) return; // ততক্ষণে অন্য পেজে চলে গেলে থামুন
    rangeSalesRows = res.rows; truncated = res.truncated;
  }
  const rows = [...currentSalesRows()].sort((a,b)=>b.id-a.id);
  const countLbl = document.getElementById('saleCountLbl');
  if(countLbl) countLbl.textContent = `দেখানো হচ্ছে: ${rows.length} টি` + (truncated?` (সাম্প্রতিক সর্বোচ্চ ${RANGE_LOAD_LIMIT}টি — তারিখ রেঞ্জ ছোট করে আরও নির্দিষ্টভাবে দেখুন)`:'');
  const viewMode = document.getElementById('saleViewMode')?.value||'invoice';
  if(viewMode==='items'){ renderSalesItemReport(rows); renderUserBreakdownCard(rows, 'saleUserBreakdownCard', 'বিক্রয়'); return; }
  const totalAmt = rows.reduce((s,x)=>s+x.total,0);
  document.getElementById('salesTableWrap').innerHTML = `
    <table>
      <tr><th>#</th><th>তারিখ</th><th>কাস্টমার</th><th class="num">মোট</th><th class="num">জমা</th><th class="num">বাকি</th><th>স্ট্যাটাস</th><th></th></tr>
      ${rows.map(s=>`
        <tr>
          <td>${voucherLink('INV', s)}</td><td>${fmtDate(s.date)}</td><td>${esc(s.customerName)}</td>
          <td class="num">${money(s.total)}</td><td class="num">${money(s.paid)}</td><td class="num">${money(s.due)}</td>
          <td>${s.due<=0?'<span class="pill ok">পরিশোধিত</span>':'<span class="pill warn">বাকি আছে</span>'}${s.returnedTotal>0?' <span class="pill warn">↩️ ফেরত</span>':''}</td>
          <td><button class="icon-btn" onclick="viewSaleDetail(${s.id})" title="বিস্তারিত">👁️</button>
              <button class="icon-btn" onclick="printInvoice(${s.id})" title="প্রিন্ট">🖨️</button>
              <button class="icon-btn" onclick="shareInvoice(${s.id})" title="ছবি শেয়ার">📤</button>
              ${canEditVoucher(s)?`<button class="icon-btn" onclick="openReturnModal(${s.id})" title="পণ্য ফেরত">↩️</button>`:''}
              ${s.due>0?`<button class="icon-btn" onclick="openInvoicePaymentModal('sale',${s.id})" title="বাকি পরিশোধ">💳</button>`:''}
              ${hasAccess('manager')?`<button class="icon-btn" onclick="deleteSale(${s.id})" title="মুছুন">🗑️</button>`:''}</td>
        </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);">কোনো বিক্রয় নেই</td></tr>`}
      <tr><td colspan="3" class="foot-total">সর্বমোট</td><td class="foot-total num">${money(totalAmt)}</td><td colspan="4"></td></tr>
    </table>
  `;
  renderUserBreakdownCard(rows, 'saleUserBreakdownCard', 'বিক্রয়');
}
/* "পণ্য-ভিত্তিক রিপোর্ট" ভিউ — প্রতিটা ইনভয়েসের প্রতিটা পণ্য-লাইন আলাদা সারি হিসেবে
   দেখায়: তারিখ, পণ্য, পরিমাণ, দর, মোট, লাভ, পার্টি, এন্ট্রি করেছেন, অ্যাকশন।
   পুরনো এন্ট্রিতে প্রতি-লাইন ক্রয়মূল্য (buyPrice) সংরক্ষিত না থাকলে বর্তমান পণ্যের
   ক্রয়মূল্য দিয়ে আনুমানিক লাভ হিসাব করা হয় (সামনে ~ চিহ্ন দিয়ে বোঝানো থাকে)। */
function renderSalesItemReport(rows){
  const lines = [];
  rows.forEach(s=>{
    s.items.forEach(it=>{
      const p = DB.products.find(pp=>pp.id===it.productId);
      const buyPrice = (it.buyPrice!=null) ? it.buyPrice : (p?p.buyPrice:null);
      const approx = it.buyPrice==null;
      const profit = buyPrice!=null ? (it.price-buyPrice)*it.qty : null;
      lines.push({sale:s, productName:p?p.name:'পণ্য মুছে ফেলা হয়েছে', unit:p?p.unit:'', qty:it.qty, price:it.price, profit, approx, qtyCell: it.dispUnit?`${it.dispQty} ${it.dispUnit}`:String(it.qty), rateCell: itemRateText(it)});
    });
  });
  const totalLineAmt = lines.reduce((s,l)=>s+l.price*l.qty,0);
  const totalProfit = lines.reduce((s,l)=>s+(l.profit||0),0);
  document.getElementById('salesTableWrap').innerHTML = `
    <table>
      <tr><th>তারিখ</th><th>পণ্য</th><th class="num">পরিমাণ</th><th class="num">দর</th><th class="num">মোট</th><th class="num">লাভ</th><th>পার্টি</th><th>এন্ট্রি করেছেন</th><th>অ্যাকশন</th></tr>
      ${lines.map(l=>`
        <tr>
          <td>${fmtDate(l.sale.date)}</td><td>${esc(l.productName)} ${esc(l.unit)}</td>
          <td class="num">${esc(l.qtyCell)}</td><td class="num">${esc(l.rateCell)}</td><td class="num">${money(r2(l.price*l.qty))}</td>
          <td class="num" style="color:${l.profit==null?'var(--muted)':(l.profit>=0?'var(--success)':'var(--danger-text)')}">${l.profit==null?'-':(l.approx?'~':'')+money(l.profit)}</td>
          <td>${esc(l.sale.customerName)}</td><td>${esc(l.sale.createdBy||'-')}</td>
          <td><button class="icon-btn" onclick="viewSaleDetail(${l.sale.id})" title="বিস্তারিত">👁️</button>
              <button class="icon-btn" onclick="printInvoice(${l.sale.id})" title="প্রিন্ট">🖨️</button>
              <button class="icon-btn" onclick="shareInvoice(${l.sale.id})" title="ছবি শেয়ার">📤</button>
              ${l.sale.due>0?`<button class="icon-btn" onclick="openInvoicePaymentModal('sale',${l.sale.id})" title="বাকি পরিশোধ">💳</button>`:''}
              ${hasAccess('manager')?`<button class="icon-btn" onclick="deleteSale(${l.sale.id})" title="মুছুন">🗑️</button>`:''}</td>
        </tr>`).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--muted);">কোনো বিক্রয় নেই</td></tr>`}
      <tr><td colspan="4" class="foot-total">সর্বমোট (ডিসকাউন্টের আগে)</td><td class="foot-total num">${money(totalLineAmt)}</td><td class="foot-total num">${money(totalProfit)}</td><td colspan="3"></td></tr>
    </table>
  `;
}
/* বিক্রয়ের বিস্তারিত (কোন পণ্য কত পরিমাণ, কত দরে বিক্রি হলো) — ক্লিয়ার দেখতে */
function viewSaleDetail(id){
  const s = currentSalesRows().find(x=>x.id===id);
  if(!s) return;
  const rows = s.items.map(it=>{
    const p = DB.products.find(pp=>pp.id===it.productId);
    return `<tr><td>${esc(p?p.name:'পণ্য মুছে ফেলা হয়েছে')}</td><td class="num">${esc(itemQtyText(it,p))}</td><td class="num">${esc(itemRateText(it))}</td><td class="num">${money(r2(it.price*it.qty))}</td></tr>`;
  }).join('');
  openModal(`
    <h3>বিক্রয় বিস্তারিত — ${refNo('INV', s.id)}</h3>
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">তারিখ: ${fmtDate(s.date)} • কাস্টমার: ${esc(s.customerName)}${s.createdBy?' • এন্ট্রি করেছেন: '+esc(s.createdBy):''}${s.editedBy?' • সর্বশেষ এডিট: '+esc(s.editedBy):''}</div>
    <div class="tbl-wrap"><table>
      <tr><th>পণ্য</th><th class="num">পরিমাণ</th><th class="num">দর</th><th class="num">সাবটোটাল</th></tr>
      ${rows}
      ${s.discount ? `<tr><td colspan="3">সাবটোটাল</td><td class="num">${money(s.subtotal||(s.total+s.discount))}</td></tr>
      <tr><td colspan="3" style="color:var(--danger-text);">ডিসকাউন্ট ${s.discountPercent?`(${s.discountPercent}%)`:''}</td><td class="num" style="color:var(--danger-text);">-${money(s.discount)}</td></tr>` : ''}
      <tr><td colspan="3" class="foot-total">সর্বমোট</td><td class="foot-total num">${money(s.total)}</td></tr>
      ${s.changeGiven
        ? `<tr><td colspan="3">গ্রাহক দিয়েছেন</td><td class="num">${money(r2(s.paid+s.changeGiven))}</td></tr>
           <tr><td colspan="3" style="color:var(--success);">ফেরত দেওয়া হয়েছে</td><td class="num" style="color:var(--success);">${money(s.changeGiven)}</td></tr>`
        : `<tr><td colspan="3">জমা</td><td class="num">${money(s.paid)}</td></tr>`}
      ${s.returnedTotal>0?`<tr><td colspan="3" style="color:var(--warn-text);">↩️ বিক্রয় ফেরত (${Object.keys(s.retQty||{}).map(pid=>{ const p = DB.products.find(x=>x.id==pid); return esc((p?p.name:'পণ্য')+' '+s.retQty[pid]+' '+(p?p.unit:'')); }).join(', ')})</td><td class="num" style="color:var(--warn-text);">-${money(s.returnedTotal)}</td></tr>
        ${s.refundedCash>0?`<tr><td colspan="3">নগদ ফেরত দেওয়া হয়েছে</td><td class="num">${money(s.refundedCash)}</td></tr>`:''}
        <tr><td colspan="3"><b>ফেরতের পর নীট বিক্রয়</b></td><td class="num"><b>${money(r2(s.total-s.returnedTotal))}</b></td></tr>`:''}
      <tr><td colspan="3"><b>বাকি</b></td><td class="num"><b>${money(s.due)}</b></td></tr>
    </table></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
      ${canEditVoucher(s)?`<button class="btn btn-outline" onclick="openReturnModal(${s.id})">↩️ পণ্য ফেরত</button>`:''}
      ${s.due>0?`<button class="btn btn-outline" onclick="openInvoicePaymentModal('sale',${s.id})">💳 বাকি পরিশোধ</button>`:''}
      ${(canEditVoucher(s) && !(s.returnedTotal>0))?`<button class="btn btn-outline" onclick="openSaleModal(${s.id})">✏️ এডিট করুন</button>`:''}
      <button class="btn btn-outline" onclick="shareInvoice(${s.id})">📤 শেয়ার</button>
      <button class="btn btn-gold" onclick="printInvoice(${s.id})">🖨️ প্রিন্ট করুন</button>
    </div>
  `);
}
/* ================= দ্রুত নতুন কাস্টমার/সাপ্লায়ার যোগ (ফর্মের ভেতর থেকেই) =================
   বিক্রয়/ক্রয় ফর্ম ছেড়ে আলাদা পেজে না গিয়ে, এখানেই "+" চেপে একটা ছোট্ট ইনলাইন
   ফর্ম খুলে সাথে সাথেই নতুন কাস্টমার/সাপ্লায়ার যোগ ও বাছাই করা যায় — মূল ফর্মের
   বাকি তথ্য (পণ্য/পরিমাণ ইত্যাদি) অক্ষত থাকে, যেহেতু এটা একই মডালের ভেতরেই ঘটে। */
function toggleQuickAddParty(kind){
  const box = document.getElementById(kind==='sale'?'sf_quickAddBox':'pf_quickAddBox');
  if(!box) return;
  box.classList.toggle('hidden');
  if(!box.classList.contains('hidden')){
    const nameEl = document.getElementById(kind==='sale'?'sf_newCustName':'pf_newSupName');
    setTimeout(()=>nameEl?.focus(), 0);
  }
}
function quickAddParty(kind){
  const isSale = kind==='sale';
  const nameEl = document.getElementById(isSale?'sf_newCustName':'pf_newSupName');
  const phoneEl = document.getElementById(isSale?'sf_newCustPhone':'pf_newSupPhone');
  const name = nameEl.value.trim();
  if(!name){ alert('নাম লিখুন'); return; }
  const phone = phoneEl.value.trim();
  const newId = genId();
  const rec = {id:newId, name, phone, due:0};
  const coll = isSale?'erp_customers':'erp_suppliers';
  (isSale?DB.customers:DB.suppliers).push(rec);
  fireWrite(fsDB.collection(coll).doc(String(newId)).set(rec), isSale?'নতুন কাস্টমার':'নতুন সাপ্লায়ার');
  const selectEl = document.getElementById(isSale?'sf_customer':'pf2_supplier');
  if(selectEl){
    const opt = document.createElement('option');
    opt.value = newId; opt.textContent = name;
    selectEl.appendChild(opt);
    selectEl.value = String(newId);
  }
  nameEl.value=''; phoneEl.value='';
  toggleQuickAddParty(kind);
}

let saleCart = [];
let editingSaleId = null; // null = নতুন এন্ট্রি; নাহলে এই আইডির বিক্রয়টা এডিট হচ্ছে
function openSaleModal(editId){
  let existing = null;
  if(editId){
    existing = currentSalesRows().find(x=>x.id===editId);
    if(existing && existing.returnedTotal>0){ alert('এই ভাউচারে পণ্য ফেরত নেওয়া হয়েছে — তাই এডিট করা যায় না। প্রয়োজনে নতুন বিক্রয়/ফেরত এন্ট্রি দিন।'); return; }
    if(!existing){ alert('এই এন্ট্রি বর্তমান তালিকায় লোড নেই — তারিখ রেঞ্জ "আজ" করে বা সেই তারিখ বেছে আবার চেষ্টা করুন।'); return; }
    if(!canEditVoucher(existing)){ alert('আপনি শুধু নিজের তৈরি করা এন্ট্রি এডিট করতে পারবেন (ম্যানেজার/এডমিন সবগুলো করতে পারবেন)।'); return; }
  }
  editingSaleId = editId || null;
  saleCart = existing ? existing.items.map(it=>({productId:it.productId, qty:it.qty, ...(it.dispUnit?{dispQty:it.dispQty,dispUnit:it.dispUnit,dispPrice:it.dispPrice}:{})})) : [];
  entryReset('sale');
  openModal(`
    <div class="entry-head"><h3>${existing?`বিক্রয় এডিট করুন — ${refNo('INV', existing.id)}`:'🧾 নতুন বিক্রয় এন্ট্রি'}</h3></div>
    <div class="entry-body">
    ${existing?`<div style="font-size:11.5px;color:var(--amber-2);margin-bottom:8px;">⚠️ এডিট করলে বর্তমান বিক্রয়মূল্য অনুযায়ী পুনঃগণনা হবে (মূল্য পরিবর্তিত হয়ে থাকলে টোটাল বদলে যেতে পারে)।</div>`:''}
    <div class="form-row">
      <div><label>তারিখ</label><input id="sf_date" type="date" value="${existing?existing.date:todayStr()}"></div>
      <div><label>কাস্টমার</label>
        <div style="display:flex;gap:6px;">
          <select id="sf_customer" style="flex:1;min-width:0;">${(existing && !DB.customers.find(c=>c.id===existing.customerId)) ? `<option value="${existing.customerId}" selected>⚠ ${esc(existing.customerName)} (মুছে ফেলা)</option>` : ''}${DB.customers.map(c=>`<option value="${c.id}" ${existing&&existing.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
          <button type="button" class="btn btn-outline small-btn" style="flex:0 0 auto;" onclick="toggleQuickAddParty('sale')" title="নতুন কাস্টমার যোগ করুন">+</button>
        </div>
        <div id="sf_quickAddBox" class="hidden" style="margin-top:8px;padding:9px;border:1px dashed var(--line);border-radius:8px;">
          <div class="form-row" style="margin-bottom:8px;">
            <input type="text" id="sf_newCustName" placeholder="কাস্টমারের নাম">
            <input type="text" id="sf_newCustPhone" placeholder="মোবাইল নম্বর (ঐচ্ছিক)">
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button type="button" class="btn btn-outline small-btn" onclick="toggleQuickAddParty('sale')">বাতিল</button>
            <button type="button" class="btn btn-gold small-btn" onclick="quickAddParty('sale')">যোগ করুন</button>
          </div>
        </div>
      </div>
    </div>
    <div class="entry-bar">
      <div class="eb-prod">
        <label>পণ্য (নাম লিখুন → ↑↓ দিয়ে বাছাই → Enter)</label>
        <input type="text" id="saleEntProd" autocomplete="off" placeholder="🔍 পণ্যের নাম লিখে খুঁজুন..."
          oninput="entryTyped('sale')" onkeydown="entryKeydown(event,'sale')" onfocus="this.select();entryOpenList('sale')" onclick="entryOpenList('sale')"
          onblur="setTimeout(()=>entryHideSugg('sale'),200)">
        <div class="sugg-box hidden" id="saleEntSugg"></div>
      </div>
      <div class="eb-info" id="saleEntInfo"></div>
      <div class="eb-row">
        <div class="il-field"><label>পরিমাণ</label><div class="qty-unit"><input class="il-qty" type="number" inputmode="decimal" min="0" step="any" id="saleEntQty" placeholder="১"
          oninput="entryUpdateSub('sale')" onkeydown="entryQtyKeydown(event,'sale')" onfocus="this.select()"><select class="il-unit hidden" id="saleEntUnit" onchange="entryUnitChanged('sale')"></select></div></div>
        <div class="il-field"><label>দর</label><input class="il-price" readonly id="saleEntPrice" tabindex="-1"></div>
        <div class="il-field il-sub-field"><label>সাবটোটাল</label><input class="il-subtotal" readonly id="saleEntSub" tabindex="-1"></div>
        <button type="button" class="btn btn-gold eb-add" onclick="entryAdd('sale')">➕ যোগ (Enter)</button>
      </div>
      <div class="eb-msg" id="saleEntMsg"></div>
    </div>
    <div class="cart-list" id="saleItemsBox"></div>
    <div class="sum-compact">
      <div class="sum-line"><span>সাবটোটাল</span><b id="sf_subtotal">৳0</b></div>
      <div class="sum-inputs">
        <div><label>ডিসকাউন্ট %</label><input id="sf_discPct" type="number" inputmode="decimal" min="0" max="100" value="${existing?existing.discountPercent||0:0}" oninput="calcSaleTotal('pct')" onfocus="this.select()"></div>
        <div><label>ডিসকাউন্ট ৳</label><input id="sf_discAmt" type="number" inputmode="decimal" min="0" value="${existing?existing.discount||0:0}" oninput="calcSaleTotal('amt')" onfocus="this.select()"></div>
        <div><label>জমা ৳ (Enter=সেভ)</label><input id="sf_paid" type="number" inputmode="decimal" value="${existing?r2(existing.paid+(existing.changeGiven||0)):0}" oninput="calcSaleTotal()" onfocus="this.select()" onkeydown="if(event.key==='Enter'){event.preventDefault();saveSale();}"></div>
      </div>
    </div>
    </div>
    <div class="entry-foot">
      <div class="foot-sum">
        <div class="fs-total"><span>মোট</span><b id="sf_total">৳0</b></div>
        <div class="fs-sub"><span>বাকি <b id="sf_due">৳0</b></span><span id="sf_changeRow" class="fs-change hidden">💵 ফেরত দিন <b id="sf_change">৳0</b></span></div>
      </div>
      <div class="foot-btns">
        <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
        <button class="btn btn-gold" id="modalSaveBtn" onclick="saveSale()">${existing?'সংরক্ষণ':'💾 সংরক্ষণ'}</button>
      </div>
    </div>
  `);
  document.getElementById('modalBox').className='modal entry-modal sale-theme';
  renderSaleLines();
  calcSaleTotal();
  setTimeout(()=>document.getElementById('saleEntProd')?.focus(), 0);
}

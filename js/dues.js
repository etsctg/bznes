/* ================= বাকি / দেনা-পাওনা =================
   কাস্টমার পাওনা ও সাপ্লায়ার দেনা, পার্টি মোছা, এবং নির্দিষ্ট
   ভাউচার/ইনভয়েসের বাকি পরিশোধ (erp_due_payments)। */

/* ================= DUES ================= */
function deleteParty(type, id){
  const isC = type==='customer', list = isC ? DB.customers : DB.suppliers, p = list.find(x=>x.id===id); if(!p) return;
  const noun = isC ? 'কাস্টমার' : 'সাপ্লায়ার';
  if(list.length<=1){ alert(`কমপক্ষে একজন ${noun} রাখতে হবে (বিক্রয়/ক্রয় ফর্মে লাগে)। আগে নতুন একজন যোগ করুন।`); return; }
  if(Math.abs(p.due||0) > 0.005){ alert(`"${p.name}" এর বাকি ${money(p.due)} আছে — আগে বাকি মিটিয়ে নিন, তারপর মুছুন।`); return; }
  if(!confirm(`${noun} "${p.name}" কে মুছে ফেলবেন?\n(আগের ভাউচারগুলো থাকবে, সেখানে নাম লেখা থাকবে।)`)) return;
  fireWrite(fsDB.collection(isC?'erp_customers':'erp_suppliers').doc(String(id)).delete(), `${noun} মোছা`);
  logAudit(`${noun} মোছা`, p.name);
}
function renderDues(){
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar"><div><h2>বাকি / দেনা-পাওনা হিসাব</h2><div class="sub">কাস্টমার পাওনা ও সাপ্লায়ার দেনা</div></div></div>
    <div class="grid g2">
      <div class="card">
        <h3>👤 কাস্টমার পাওনা (আপনি পাবেন)</h3>
        <div class="toolbar"><button class="btn btn-outline small-btn" onclick="openPartyModal('customer')">+ নতুন কাস্টমার</button></div>
        <div class="tbl-wrap"><table>
          <tr><th>নাম</th><th>ফোন</th><th class="num">বাকি</th><th></th></tr>
          ${DB.customers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone||'-')}</td>
            <td class="num" style="color:${c.due>0?'var(--warn-text)':'var(--success)'}">${money(c.due||0)}</td>
            <td>${c.due>0?`<button class="btn btn-outline small-btn" onclick="openCollectDueModal('customer',${c.id})">জমা নিন</button>`:'<span class="pill ok">পরিশোধিত</span>'}${hasAccess('manager')?` <button class="icon-btn" onclick="deleteParty('customer',${c.id})" title="কাস্টমার মুছুন">🗑️</button>`:''}</td></tr>`).join('')}
        </table></div>
      </div>
      <div class="card">
        <h3>🏭 সাপ্লায়ার দেনা (আপনি দেবেন)</h3>
        <div class="toolbar"><button class="btn btn-outline small-btn" onclick="openPartyModal('supplier')">+ নতুন সাপ্লায়ার</button></div>
        <div class="tbl-wrap"><table>
          <tr><th>নাম</th><th>ফোন</th><th class="num">বাকি</th><th></th></tr>
          ${DB.suppliers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone||'-')}</td>
            <td class="num" style="color:${c.due>0?'var(--danger-text)':'var(--success)'}">${money(c.due||0)}</td>
            <td>${c.due>0?`<button class="btn btn-outline small-btn" onclick="openCollectDueModal('supplier',${c.id})">পরিশোধ করুন</button>`:'<span class="pill ok">পরিশোধিত</span>'}${hasAccess('manager')?` <button class="icon-btn" onclick="deleteParty('supplier',${c.id})" title="সাপ্লায়ার মুছুন">🗑️</button>`:''}</td></tr>`).join('')}
        </table></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h3>🧾 সাম্প্রতিক বাকি জমা/পরিশোধের রেকর্ড</h3>
      <div class="tbl-wrap" id="duePaymentsWrap"><div style="color:var(--muted);padding:14px;text-align:center;">লোড হচ্ছে...</div></div>
    </div>
  `;
  loadRecentDuePayments();
}
async function loadRecentDuePayments(){
  let rows = [];
  try{
    const snap = await fsDB.collection('erp_due_payments').orderBy('at','desc').limit(25).get();
    rows = snap.docs.map(d=>d.data());
  }catch(e){ console.warn('due payments লোড ব্যর্থ:', e); }
  if(currentPage!=='dues') return;
  document.getElementById('duePaymentsWrap').innerHTML = `
    <table>
      <tr><th>তারিখ</th><th>ধরন</th><th>নাম</th><th class="num">পরিমাণ</th><th class="num">নতুন বাকি</th><th>গ্রহণকারী</th><th></th></tr>
      ${rows.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${r.type==='customer'?'জমা নেওয়া':'পরিশোধ করা'}</td><td>${esc(r.partyName)}</td>
        <td class="num">${money(r.amount)}</td><td class="num">${money(r.dueAfter)}</td><td>${esc(r.by||'-')}</td>
        <td><button class="icon-btn" onclick='printDuePaymentReceipt(${attrJson(r)})' title="প্রিন্ট">🖨️</button><button class="icon-btn" onclick='shareDuePaymentReceipt(${attrJson(r)})' title="ছবি শেয়ার">📤</button></td></tr>`).join('')
        || `<tr><td colspan="7" style="text-align:center;color:var(--muted);">এখনো কোনো রেকর্ড নেই</td></tr>`}
    </table>
  `;
}
function openPartyModal(type){
  openModal(`
    <h3>${type==='customer'?'নতুন কাস্টমার':'নতুন সাপ্লায়ার'} যোগ করুন</h3>
    <div class="form-row full"><label>নাম</label><input id="party_name"></div>
    <div class="form-row full"><label>ফোন নম্বর</label><input id="party_phone"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" id="modalSaveBtn" onclick="saveParty('${type}')">সংরক্ষণ করুন</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('party_name')?.focus(), 0);
}
function saveParty(type){
  const name = document.getElementById('party_name').value.trim();
  if(!name){ alert('নাম দিন'); return; }
  const phone = document.getElementById('party_phone').value.trim();
  const coll = type==='customer' ? 'erp_customers' : 'erp_suppliers';
  const newId = genId();
  fireWrite(fsDB.collection(coll).doc(String(newId)).set({id:newId, name, phone, due:0}), 'নতুন '+(type==='customer'?'কাস্টমার':'সাপ্লায়ার'));
  closeModal();
}
/* বাকি জমা/পরিশোধ — একটা ছোট মোডাল, ডিফল্টভাবে পুরো বাকিটাই ভরা থাকে (চাইলে কমিয়ে
   আংশিক জমাও দেওয়া যায়)। সেভ করলেই বাকির অংক কমে যায় — পুরোটা দিলে ০ হয়ে যাবে। */
function openCollectDueModal(type, id){
  const list = type==='customer'?DB.customers:DB.suppliers;
  const p = list.find(x=>x.id===id);
  if(!p) return;
  openModal(`
    <h3>${esc(p.name)} — ${type==='customer'?'জমা নিন':'পরিশোধ করুন'}</h3>
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">বর্তমান বাকি: <b style="color:var(--gold-2);">${money(p.due)}</b></div>
    <div class="form-row full">
      <label>কত টাকা ${type==='customer'?'জমা নিচ্ছেন':'পরিশোধ করছেন'}</label>
      <input id="due_amt" type="number" value="${p.due}" max="${p.due}" onkeydown="if(event.key==='Enter'){event.preventDefault();saveCollectDue('${type}',${id});}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" id="modalSaveBtn" onclick="saveCollectDue('${type}',${id})">সংরক্ষণ করুন</button>
    </div>
  `);
  setTimeout(()=>{ const el=document.getElementById('due_amt'); el?.focus(); el?.select(); }, 0);
}
function saveCollectDue(type, id){
  const list = type==='customer'?DB.customers:DB.suppliers;
  const p = list.find(x=>x.id===id);
  const val = Number(document.getElementById('due_amt').value);
  if(!val || val<=0 || val>p.due){ alert('সঠিক পরিমাণ দিন (০ থেকে '+money(p.due)+' এর মধ্যে)'); return; }
  const coll = type==='customer'?'erp_customers':'erp_suppliers';
  const dueBefore = p.due, dueAfter = p.due - val;
  const payId = genId();
  const paymentRec = {
    id:payId, type, partyId:id, partyName:p.name, amount:val, dueBefore, dueAfter,
    date: todayStr(), at: new Date().toISOString(), by: currentUser?currentUser.name:''
  };
  const batch = fsDB.batch();
  batch.update(fsDB.collection(coll).doc(String(id)), {due: _inc(-val)});
  batch.set(fsDB.collection('erp_due_payments').doc(String(payId)), paymentRec);
  fireWrite(batch.commit(), 'বাকি আপডেট');
  showDuePaymentReceiptOption(paymentRec);
}
/* ================= নির্দিষ্ট ভাউচার/ইনভয়েসের বাকি পরিশোধ =================
   কোনো নির্দিষ্ট বিক্রয়/ক্রয় এন্ট্রিতে বাকি থাকলে, সেই এন্ট্রি থেকেই সরাসরি
   (💳 বাটনে চেপে) আংশিক/সম্পূর্ণ পরিশোধ করা যায় — কাস্টমার/সাপ্লায়ারের
   সামগ্রিক বাকির পাশাপাশি ওই নির্দিষ্ট ভাউচারের paid/due ফিল্ডও আপডেট হয়,
   তাই পরে আবার সেই ভাউচার দেখলে ঠিক কতটা পরিশোধ হয়েছে বোঝা যায়। */
function openInvoicePaymentModal(voucherType, id){
  const isSale = voucherType==='sale';
  const entry = isSale ? currentSalesRows().find(x=>x.id===id) : currentPurchaseRows().find(x=>x.id===id);
  if(!entry){ alert('এন্ট্রিটি বর্তমান তালিকায় পাওয়া যায়নি — তারিখ রেঞ্জ পরিবর্তন করে আবার চেষ্টা করুন।'); return; }
  if(entry.due<=0){ alert('এই ভাউচারে কোনো বাকি নেই।'); return; }
  const partyLabel = isSale ? entry.customerName : entry.supplierName;
  openModal(`
    <h3>${refNo(isSale?'INV':'PUR', entry.id)} — বাকি পরিশোধ</h3>
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">${esc(partyLabel)} • এই ভাউচারের বাকি: <b style="color:var(--gold-2);">${money(entry.due)}</b></div>
    <div class="form-row full">
      <label>কত টাকা ${isSale?'জমা নিচ্ছেন':'পরিশোধ করছেন'}</label>
      <input id="inv_pay_amt" type="number" value="${entry.due}" max="${entry.due}" onkeydown="if(event.key==='Enter'){event.preventDefault();saveInvoicePayment('${voucherType}',${id});}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" onclick="saveInvoicePayment('${voucherType}',${id})">সংরক্ষণ করুন</button>
    </div>
  `);
  setTimeout(()=>{ const el=document.getElementById('inv_pay_amt'); el?.focus(); el?.select(); }, 0);
}
function saveInvoicePayment(voucherType, id){
  const isSale = voucherType==='sale';
  const entry = isSale ? currentSalesRows().find(x=>x.id===id) : currentPurchaseRows().find(x=>x.id===id);
  if(!entry) return;
  const val = Number(document.getElementById('inv_pay_amt').value);
  if(!val || val<=0 || val>entry.due){ alert('সঠিক পরিমাণ দিন (০ থেকে '+money(entry.due)+' এর মধ্যে)'); return; }

  const partyId = isSale ? entry.customerId : entry.supplierId;
  const partyColl = isSale ? 'erp_customers' : 'erp_suppliers';
  const partyList = isSale ? DB.customers : DB.suppliers;
  const party = partyList.find(x=>x.id===partyId);
  const voucherColl = isSale ? 'erp_sales' : 'erp_purchases';

  const newPaid = entry.paid + val;
  const newDue = entry.due - val;
  const payId = genId();
  const voucherRef = refNo(isSale?'INV':'PUR', id);
  const paymentRec = {
    id:payId, type: isSale?'customer':'supplier', partyId, partyName: isSale?entry.customerName:entry.supplierName,
    amount:val, dueBefore: entry.due, dueAfter: newDue,
    voucherType, voucherId: id, voucherRef,
    date: todayStr(), at: new Date().toISOString(), by: currentUser?currentUser.name:''
  };

  const batch = fsDB.batch();
  batch.update(fsDB.collection(voucherColl).doc(String(id)), {paid:newPaid, due:newDue});
  if(party) batch.update(fsDB.collection(partyColl).doc(String(partyId)), {due: _inc(-val)});
  batch.set(fsDB.collection('erp_due_payments').doc(String(payId)), paymentRec);
  fireWrite(batch.commit(), 'ভাউচার বাকি পরিশোধ');
  logAudit('ভাউচার বাকি পরিশোধ', `${voucherRef} — ${money(val)}`);
  showDuePaymentReceiptOption(paymentRec);
}

/* বাকি জমা/পরিশোধের পর — চাইলে সাথে সাথেই একটা রশিদ প্রিন্ট করা যায় (বাধ্যতামূলক না,
   "প্রয়োজনে" প্রিন্ট করার অপশন)। পেমেন্টটা erp_due_payments এ রেকর্ড থাকে বলে
   ভবিষ্যতেও দরকার হলে হিসাব যাচাই করা সম্ভব। */
function showDuePaymentReceiptOption(rec){
  openModal(`
    <h3>✅ ${rec.type==='customer'?'জমা নেওয়া হয়েছে':'পরিশোধ করা হয়েছে'}</h3>
    <div style="font-size:14px;line-height:1.9;margin-bottom:10px;">
      <div><b>${esc(rec.partyName)}</b></div>
      <div>পরিমাণ: <b style="color:var(--teal-2);">${money(rec.amount)}</b></div>
      <div>আগের বাকি: ${money(rec.dueBefore)} → নতুন বাকি: <b>${money(rec.dueAfter)}</b></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
      <button class="btn btn-outline" onclick='shareDuePaymentReceipt(${attrJson(rec)})'>📤 শেয়ার</button>
      <button class="btn btn-gold" onclick='printDuePaymentReceipt(${attrJson(rec)})'>🖨️ রশিদ প্রিন্ট করুন</button>
    </div>
  `);
}

/* =================================================================
   ক্যাশবুক (নগদ হিসাব খাতা) — ঐতিহ্যবাহী "T" ফরম্যাট
   -----------------------------------------------------------------
   একপাশে প্রাপ্তি (নগদ জমা), অন্যপাশে পরিশোধ (নগদ খরচ) — একদম কাগজের
   ক্যাশবইয়ের মতো। প্রতিদিনের জন্য আলাদা পাতা (তারিখ বেছে দেখা যায়),
   শুরুর জের + প্রাপ্তি − পরিশোধ = সমাপনী জের।

   হিসাবের নিয়ম (খাতার ভাষায়):
   প্রাপ্তি (ডেবিট — ক্যাশ হাতে আসে)        পরিশোধ (ক্রেডিট — ক্যাশ হাতে থেকে যায়)
   ───────────────────────────────        ──────────────────────────────────
   • বিক্রয়ে নগদ জমা (sale.paid)           • ক্রয়ে নগদ পরিশোধ (purchase.paid)
   • কাস্টমারের কাছ থেকে বাকি আদায়          • সাপ্লায়ারকে বাকি পরিশোধ
   • —                                     • খরচ (এক্সপেন্স)
   • —                                     • বিক্রয় ফেরতে নগদ ফেরত দেওয়া

   বিঃদ্রঃ বিক্রয়ে কাস্টমার বেশি টাকা দিয়ে ফেরত (change) নিলে, সেটা
   sale.paid ফিল্ডেই নিট (কাটা বাদে) হিসাবে থাকে বলে এখানে আলাদা লাইন
   লাগে না — ডাবল-কাউন্ট হয় না।
   ================================================================= */
let cbDate = todayStr();
let cbData = null;

function prevDateStr(d){
  const dt = new Date(d+'T00:00:00'); dt.setDate(dt.getDate()-1);
  const z = n=>String(n).padStart(2,'0');
  return `${dt.getFullYear()}-${z(dt.getMonth()+1)}-${z(dt.getDate())}`;
}
function nextDateStr(d){
  const dt = new Date(d+'T00:00:00'); dt.setDate(dt.getDate()+1);
  const z = n=>String(n).padStart(2,'0');
  return `${dt.getFullYear()}-${z(dt.getMonth()+1)}-${z(dt.getDate())}`;
}

async function loadCashbookData(date){
  const [salesSnap, purchSnap, dueSnap, retSnap, openSnap, pretSnap] = await Promise.all([
    fsDB.collection('erp_sales').where('date','==',date).get(),
    fsDB.collection('erp_purchases').where('date','==',date).get(),
    fsDB.collection('erp_due_payments').where('date','==',date).get(),
    fsDB.collection('erp_returns').where('date','==',date).get(),
    fsDB.collection('erp_cash_opening').doc(date).get(),
    fsDB.collection('erp_purchase_returns').where('date','==',date).get().catch(()=>({docs:[]}))
  ]);
  return {
    sales: salesSnap.docs.map(d=>d.data()),
    purchases: purchSnap.docs.map(d=>d.data()),
    duePayments: dueSnap.docs.map(d=>d.data()),
    returns: retSnap.docs.map(d=>d.data()),
    purReturns: pretSnap.docs.map(d=>d.data()),
    expenses: DB.expenses.filter(e=>e.date===date),
    opening: openSnap.exists ? Number(openSnap.data().amount)||0 : null
  };
}
/* প্রতিটা লেনদেনকে প্রাপ্তি/পরিশোধ লাইনে রূপান্তর — এন্ট্রির id দিয়ে সময়ক্রম অনুমান করা হয় */
function cbLines(d){
  const inLines = [], outLines = [];
  d.sales.forEach(s=>{ if(s.paid>0) inLines.push({t:s.id, desc:`বিক্রয় ${refNo('INV',s.id)} — ${s.customerName}`, amount:s.paid}); });
  d.duePayments.filter(p=>p.type==='customer').forEach(p=>{ inLines.push({t:p.id, desc:`বাকি আদায় — ${p.partyName}${p.voucherRef?` (${p.voucherRef})`:''}`, amount:p.amount}); });
  d.purchases.forEach(p=>{ if(p.paid>0) outLines.push({t:p.id, desc:`ক্রয় ${refNo('PUR',p.id)} — ${p.supplierName}`, amount:p.paid}); });
  d.duePayments.filter(p=>p.type==='supplier').forEach(p=>{ outLines.push({t:p.id, desc:`বাকি পরিশোধ — ${p.partyName}${p.voucherRef?` (${p.voucherRef})`:''}`, amount:p.amount}); });
  d.expenses.forEach(e=>{ outLines.push({t:e.id, desc:`খরচ — ${e.category}${e.note?': '+e.note:''}`, amount:Number(e.amount)}); });
  d.purchases.forEach(p=>(p.extras||[]).filter(e=>!e.onBill).forEach((e,i)=>outLines.push({t:p.id+i/100, desc:`ক্রয়-সংশ্লিষ্ট খরচ — ${e.label||'অতিরিক্ত'}${e.note?': '+e.note:''} (${refNo('PUR',p.id)})`, amount:e.amount})));
  (d.purReturns||[]).forEach(r=>{ if(r.cashRefund>0) inLines.push({t:r.id, desc:`ক্রয় ফেরত নগদ — ${r.supplierName} (${r.purRef})`, amount:r.cashRefund}); });
  d.returns.forEach(r=>{ if(r.cashRefund>0) outLines.push({t:r.id, desc:`বিক্রয় ফেরত নগদ — ${r.customerName} (${r.saleRef})`, amount:r.cashRefund}); });
  inLines.sort((a,b)=>a.t-b.t); outLines.sort((a,b)=>a.t-b.t);
  return {inLines, outLines};
}
function cbTotals(d){
  const {inLines, outLines} = cbLines(d);
  return {inLines, outLines, inTotal: r2(inLines.reduce((s,l)=>s+l.amount,0)), outTotal: r2(outLines.reduce((s,l)=>s+l.amount,0))};
}

function renderCashbook(){
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar">
      <div><h2>📒 ক্যাশবুক</h2><div class="sub">দৈনিক নগদ হিসাব — একপাশে প্রাপ্তি, অন্যপাশে পরিশোধ (T-ছক)</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="shareCashbook()">📤 শেয়ার</button>
        <button class="btn btn-outline" onclick="printCashbook()">🖨️ প্রিন্ট</button>
      </div>
    </div>
    <div class="toolbar">
      <button class="btn btn-outline small-btn" onclick="cbShiftDay(-1)" title="আগের দিন">◀</button>
      <input type="date" id="cb_date" value="${cbDate}" onchange="cbDateChanged()">
      <button class="btn btn-outline small-btn" onclick="cbShiftDay(1)" title="পরের দিন">▶</button>
      <button class="btn btn-outline small-btn" onclick="cbGoToday()">আজ</button>
      <span style="color:var(--muted);font-size:12.5px;">${fmtDate(cbDate)}</span>
    </div>
    <div id="cbBody"><div style="padding:30px;text-align:center;color:var(--muted);">লোড হচ্ছে...</div></div>
  `;
  loadAndDrawCashbook();
}
function cbShiftDay(n){ cbDate = n<0 ? prevDateStr(cbDate) : nextDateStr(cbDate); renderCashbook(); }
function cbGoToday(){ cbDate = todayStr(); renderCashbook(); }
function cbDateChanged(){ cbDate = document.getElementById('cb_date').value || todayStr(); loadAndDrawCashbook(); }
async function loadAndDrawCashbook(){
  const host = document.getElementById('cbBody');
  const askedDate = cbDate;
  try{ cbData = await loadCashbookData(askedDate); }
  catch(err){
    if(host) host.innerHTML = `<div class="help-warn" style="font-size:13px;line-height:1.8;">⚠️ লোড করা যায়নি: ${esc(err.message||err)}<br>Firestore Rules-এ <b>erp_due_payments</b>, <b>erp_returns</b> ও <b>erp_cash_opening</b> এর অনুমতি আছে কিনা দেখুন (firestore.rules.txt)।</div>`;
    return;
  }
  if(cbDate !== askedDate || currentPage!=='cashbook') return;   // ততক্ষণে তারিখ/পেজ বদলে গেলে থামুন
  drawCashbook();
}
function drawCashbook(){
  const host = document.getElementById('cbBody'); if(!host || !cbData) return;
  const t = cbTotals(cbData);
  const opening = cbData.opening!=null ? cbData.opening : 0;
  const closing = r2(opening + t.inTotal - t.outTotal);
  host.innerHTML = `
    <div class="sum-compact" style="max-width:600px;">
      <div class="sum-line"><span>শুরুর জের (ওপেনিং ব্যালেন্স) ${hintIc('দিনের শুরুতে ক্যাশ হাতে কত ছিল। একবার সেভ করে রাখুন — তাহলে পরের দিন থেকে আর "গতকালের সমাপনী আনুন" চাপলেই চলে আসবে।')}</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input id="cb_opening" type="number" inputmode="decimal" value="${cbData.opening!=null?cbData.opening:''}" placeholder="০" style="flex:1;min-width:110px;padding:8px;border-radius:8px;background:var(--panel);border:1px solid var(--line);color:var(--ink);">
        <button class="btn btn-outline small-btn" onclick="saveCbOpening(true)">💾 সেভ</button>
        <button class="btn btn-outline small-btn" onclick="pullPrevClosing()">⬅️ গতকালের সমাপনী আনুন</button>
      </div>
      ${cbData.opening==null?`<div style="font-size:11px;color:var(--warn-text);margin-top:6px;">⚠️ এই দিনের শুরুর জের সেভ করা নেই — আপাতত ০ ধরে নিচের হিসাব দেখানো হচ্ছে।</div>`:''}
    </div>
    <div class="grid g2" style="margin-top:14px;align-items:start;">
      <div class="card">
        <h3 style="color:var(--success);">⬇️ প্রাপ্তি (জমা)</h3>
        <div class="tbl-wrap"><table>
          ${t.inLines.map(l=>`<tr><td>${esc(l.desc)}</td><td class="num">${money(l.amount)}</td></tr>`).join('') || `<tr><td style="text-align:center;color:var(--muted);">আজ কোনো প্রাপ্তি নেই</td></tr>`}
          <tr><td class="foot-total">মোট প্রাপ্তি</td><td class="foot-total num" style="color:var(--success);">${money(t.inTotal)}</td></tr>
        </table></div>
      </div>
      <div class="card">
        <h3 style="color:var(--danger-text);">⬆️ পরিশোধ (খরচ)</h3>
        <div class="tbl-wrap"><table>
          ${t.outLines.map(l=>`<tr><td>${esc(l.desc)}</td><td class="num">${money(l.amount)}</td></tr>`).join('') || `<tr><td style="text-align:center;color:var(--muted);">আজ কোনো পরিশোধ নেই</td></tr>`}
          <tr><td class="foot-total">মোট পরিশোধ</td><td class="foot-total num" style="color:var(--danger-text);">${money(t.outTotal)}</td></tr>
        </table></div>
      </div>
    </div>
    <div class="sum-compact" style="max-width:420px;margin-top:14px;">
      <div class="sum-line"><span>শুরুর জের</span><b>${money(opening)}</b></div>
      <div class="sum-line"><span>+ মোট প্রাপ্তি</span><b style="color:var(--success);">${money(t.inTotal)}</b></div>
      <div class="sum-line"><span>− মোট পরিশোধ</span><b style="color:var(--danger-text);">${money(t.outTotal)}</b></div>
      <div class="sum-line" style="border-top:1px dashed var(--line);padding-top:9px;"><span style="font-size:14.5px;"><b>সমাপনী জের (হাতে থাকার কথা)</b></span><b style="font-size:19px;">${money(closing)}</b></div>
    </div>
  `;
}
function saveCbOpening(manual){
  if(!cbData) return;
  const v = r2(Number(document.getElementById('cb_opening').value)||0);
  fireWrite(fsDB.collection('erp_cash_opening').doc(cbDate).set({amount:v, setBy:currentUser?currentUser.name:'', at:new Date().toISOString()}), 'ক্যাশ ওপেনিং ব্যালেন্স');
  cbData.opening = v;
  if(manual){ logAudit('ক্যাশ ওপেনিং ব্যালেন্স সেভ', `${cbDate}: ${money(v)}`); toast('✅ সংরক্ষণ হয়েছে'); }
  drawCashbook();
}
/* গতকালের শুরুর জের + প্রাপ্তি − পরিশোধ হিসাব করে আজকের শুরুর জের হিসেবে বসিয়ে দেয় — প্রতিদিন হাতে টাইপ করা লাগে না */
async function pullPrevClosing(){
  const prev = prevDateStr(cbDate);
  toast('⏳ গতকালের হিসাব আনা হচ্ছে...');
  let d;
  try{ d = await loadCashbookData(prev); }catch(err){ alert('গতকালের হিসাব আনা যায়নি: '+(err.message||err)); return; }
  if(d.opening==null){ alert(`${fmtDate(prev)}-এর শুরুর জেরও সেভ করা নেই, তাই চেইন করে সমাপনী বের করা যাচ্ছে না। ওই তারিখে গিয়ে আগে সেটা বসান, অথবা আজকেরটা হাতে লিখুন।`); return; }
  const t = cbTotals(d);
  const closing = r2(d.opening + t.inTotal - t.outTotal);
  document.getElementById('cb_opening').value = closing;
  saveCbOpening(false);
  toast(`✅ ${fmtDate(prev)}-এর সমাপনী জের (${money(closing)}) বসানো হলো`);
}

/* ---- প্রিন্ট (A4-তে পাশাপাশি দুই কলাম, থার্মালে একটার পর একটা) ---- */
function printCashbook(){
  if(!cbData){ toast('আগে পেজ লোড হতে দিন'); return; }
  const t = cbTotals(cbData);
  const opening = cbData.opening!=null ? cbData.opening : 0;
  const closing = r2(opening + t.inTotal - t.outTotal);
  const mode = paperMode(), pa = document.getElementById('printArea');
  setPageStyle(mode);
  const inRows = t.inLines.map(l=>`<tr><td>${esc(l.desc)}</td><td class="num">${money(l.amount)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">—</td></tr>';
  const outRows = t.outLines.map(l=>`<tr><td>${esc(l.desc)}</td><td class="num">${money(l.amount)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">—</td></tr>';
  if(mode==='a4'){
    pa.className = '';
    pa.innerHTML = `
      <div class="inv-head"><div>${shopHeaderHtml()}<div><b>ক্যাশবুক — ${fmtDate(cbDate)}</b></div></div>
        <div style="text-align:left;"><div><b>শুরুর জের:</b> ${money(opening)}</div><div><b>সমাপনী জের:</b> ${money(closing)}</div></div></div>
      <div style="display:flex;gap:18px;">
        <div style="flex:1;"><h4 style="margin-bottom:6px;">প্রাপ্তি</h4><table class="inv-table"><tr><th>বিবরণ</th><th class="num">টাকা</th></tr>${inRows}<tr><td><b>মোট</b></td><td class="num"><b>${money(t.inTotal)}</b></td></tr></table></div>
        <div style="flex:1;"><h4 style="margin-bottom:6px;">পরিশোধ</h4><table class="inv-table"><tr><th>বিবরণ</th><th class="num">টাকা</th></tr>${outRows}<tr><td><b>মোট</b></td><td class="num"><b>${money(t.outTotal)}</b></td></tr></table></div>
      </div>`;
  } else {
    pa.className = mode;
    pa.innerHTML = `
      <div class="rc-center">${shopHeaderHtml()}</div>
      <div class="rc-center rc-title">ক্যাশবুক — ${fmtDate(cbDate)}</div>
      <div class="rc-hr"></div>
      <div class="rc-row"><span>শুরুর জের</span><span>${money(opening)}</span></div>
      <div class="rc-hr"></div>
      <div><b>প্রাপ্তি</b></div>
      ${t.inLines.map(l=>`<div class="rc-row"><span>${esc(l.desc)}</span><span>${money(l.amount)}</span></div>`).join('') || '<div>—</div>'}
      <div class="rc-row rc-big"><span>মোট প্রাপ্তি</span><span>${money(t.inTotal)}</span></div>
      <div class="rc-hr"></div>
      <div><b>পরিশোধ</b></div>
      ${t.outLines.map(l=>`<div class="rc-row"><span>${esc(l.desc)}</span><span>${money(l.amount)}</span></div>`).join('') || '<div>—</div>'}
      <div class="rc-row rc-big"><span>মোট পরিশোধ</span><span>${money(t.outTotal)}</span></div>
      <div class="rc-hr"></div>
      <div class="rc-row rc-big"><span>সমাপনী জের</span><span>${money(closing)}</span></div>`;
  }
  window.print();
}
/* ---- ছবি করে শেয়ার (একই canvas-রেন্ডারার, যেটা ইনভয়েস/ভাউচারেও ব্যবহার হয়) ---- */
function buildCashbookModel(){
  const t = cbTotals(cbData);
  const opening = cbData.opening!=null ? cbData.opening : 0;
  const closing = r2(opening + t.inTotal - t.outTotal);
  const items = [{name:'── প্রাপ্তি ──', qty:'', rate:'', sub:''}];
  t.inLines.forEach(l=>items.push({name:esc(l.desc), qty:'', rate:'', sub:money(l.amount)}));
  items.push({name:'── পরিশোধ ──', qty:'', rate:'', sub:''});
  t.outLines.forEach(l=>items.push({name:esc(l.desc), qty:'', rate:'', sub:money(l.amount)}));
  return {title:`ক্যাশবুক — ${fmtDate(cbDate)}`, file:`cashbook-${cbDate}`,
    meta:[['তারিখ',fmtDate(cbDate)],['শুরুর জের',money(opening)]],
    items,
    totals:[{label:'মোট প্রাপ্তি', value:money(t.inTotal)},{label:'মোট পরিশোধ', value:money(t.outTotal)},{label:'সমাপনী জের', value:money(closing), bold:true}],
    footer: esc(DB.settings?.footer||'')};
}
function shareCashbook(){
  if(!cbData){ toast('আগে পেজ লোড হতে দিন'); return; }
  shareDoc(buildCashbookModel());
}

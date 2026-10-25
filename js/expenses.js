/* ================= খরচের হিসাব =================
   খাতভিত্তিক দৈনন্দিন খরচ — তারিখ ও খাত অনুযায়ী ফিল্টার। */

/* ================= EXPENSES ================= */
let expFilter = {from:null, to:null, cat:''};
const EXP_CATS = ['দোকান ভাড়া','বেতন','বিদ্যুৎ বিল','পরিবহন','মার্কেটিং','রক্ষণাবেক্ষণ','অন্যান্য'];
function renderExpenses(){
  if(expFilter.from===null){ expFilter.from = todayStr().slice(0,8)+'01'; expFilter.to = todayStr(); }
  const cats = [...new Set([...EXP_CATS, ...DB.expenses.map(e=>e.category)])];
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar">
      <div><h2>খরচের হিসাব</h2><div class="sub">দৈনন্দিন ব্যবসায়িক খরচ — তারিখ ও খাত অনুযায়ী দেখুন</div></div>
      <button class="btn btn-gold" onclick="openExpenseModal()">+ নতুন খরচ যোগ করুন</button>
    </div>
    <div class="toolbar">
      <input type="date" id="expFrom" value="${expFilter.from}" onchange="setExpFilter()"><span style="color:var(--muted);font-size:12px;">থেকে</span>
      <input type="date" id="expTo" value="${expFilter.to}" onchange="setExpFilter()">
      <select id="expCat" onchange="setExpFilter()"><option value="">সব খাত</option>${cats.map(c=>`<option ${expFilter.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <button class="btn btn-outline small-btn" onclick="expFilter.from='';expFilter.to='';expFilter.cat='';renderExpenses();">সব সময়</button>
      <button class="btn btn-outline small-btn" onclick="expFilter.from=todayStr().slice(0,8)+'01';expFilter.to=todayStr();renderExpenses();">এই মাস</button>
    </div>
    <div id="expSummary"></div>
    <div class="card"><div class="tbl-wrap" id="expenseTableWrap"></div></div>
  `;
  renderExpenseTable();
}
function setExpFilter(){
  expFilter.from = document.getElementById('expFrom').value; expFilter.to = document.getElementById('expTo').value; expFilter.cat = document.getElementById('expCat').value;
  renderExpenseTable();
}
function renderExpenseTable(){
  let rows = [...DB.expenses];
  if(expFilter.from) rows = rows.filter(e=>e.date>=expFilter.from);
  if(expFilter.to) rows = rows.filter(e=>e.date<=expFilter.to);
  if(expFilter.cat) rows = rows.filter(e=>e.category===expFilter.cat);
  rows.sort((a,b)=> (b.date||'').localeCompare(a.date||'') || b.id-a.id);
  const total = rows.reduce((s,x)=>s+Number(x.amount),0);
  const byCat = {}; rows.forEach(e=>{ byCat[e.category] = (byCat[e.category]||0) + Number(e.amount); });
  const catList = Object.keys(byCat).sort((a,b)=>byCat[b]-byCat[a]);
  const sum = document.getElementById('expSummary');
  if(sum) sum.innerHTML = `
    <div class="grid g3" style="margin-bottom:16px;">
      <div class="stat-card danger"><div class="lbl">মোট খরচ (এই ফিল্টারে)</div><div class="val">${money(total)}</div><div class="ic">💵</div></div>
      <div class="stat-card blue"><div class="lbl">এন্ট্রি সংখ্যা</div><div class="val">${rows.length}</div><div class="ic">🧾</div></div>
      <div class="stat-card amber"><div class="lbl">সবচেয়ে বেশি খরচের খাত</div><div class="val" style="font-size:17px;">${catList.length?esc(catList[0])+' • '+money(byCat[catList[0]]):'-'}</div><div class="ic">📊</div></div>
    </div>
    ${catList.length>1?`<div class="card" style="margin-bottom:16px;"><h3>খাতভিত্তিক খরচ</h3><div class="tbl-wrap"><table>
      <tr><th>খাত</th><th class="num">পরিমাণ</th><th class="num">শতাংশ</th></tr>
      ${catList.map(c=>`<tr><td>${esc(c)}</td><td class="num">${money(byCat[c])}</td><td class="num">${total?(byCat[c]/total*100).toFixed(1):0}%</td></tr>`).join('')}
    </table></div></div>`:''}`;
  document.getElementById('expenseTableWrap').innerHTML = `
    <table>
      <tr><th>তারিখ</th><th>খাত</th><th>বিবরণ</th><th class="num">পরিমাণ</th><th></th></tr>
      ${rows.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.note||'-')}</td>
        <td class="num">${money(e.amount)}</td><td>${hasAccess('manager')?`<button class="icon-btn" onclick="deleteExpense(${e.id})" title="মুছুন">🗑️</button>`:''}</td></tr>`).join('')
        || `<tr><td colspan="5" style="text-align:center;color:var(--muted);">এই ফিল্টারে কোনো খরচ নেই (উপরে "সব সময়" চেপে দেখুন)</td></tr>`}
      <tr><td colspan="3" class="foot-total">সর্বমোট</td><td class="foot-total num">${money(total)}</td><td></td></tr>
    </table>
  `;
}
function openExpenseModal(){
  openModal(`
    <h3>নতুন খরচ যোগ করুন</h3>
    <div class="form-row">
      <div><label>তারিখ</label><input id="ef_date" type="date" value="${todayStr()}"></div>
      <div><label>খাত</label>
        <select id="ef_cat">
          <option>দোকান ভাড়া</option><option>বেতন</option><option>বিদ্যুৎ বিল</option><option>পরিবহন</option>
          <option>মার্কেটিং</option><option>রক্ষণাবেক্ষণ</option><option>অন্যান্য</option>
        </select>
      </div>
    </div>
    <div class="form-row full"><label>পরিমাণ</label><input id="ef_amount" type="number" onkeydown="if(event.key==='Enter'){event.preventDefault();saveExpense();}"></div>
    <div class="form-row full"><label>বিবরণ (ঐচ্ছিক)</label><input id="ef_note"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" id="modalSaveBtn" onclick="saveExpense()">সংরক্ষণ করুন</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('ef_amount')?.focus(), 0);
}
function saveExpense(){
  const amount = Number(document.getElementById('ef_amount').value);
  if(!amount || amount<=0){ alert('সঠিক পরিমাণ দিন'); return; }
  const newId = genId();
  const date = document.getElementById('ef_date').value||todayStr();
  const batch = fsDB.batch();
  batch.set(fsDB.collection('erp_expenses').doc(String(newId)), {
    id:newId, date, category: document.getElementById('ef_cat').value, amount,
    note: document.getElementById('ef_note').value.trim()
  });
  applyStatsDelta(batch, date, {totalExpense: amount});
  fireWrite(batch.commit(), 'নতুন খরচ');
  closeModal();
}
function deleteExpense(id){
  if(!confirm('এই খরচ এন্ট্রি মুছে ফেলতে চান?')) return;
  const e = DB.expenses.find(x=>x.id===id);
  const batch = fsDB.batch();
  batch.delete(fsDB.collection('erp_expenses').doc(String(id)));
  if(e) applyStatsDelta(batch, e.date, {totalExpense: -Number(e.amount)});
  logAudit('খরচ মোছা', e?`${e.category} — ${money(e.amount)}`:String(id));
  fireWrite(batch.commit(), 'খরচ মোছা');
}


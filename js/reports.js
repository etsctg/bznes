/* ================= রিপোর্ট =================
   সারসংক্ষেপ, দিনভিত্তিক/মাসভিত্তিক, পণ্যভিত্তিক লাভ, পার্টি/ইউজারভিত্তিক —
   প্রিন্ট ও CSV (Excel) এক্সপোর্টসহ। */

/* ================= REPORTS (Profit/Loss) ================= */
/* ================= রিপোর্ট (সারসংক্ষেপ / দিনভিত্তিক / পণ্যভিত্তিক / পার্টি-ইউজারভিত্তিক) ================= */
let repTab = 'summary';
let repRange = {from:'', to:''};
let repExport = null;          // {name, head, rows(raw), disp(display)} — CSV ও প্রিন্টের জন্য
let repCache = {};             // ভারী রিপোর্টের লোড করা ডেটা
let repDailyMode = 'day';
const REPORT_CAP = 5000;       // একটা রিপোর্টে সর্বোচ্চ কয়টা বিক্রয়/ক্রয় এন্ট্রি পড়া হবে
const REP_TABS = [
  {k:'summary', ic:'📊', label:'সারসংক্ষেপ'},
  {k:'daily',   ic:'📅', label:'দিনভিত্তিক'},
  {k:'product', ic:'📦', label:'পণ্যভিত্তিক লাভ'},
  {k:'party',   ic:'👥', label:'পার্টি / ইউজার'}
];
function repRangeText(){
  const f = repRange.from, t = repRange.to;
  return (f||t) ? `${f?fmtDate(f):'শুরু'} — ${t?fmtDate(t):'আজ'}` : 'সব সময়';
}
function setRepRange(kind){
  const td = todayStr(), y = Number(td.slice(0,4)), m = Number(td.slice(5,7));
  const z = n=>String(n).padStart(2,'0');
  if(kind==='today'){ repRange = {from:td, to:td}; }
  else if(kind==='week'){ const d = new Date(td+'T00:00:00'); d.setDate(d.getDate()-6); repRange = {from:`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`, to:td}; }
  else if(kind==='month'){ repRange = {from:`${y}-${z(m)}-01`, to:td}; }
  else if(kind==='lastmonth'){ const ly = m===1?y-1:y, lm = m===1?12:m-1; repRange = {from:`${ly}-${z(lm)}-01`, to:`${ly}-${z(lm)}-${z(new Date(ly,lm,0).getDate())}`}; }
  else if(kind==='year'){ repRange = {from:`${y}-01-01`, to:td}; }
  else repRange = {from:'', to:''};
  renderReports();
}
function repDateChanged(){
  repRange = {from: document.getElementById('repFrom').value, to: document.getElementById('repTo').value};
  renderReportBody();
}
function switchRepTab(k){ repTab = k; renderReports(); }
function renderReports(){
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar">
      <div><h2>রিপোর্ট ও লাভ-ক্ষতি</h2><div class="sub">সারসংক্ষেপ, দিনভিত্তিক, পণ্যভিত্তিক ও পার্টিভিত্তিক রিপোর্ট — প্রিন্ট ও Excel (CSV) করা যায়</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="exportReportCSV()">⬇️ CSV (Excel)</button>
        <button class="btn btn-outline" onclick="printReport()">🖨️ প্রিন্ট</button>
      </div>
    </div>
    ${statsBannerHtml()}
    <div class="toolbar">
      <input type="date" id="repFrom" value="${repRange.from}" onchange="repDateChanged()"><span style="color:var(--muted);font-size:12px;">থেকে</span>
      <input type="date" id="repTo" value="${repRange.to}" onchange="repDateChanged()">
      <button class="btn btn-outline small-btn" onclick="setRepRange('today')">আজ</button>
      <button class="btn btn-outline small-btn" onclick="setRepRange('week')">গত ৭ দিন</button>
      <button class="btn btn-outline small-btn" onclick="setRepRange('month')">এই মাস</button>
      <button class="btn btn-outline small-btn" onclick="setRepRange('lastmonth')">গত মাস</button>
      <button class="btn btn-outline small-btn" onclick="setRepRange('year')">এই বছর</button>
      <button class="btn btn-outline small-btn" onclick="setRepRange('all')">সব সময়</button>
    </div>
    <div class="set-tabs">${REP_TABS.map(t=>`<button class="set-tab ${t.k===repTab?'active':''}" onclick="switchRepTab('${t.k}')"><span>${t.ic}</span>${t.label}</button>`).join('')}</div>
    <div id="reportBody"><div style="color:var(--muted);padding:20px;text-align:center;">লোড হচ্ছে...</div></div>
  `;
  renderReportBody();
}
function repError(err){
  console.error('রিপোর্ট লোড ব্যর্থ:', err);
  const rb = document.getElementById('reportBody');
  if(rb) rb.innerHTML = `<div class="help-warn" style="font-size:13px;line-height:1.8;">⚠️ রিপোর্ট লোড করা যায়নি: ${esc(err.message||err)}<br>Firestore Rules-এ সংশ্লিষ্ট কালেকশনের (erp_daystats, erp_stats, erp_sales, erp_purchases) অনুমতি আছে কিনা দেখুন (firestore.rules.txt), তারপর পেজ রিফ্রেশ করুন।</div>`;
}
function inRepRange(date){ return (!repRange.from || date>=repRange.from) && (!repRange.to || date<=repRange.to); }
function setRepExport(name, head, rows, disp){ repExport = {name, head, rows, disp: disp||rows.map(r=>r.map(c=>typeof c==='number'?money(c):c))}; }
function renderReportBody(){
  if(!document.getElementById('reportBody')) return;
  if(repTab==='daily') return renderRepDaily();
  if(repTab==='product') return renderRepHeavy('product');
  if(repTab==='party') return renderRepHeavy('party');
  return renderRepSummary();
}
/* ---------- ১. সারসংক্ষেপ ---------- */
async function renderRepSummary(){
  let dayRows;
  try{ dayRows = await loadDayStatsRange(repRange.from||null, repRange.to||null); }catch(err){ repError(err); return; }
  if(!document.getElementById('reportBody') || repTab!=='summary') return;
  const totalSales = r2(dayRows.reduce((s,x)=>s+(x.totalSales||0),0));
  const cogs = r2(dayRows.reduce((s,x)=>s+(x.totalCogs||0),0));
  const grossProfit = r2(totalSales - cogs);
  const totalPurchase = r2(dayRows.reduce((s,x)=>s+(x.totalPurchase||0),0));
  const totalReturns = r2(dayRows.reduce((s,x)=>s+(x.totalReturns||0),0));
  const totalPurExtra = r2(dayRows.reduce((s,x)=>s+(x.totalPurchaseExtra||0),0)), totalPurRet = r2(dayRows.reduce((s,x)=>s+(x.totalPurchaseReturns||0),0));
  const expenses = DB.expenses.filter(e=>inRepRange(e.date));
  const totalExpense = r2(expenses.reduce((s,x)=>s+Number(x.amount),0));
  const netProfit = r2(grossProfit - totalExpense);
  const expByCat = {}; expenses.forEach(e=>{ expByCat[e.category]=(expByCat[e.category]||0)+Number(e.amount); });
  const cats = Object.keys(expByCat).sort((a,b)=>expByCat[b]-expByCat[a]);
  const gm = totalSales>0 ? (grossProfit/totalSales*100) : 0, nm = totalSales>0 ? (netProfit/totalSales*100) : 0;
  setRepExport('লাভ-ক্ষতির সারসংক্ষেপ', ['বিবরণ','পরিমাণ'],
    [['মোট বিক্রয়',totalSales],['বিক্রিত পণ্যের ক্রয়মূল্য (COGS)',cogs],['গ্রস প্রফিট',grossProfit],['মোট খরচ',totalExpense],['নীট লাভ/ক্ষতি',netProfit],['মোট ক্রয়',totalPurchase],...cats.map(c=>['খরচ — '+c,expByCat[c]])]);
  document.getElementById('reportBody').innerHTML = `
    <div class="grid g3">
      <div class="stat-card teal"><div class="lbl">মোট বিক্রয়</div><div class="val">${money(totalSales)}</div></div>
      <div class="stat-card purple"><div class="lbl">বিক্রিত পণ্যের ক্রয়মূল্য (COGS)</div><div class="val">${money(cogs)}</div></div>
      <div class="stat-card gold"><div class="lbl">গ্রস প্রফিট</div><div class="val">${money(grossProfit)}</div></div>
    </div>
    <div class="grid g3" style="margin-top:16px;">
      <div class="stat-card danger"><div class="lbl">মোট খরচ</div><div class="val">${money(totalExpense)}</div></div>
      <div class="stat-card blue"><div class="lbl">মোট ক্রয়</div><div class="val">${money(totalPurchase)}</div></div>
      <div class="stat-card ${netProfit>=0?'teal':'danger'}"><div class="lbl">নীট লাভ/ক্ষতি</div><div class="val" style="color:${netProfit>=0?'var(--success)':'var(--danger-text)'}">${money(netProfit)}</div></div>
    </div>
    <div class="set-note" style="max-width:none;">সময়: <b>${repRangeText()}</b>${totalReturns>0?` • বিক্রয় ফেরত (নীট বিক্রয় থেকে বাদ): <b>${money(totalReturns)}</b>`:''}${totalPurRet>0?` • ক্রয় ফেরত (নীট ক্রয় থেকে বাদ): <b>${money(totalPurRet)}</b>`:''}${totalPurExtra>0?` • ক্রয়ের অতিরিক্ত খরচ (পণ্যের ল্যান্ডেড মূল্যে যুক্ত, আলাদা খরচ নয়): <b>${money(totalPurExtra)}</b>`:''} • গ্রস মার্জিন <b>${gm.toFixed(1)}%</b> • নীট মার্জিন <b>${nm.toFixed(1)}%</b>। বিস্তারিত দেখতে উপরের ট্যাব — <b>দিনভিত্তিক</b>, <b>পণ্যভিত্তিক লাভ</b>, <b>পার্টি/ইউজার</b>।</div>
    <div class="card" style="margin-top:16px;">
      <h3>খাতভিত্তিক খরচ বিশ্লেষণ</h3>
      <div class="tbl-wrap"><table>
        <tr><th>খাত</th><th class="num">পরিমাণ</th><th class="num">শতাংশ</th></tr>
        ${cats.map(c=>`<tr><td>${esc(c)}</td><td class="num">${money(expByCat[c])}</td><td class="num">${totalExpense?(expByCat[c]/totalExpense*100).toFixed(1):0}%</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted);">এই সময়ে কোনো খরচ নেই</td></tr>'}
      </table></div>
    </div>`;
}
/* ---------- ২. দিনভিত্তিক / মাসিক ---------- */
async function renderRepDaily(){
  let dayRows;
  try{ dayRows = await loadDayStatsRange(repRange.from||null, repRange.to||null); }catch(err){ repError(err); return; }
  if(!document.getElementById('reportBody') || repTab!=='daily') return;
  const keyOf = d=> repDailyMode==='month' ? d.slice(0,7) : d;
  const map = {};
  const slot = k=> map[k] || (map[k] = {k, sales:0, purchase:0, cogs:0, expense:0, count:0});
  dayRows.forEach(r=>{ const o = slot(keyOf(r.date)); o.sales += r.totalSales||0; o.purchase += r.totalPurchase||0; o.cogs += r.totalCogs||0; o.count += r.salesCount||0; });
  DB.expenses.filter(e=>inRepRange(e.date)).forEach(e=>{ slot(keyOf(e.date)).expense += Number(e.amount); });
  const rows = Object.values(map).map(o=>({...o, sales:r2(o.sales), purchase:r2(o.purchase), cogs:r2(o.cogs), expense:r2(o.expense), gross:r2(o.sales-o.cogs), net:r2(o.sales-o.cogs-o.expense)}));
  rows.sort((a,b)=>b.k.localeCompare(a.k));
  const tot = rows.reduce((t,o)=>({sales:t.sales+o.sales, purchase:t.purchase+o.purchase, cogs:t.cogs+o.cogs, expense:t.expense+o.expense, count:t.count+o.count}), {sales:0,purchase:0,cogs:0,expense:0,count:0});
  const label = k=> repDailyMode==='month' ? new Date(k+'-01T00:00:00').toLocaleDateString('bn-BD',{year:'numeric',month:'long'}) : fmtDate(k);
  const head = [repDailyMode==='month'?'মাস':'তারিখ','ইনভয়েস','বিক্রয়','ক্রয়','COGS','গ্রস লাভ','খরচ','নীট লাভ'];
  const raw = rows.map(o=>[o.k,o.count,o.sales,o.purchase,o.cogs,o.gross,o.expense,o.net]);
  const gT = r2(tot.sales-tot.cogs), nT = r2(tot.sales-tot.cogs-tot.expense);
  raw.push(['সর্বমোট',tot.count,r2(tot.sales),r2(tot.purchase),r2(tot.cogs),gT,r2(tot.expense),nT]);
  const disp = raw.map((r,i)=>[i<rows.length?label(r[0]):'সর্বমোট', String(r[1]), ...r.slice(2).map(v=>money(v))]);
  setRepExport(repDailyMode==='month'?'মাসভিত্তিক হিসাব':'দিনভিত্তিক হিসাব', head, raw, disp);
  const col = v=> v<0 ? 'color:var(--danger-text);' : '';
  document.getElementById('reportBody').innerHTML = `
    <div class="toolbar">
      <button class="btn ${repDailyMode==='day'?'btn-gold':'btn-outline'} small-btn" onclick="repDailyMode='day';renderRepDaily()">📅 দিনভিত্তিক</button>
      <button class="btn ${repDailyMode==='month'?'btn-gold':'btn-outline'} small-btn" onclick="repDailyMode='month';renderRepDaily()">🗓️ মাসভিত্তিক</button>
      <span style="color:var(--muted);font-size:12.5px;">সময়: ${repRangeText()}</span>
    </div>
    ${rows.length ? `<div class="card" style="margin-bottom:16px;"><h3>📈 বিক্রয়, ক্রয় ও নীট লাভ</h3><div class="chart-wrap"><canvas id="chartDaily"></canvas></div></div>` : ''}
    <div class="card"><div class="tbl-wrap"><table>
      <tr>${head.map((h,i)=>`<th ${i>0?'class="num"':''}>${h}</th>`).join('')}</tr>
      ${rows.map(o=>`<tr><td>${label(o.k)}</td><td class="num">${o.count}</td><td class="num">${money(o.sales)}</td><td class="num">${money(o.purchase)}</td><td class="num">${money(o.cogs)}</td>
        <td class="num" style="${col(o.gross)}">${money(o.gross)}</td><td class="num">${money(o.expense)}</td><td class="num" style="${col(o.net)}"><b>${money(o.net)}</b></td></tr>`).join('')
        || `<tr><td colspan="8" style="text-align:center;color:var(--muted);">এই সময়ে কোনো লেনদেন নেই</td></tr>`}
      ${rows.length?`<tr><td class="foot-total">সর্বমোট</td><td class="foot-total num">${tot.count}</td><td class="foot-total num">${money(r2(tot.sales))}</td><td class="foot-total num">${money(r2(tot.purchase))}</td><td class="foot-total num">${money(r2(tot.cogs))}</td><td class="foot-total num" style="${col(gT)}">${money(gT)}</td><td class="foot-total num">${money(r2(tot.expense))}</td><td class="foot-total num" style="${col(nT)}">${money(nT)}</td></tr>`:''}
    </table></div></div>`;
  if(typeof Chart !== 'undefined' && rows.length){
    const asc = [...rows].reverse().slice(-62);
    const ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line');
    try{
      if(chartRefs.daily) chartRefs.daily.destroy();
      chartRefs.daily = new Chart(document.getElementById('chartDaily'), {
        type:'bar',
        data:{ labels: asc.map(r=>label(r.k)), datasets:[
          {label:'বিক্রয়', data:asc.map(r=>r.sales), backgroundColor:cssVar('--teal-2'), borderRadius:5, maxBarThickness:26},
          {label:'ক্রয়', data:asc.map(r=>r.purchase), backgroundColor:cssVar('--blue-2'), borderRadius:5, maxBarThickness:26},
          {type:'line', label:'নীট লাভ', data:asc.map(r=>r.net), borderColor:cssVar('--gold-2'), backgroundColor:cssVar('--gold-2'), tension:.3, borderWidth:2.5, pointRadius:3}
        ]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:ink,usePointStyle:true}}},
          scales:{x:{ticks:{color:muted}, grid:{display:false}}, y:{ticks:{color:muted}, grid:{color:line}}}}
      });
    }catch(e){ console.error('daily chart', e); }
  }
}
/* ---------- ভারী রিপোর্ট: পণ্যভিত্তিক ও পার্টি/ইউজারভিত্তিক (এন্ট্রিগুলো পড়ে হিসাব) ---------- */
async function loadAllInRange(coll, from, to, cap){
  cap = cap || REPORT_CAP;
  let q = fsDB.collection(coll).orderBy('date');
  if(from) q = q.where('date','>=',from);
  if(to) q = q.where('date','<=',to);
  const rows = []; let last = null, truncated = false;
  while(true){
    let qq = q.limit(500); if(last) qq = qq.startAfter(last);
    const snap = await qq.get();
    snap.forEach(d=>rows.push(d.data()));
    if(snap.size < 500) break;
    last = snap.docs[snap.docs.length-1];
    if(rows.length >= cap){ truncated = true; break; }
  }
  return {rows, truncated};
}
function saleCogs(s){
  if(s.cogs!=null) return Number(s.cogs);
  return r2((s.items||[]).reduce((a,it)=>{ const pr = DB.products.find(x=>x.id===it.productId); return a + ((it.buyPrice!=null)?it.buyPrice:(pr?pr.buyPrice:0))*it.qty; },0));
}
function aggregateProducts(sales){
  const map = {};
  sales.forEach(s=>{
    const items = s.items||[];
    const sub = items.reduce((a,it)=>a+it.price*it.qty,0);
    const f = sub>0 ? (s.total/sub) : 1;      // ডিসকাউন্ট পণ্যগুলোর মধ্যে আনুপাতিক হারে ভাগ হয়, যাতে মোট মিলে যায়
    items.forEach(it=>{
      const pr = DB.products.find(p=>p.id===it.productId);
      const o = map[it.productId] || (map[it.productId] = {id:it.productId, name: pr?(pr.name+(pr.color?' ('+pr.color+')':'')):'(মুছে ফেলা পণ্য)', unit: pr?pr.unit:'', qty:0, rev:0, cogs:0, approx:false});
      const bp = (it.buyPrice!=null) ? it.buyPrice : (pr?pr.buyPrice:0);
      if(it.buyPrice==null) o.approx = true;
      const rq = (s.retQty && s.retQty[it.productId]) || 0, nq = it.qty - rq;   // ফেরত বাদ
      o.qty += nq; o.rev += it.price*nq*f; o.cogs += bp*nq;
    });
  });
  return Object.values(map).map(o=>({...o, qty:r2(o.qty), rev:r2(o.rev), cogs:r2(o.cogs), profit:r2(o.rev-o.cogs), margin: o.rev>0 ? (o.rev-o.cogs)/o.rev*100 : 0}));
}
function aggregateParties(sales, purchases){
  const cust = {}, sup = {}, usr = {};
  sales.forEach(s=>{
    const c = cust[s.customerId] || (cust[s.customerId] = {name:s.customerName||'—', n:0, total:0, paid:0, due:0, profit:0});
    const netT = (s.total||0) - (s.returnedTotal||0), netC = saleCogs(s) - (s.returnedCogs||0);
    c.n++; c.total += netT; c.paid += s.paid||0; c.due += s.due||0; c.profit += netT - netC;
    const un = maskUser(s.createdBy) || 'অজানা';
    const u = usr[un] || (usr[un] = {name:un, sn:0, stotal:0, sprofit:0, pn:0, ptotal:0});
    u.sn++; u.stotal += netT; u.sprofit += netT - netC;
  });
  purchases.forEach(p=>{
    const c = sup[p.supplierId] || (sup[p.supplierId] = {name:p.supplierName||'—', n:0, total:0, paid:0, due:0});
    c.n++; c.total += p.total||0; c.paid += p.paid||0; c.due += p.due||0;
    const un = maskUser(p.createdBy) || 'অজানা';
    const u = usr[un] || (usr[un] = {name:un, sn:0, stotal:0, sprofit:0, pn:0, ptotal:0});
    u.pn++; u.ptotal += p.total||0;
  });
  const fin = o=>{ Object.keys(o).forEach(k=>{ if(typeof o[k]==='number') o[k]=r2(o[k]); }); return o; };
  return {customers:Object.values(cust).map(fin), suppliers:Object.values(sup).map(fin), users:Object.values(usr).map(fin)};
}
function renderRepHeavy(kind){
  const host = document.getElementById('reportBody');
  const c = repCache[kind];
  if(!c || c.from!==repRange.from || c.to!==repRange.to){
    repExport = null;
    const wide = !repRange.from && !repRange.to;
    host.innerHTML = `<div class="card set-card" style="text-align:center;">
      <h3 style="justify-content:center;">${kind==='product'?'📦 পণ্যভিত্তিক বিক্রয় ও লাভ':'👥 কাস্টমার / সাপ্লায়ার / ইউজারভিত্তিক'}</h3>
      <div class="set-note" style="margin-top:0;">সময়: <b>${repRangeText()}</b><br>এই রিপোর্টের জন্য ওই সময়ের সব ${kind==='product'?'বিক্রয়':'বিক্রয় ও ক্রয়'} এন্ট্রি পড়তে হয় (সর্বোচ্চ ${REPORT_CAP}টি পর্যন্ত)।${wide?'<br><b style="color:var(--warn-text);">⚠️ "সব সময়" বাছা আছে — এন্ট্রি বেশি হলে সময় ও ডেটা-খরচ বেশি লাগবে; সম্ভব হলে উপরে মাস/তারিখ বেছে নিন।</b>':''}</div>
      <button class="btn btn-gold" style="margin-top:12px;" onclick="generateRep('${kind}')">📊 রিপোর্ট তৈরি করুন</button></div>`;
    return;
  }
  const warn = c.truncated ? `<div class="help-warn" style="margin-bottom:12px;">⚠️ এন্ট্রি অনেক বেশি — সর্বোচ্চ ${REPORT_CAP}টি পর্যন্ত হিসাব হয়েছে। সঠিক ফল পেতে তারিখের রেঞ্জ ছোট করুন।</div>` : '';
  if(kind==='product') return drawRepProduct(c, warn);
  return drawRepParty(c, warn);
}
async function generateRep(kind){
  const host = document.getElementById('reportBody'); if(!host) return;
  host.innerHTML = `<div style="color:var(--muted);padding:30px;text-align:center;">⏳ এন্ট্রি পড়া ও হিসাব চলছে... (সময় লাগতে পারে)</div>`;
  const from = repRange.from, to = repRange.to;
  try{
    if(kind==='product'){
      const r = await loadAllInRange('erp_sales', from||null, to||null);
      repCache.product = {from, to, sales:r.rows, truncated:r.truncated, sort:'profit', q:''};
    } else {
      const [s, p] = await Promise.all([loadAllInRange('erp_sales', from||null, to||null), loadAllInRange('erp_purchases', from||null, to||null)]);
      repCache.party = {from, to, sales:s.rows, purchases:p.rows, truncated:s.truncated||p.truncated, view: (repCache.party&&repCache.party.view)||'customer'};
    }
  }catch(err){ repError(err); return; }
  if(repTab===kind) renderRepHeavy(kind);
}
function repSetSort(v){ if(repCache.product){ repCache.product.sort = v; renderRepHeavy('product'); } }
function repSetQuery(v){ if(repCache.product){ repCache.product.q = v; drawRepProductTable(); } }
function drawRepProduct(c, warn){
  document.getElementById('reportBody').innerHTML = `${warn}
    <div class="toolbar">
      <input type="text" id="repProdQ" placeholder="🔍 পণ্য খুঁজুন..." value="${esc(c.q||'')}" oninput="repSetQuery(this.value)">
      <select onchange="repSetSort(this.value)">
        ${[['profit','লাভ (বেশি → কম)'],['rev','বিক্রয় (বেশি → কম)'],['qty','পরিমাণ (বেশি → কম)'],['margin','লাভ% (বেশি → কম)'],['loss','লোকসান/কম লাভ আগে']].map(([v,l])=>`<option value="${v}" ${c.sort===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <span style="color:var(--muted);font-size:12.5px;">${c.sales.length}টি বিক্রয় এন্ট্রি • সময়: ${repRangeText()}</span>
    </div>
    <div class="card"><div class="tbl-wrap" id="repProdWrap"></div></div>`;
  drawRepProductTable();
}
function drawRepProductTable(){
  const c = repCache.product; const wrap = document.getElementById('repProdWrap'); if(!c || !wrap) return;
  let rows = aggregateProducts(c.sales);
  const q = (c.q||'').trim().toLowerCase();
  if(q) rows = rows.filter(r=>r.name.toLowerCase().includes(q));
  const sorters = {profit:(a,b)=>b.profit-a.profit, rev:(a,b)=>b.rev-a.rev, qty:(a,b)=>b.qty-a.qty, margin:(a,b)=>b.margin-a.margin, loss:(a,b)=>a.profit-b.profit};
  rows.sort(sorters[c.sort]||sorters.profit);
  const T = rows.reduce((t,r)=>({qty:t.qty+r.qty, rev:t.rev+r.rev, cogs:t.cogs+r.cogs, profit:t.profit+r.profit}), {qty:0,rev:0,cogs:0,profit:0});
  const head = ['পণ্য','বিক্রিত পরিমাণ','বিক্রয়','COGS (ক্রয়মূল্য)','লাভ','লাভ%'];
  const raw = rows.map(r=>[r.name, r.qty, r.rev, r.cogs, r.profit, r2(r.margin)]);
  raw.push(['সর্বমোট','',r2(T.rev),r2(T.cogs),r2(T.profit), T.rev>0?r2(T.profit/T.rev*100):0]);
  const disp = raw.map((r,i)=>[r[0], i<rows.length?`${r[1]} ${rows[i].unit}`:'', money(r[2]), money(r[3]), money(r[4]), r[5].toFixed(1)+'%']);
  setRepExport('পণ্যভিত্তিক বিক্রয় ও লাভ', head, raw, disp);
  const col = v=> v<0 ? 'color:var(--danger-text);' : '';
  wrap.innerHTML = `<table>
    <tr>${head.map((h,i)=>`<th ${i>0?'class="num"':''}>${h}</th>`).join('')}</tr>
    ${rows.map((r,i)=>`<tr><td>${esc(r.name)}</td><td class="num">${r.qty} ${esc(r.unit)}</td><td class="num">${money(r.rev)}</td><td class="num">${money(r.cogs)}</td>
      <td class="num" style="${col(r.profit)}"><b>${r.approx?'~':''}${money(r.profit)}</b></td><td class="num" style="${col(r.profit)}">${r.margin.toFixed(1)}%</td></tr>`).join('')
      || '<tr><td colspan="6" style="text-align:center;color:var(--muted);">কোনো তথ্য নেই</td></tr>'}
    ${rows.length?`<tr><td class="foot-total">সর্বমোট</td><td class="foot-total num"></td><td class="foot-total num">${money(r2(T.rev))}</td><td class="foot-total num">${money(r2(T.cogs))}</td><td class="foot-total num" style="${col(T.profit)}">${money(r2(T.profit))}</td><td class="foot-total num">${T.rev>0?(T.profit/T.rev*100).toFixed(1):'0.0'}%</td></tr>`:''}
  </table>
  <div class="set-note">ডিসকাউন্ট থাকলে তা পণ্যগুলোর মধ্যে আনুপাতিক হারে ভাগ করে "বিক্রয়" দেখানো হয়, তাই মোট মিলে যায়। <b>~</b> চিহ্ন মানে ওই পণ্যের কিছু পুরনো বিক্রয়ে ক্রয়মূল্য সেভ ছিল না — বর্তমান ক্রয়মূল্য ধরে আনুমানিক লাভ।</div>`;
}
function repSetPartyView(v){ if(repCache.party){ repCache.party.view = v; renderRepHeavy('party'); } }
function drawRepParty(c, warn){
  const agg = aggregateParties(c.sales, c.purchases);
  const v = c.view;
  const col = x=> x<0 ? 'color:var(--danger-text);' : '';
  let head, raw, disp, body;
  if(v==='customer'){
    const rows = agg.customers.sort((a,b)=>b.total-a.total);
    head = ['কাস্টমার','ইনভয়েস','মোট বিক্রয়','জমা','বাকি','লাভ'];
    raw = rows.map(r=>[r.name,r.n,r.total,r.paid,r.due,r.profit]);
    disp = raw.map(r=>[r[0],String(r[1]),money(r[2]),money(r[3]),money(r[4]),money(r[5])]);
    body = rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${r.n}</td><td class="num">${money(r.total)}</td><td class="num">${money(r.paid)}</td><td class="num" style="${r.due>0?'color:var(--warn-text);':''}">${money(r.due)}</td><td class="num" style="${col(r.profit)}">${money(r.profit)}</td></tr>`);
  } else if(v==='supplier'){
    const rows = agg.suppliers.sort((a,b)=>b.total-a.total);
    head = ['সাপ্লায়ার','ভাউচার','মোট ক্রয়','পরিশোধ','বাকি (দেনা)'];
    raw = rows.map(r=>[r.name,r.n,r.total,r.paid,r.due]);
    disp = raw.map(r=>[r[0],String(r[1]),money(r[2]),money(r[3]),money(r[4])]);
    body = rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${r.n}</td><td class="num">${money(r.total)}</td><td class="num">${money(r.paid)}</td><td class="num" style="${r.due>0?'color:var(--danger-text);':''}">${money(r.due)}</td></tr>`);
  } else {
    const rows = agg.users.sort((a,b)=>b.stotal-a.stotal);
    head = ['ইউজার','বিক্রয় সংখ্যা','মোট বিক্রয়','লাভ','ক্রয় সংখ্যা','মোট ক্রয়'];
    raw = rows.map(r=>[r.name,r.sn,r.stotal,r.sprofit,r.pn,r.ptotal]);
    disp = raw.map(r=>[r[0],String(r[1]),money(r[2]),money(r[3]),String(r[4]),money(r[5])]);
    body = rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${r.sn}</td><td class="num">${money(r.stotal)}</td><td class="num" style="${col(r.sprofit)}">${money(r.sprofit)}</td><td class="num">${r.pn}</td><td class="num">${money(r.ptotal)}</td></tr>`);
  }
  setRepExport({customer:'কাস্টমারভিত্তিক বিক্রয়', supplier:'সাপ্লায়ারভিত্তিক ক্রয়', user:'ইউজারভিত্তিক বিক্রয়-ক্রয়'}[v], head, raw, disp);
  document.getElementById('reportBody').innerHTML = `${warn}
    <div class="toolbar">
      ${[['customer','👤 কাস্টমার'],['supplier','🏭 সাপ্লায়ার'],['user','🧑‍💼 ইউজার']].map(([k,l])=>`<button class="btn ${v===k?'btn-gold':'btn-outline'} small-btn" onclick="repSetPartyView('${k}')">${l}</button>`).join('')}
      <span style="color:var(--muted);font-size:12.5px;">${c.sales.length}টি বিক্রয়, ${c.purchases.length}টি ক্রয় • সময়: ${repRangeText()}</span>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <tr>${head.map((h,i)=>`<th ${i>0?'class="num"':''}>${h}</th>`).join('')}</tr>
      ${body.join('') || `<tr><td colspan="${head.length}" style="text-align:center;color:var(--muted);">কোনো তথ্য নেই</td></tr>`}
    </table></div></div>`;
}
/* ---------- CSV ও প্রিন্ট ---------- */
function exportReportCSV(){
  if(!repExport){ toast('আগে একটা রিপোর্ট তৈরি করুন'); return; }
  const q = v=>{ const t = String(v==null?'':v); return /[",\r\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; };
  const lines = [repExport.head, ...repExport.rows].map(r=>r.map(q).join(','));
  const blob = new Blob(['\ufeff'+lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `report-${repTab}-${repRange.from||'start'}_${repRange.to||'today'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  toast('⬇️ CSV ফাইল নামানো হয়েছে (Excel-এ খুলবে)');
}
function printReport(){
  if(!repExport){ toast('আগে একটা রিপোর্ট তৈরি করুন'); return; }
  const pa = document.getElementById('printArea');
  pa.className = '';
  let el = document.getElementById('pageSizeStyle');
  if(!el){ el = document.createElement('style'); el.id = 'pageSizeStyle'; document.head.appendChild(el); }
  el.textContent = repExport.head.length>6 ? '@media print{@page{size:A4 landscape;margin:10mm;}}' : '@media print{@page{size:A4;margin:10mm;}}';
  pa.innerHTML = `
    <div class="inv-head">
      <div>${shopHeaderHtml()}<div><b>${esc(repExport.name)}</b></div></div>
      <div style="text-align:left;"><div><b>সময়:</b> ${repRangeText()}</div><div><b>প্রিন্টের তারিখ:</b> ${fmtDate(todayStr())}</div></div>
    </div>
    <table class="inv-table">
      <tr>${repExport.head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>
      ${repExport.disp.map(r=>`<tr>${r.map((c,i)=>`<td ${i>0?'class="num"':''}>${esc(c)}</td>`).join('')}</tr>`).join('')}
    </table>`;
  window.print();
}


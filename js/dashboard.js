/* ================= ড্যাশবোর্ড =================
   সর্বমোট বিক্রয়/ক্রয়/খরচ/লাভ, ৭ দিনের চার্ট, লো-স্টক তালিকা। */

/* ================= DASHBOARD =================
   এখন আর পুরো বিক্রয়/ক্রয় হিস্টোরি স্ক্যান করে যোগফল বের করা হয় না (লাখ খানেক
   এন্ট্রি জমলে সেটা স্লো হয়ে যেত) — বরং এগ্রিগেট ডকুমেন্ট থেকে (erp_stats/alltime,
   erp_daystats/<তারিখ>) সরাসরি যোগফল/চার্ট-ডেটা টেনে আনা হয়, যা প্রতিটা
   এন্ট্রির সাথেই আপডেট থাকে। কাস্টমার/সাপ্লায়ার বাকিও তাদের নিজ নিজ due
   ফিল্ড থেকে যোগ হয় (মোট কাস্টমার/সাপ্লায়ার সংখ্যা সীমিত, তাই এটা দ্রুত)। */
let chartRefs = {};
/* ---------- তারিখ-রেঞ্জ ----------
   ডিফল্ট: চলতি মাস (স্টাফ/ইউজারের জন্য: সর্বশেষ ১ মাস)। স্টাফ শুধু বিগত ৩ মাসের মধ্যে যেকোনো তারিখ দেখতে পারে। */
let dashCache = null;
let dashRange = null;   // {preset, from, to}  — from/to null হলে "সব"
function dashIsLimited(){ return !hasAccess('manager'); }
function dashAddDays(s, n){ const [y,m,d] = s.split('-').map(Number); return localDateStr(new Date(y, m-1, d+n)); }
function dashMinDate(){ const [y,m,d] = todayStr().split('-').map(Number); return localDateStr(new Date(y, m-1-3, d)); }
function dashPreset(p){
  const t = todayStr(), y = t.slice(0,4), m = t.slice(5,7);
  switch(p){
    case 'today': return [t,t];
    case 'yesterday': { const d = dashAddDays(t,-1); return [d,d]; }
    case 'week': return [dashAddDays(t,-6), t];
    case 'month': return [`${y}-${m}-01`, t];
    case 'last30': return [dashAddDays(t,-29), t];
    case 'last90': return [dashMinDate(), t];
    case 'year': return [`${y}-01-01`, t];
    default: return [null,null];
  }
}
function dashSetPreset(p){ const [f,t] = dashPreset(p); dashRange = {preset:p, from:f, to:t}; renderDashboard(); }
function dashApplyCustom(){
  let f = document.getElementById('dashFrom').value, t = document.getElementById('dashTo').value;
  if(!f || !t){ toast('শুরু ও শেষ — দুটো তারিখই দিন'); return; }
  if(f > t){ const x = f; f = t; t = x; }
  if(dashIsLimited()){ const mn = dashMinDate(); if(f < mn){ f = mn; toast('স্টাফ শুধু বিগত ৩ মাসের তথ্য দেখতে পারেন'); } if(t < mn) t = mn; }
  if(t > todayStr()) t = todayStr();
  dashRange = {preset:'custom', from:f, to:t}; renderDashboard();
}
function dashRangeLabel(r){ return r.from ? (r.from===r.to ? fmtDate(r.from) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`) : 'সব সময়'; }
function dashBarHtml(r){
  const lim = dashIsLimited();
  const presets = lim ? [['today','আজ'],['yesterday','গতকাল'],['week','সাপ্তাহিক'],['last30','শেষ ১ মাস'],['last90','শেষ ৩ মাস']]
                      : [['today','আজ'],['yesterday','গতকাল'],['week','সাপ্তাহিক'],['month','মাসিক'],['year','বাৎসরিক'],['all','সব']];
  return `<div class="card" style="margin-bottom:14px;padding:10px 12px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
      <div><label style="font-size:11.5px;">শুরুর তারিখ</label><input type="date" id="dashFrom" value="${r.from||''}" ${lim?`min="${dashMinDate()}"`:''} max="${todayStr()}"></div>
      <div><label style="font-size:11.5px;">শেষ তারিখ</label><input type="date" id="dashTo" value="${r.to||''}" ${lim?`min="${dashMinDate()}"`:''} max="${todayStr()}"></div>
      <button class="btn btn-gold small-btn" onclick="dashApplyCustom()">দেখুন</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;">${presets.map(([k,l])=>`<button class="btn ${r.preset===k?'btn-gold':'btn-outline'} small-btn" onclick="dashSetPreset('${k}')">${l}</button>`).join('')}</div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-top:6px;">দেখানো হচ্ছে: <b style="color:var(--ink);">${dashRangeLabel(r)}</b>${lim?' • আপনি বিগত ৩ মাসের মধ্যে যেকোনো তারিখ বেছে নিতে পারবেন':''}</div>
  </div>`;
}
async function renderDashboard(){
  if(!dashRange || (dashIsLimited() && dashRange.preset==='all')){ const p = dashIsLimited() ? 'last30' : 'month'; const [f,t] = dashPreset(p); dashRange = {preset:p, from:f, to:t}; }
  const r = dashRange;
  const topbar = `<div class="topbar"><div><h2>ড্যাশবোর্ড</h2><div class="sub">ব্যবসার সারসংক্ষেপ — ${fmtDate(new Date())}</div></div></div>`;
  const ckey = (r.from||'')+'|'+(r.to||''), cached = dashCache && dashCache.key===ckey && Date.now()-dashCache.at < 5000;
  if(!cached) document.getElementById('mainArea').innerHTML = topbar + dashBarHtml(r) + '<div class="card" style="color:var(--muted);">⏳ তথ্য লোড হচ্ছে...</div>';

  /* রেঞ্জের দিনভিত্তিক এগ্রিগেট (erp_daystats) — "সব" হলে সর্বমোট ডকুমেন্ট থেকে যোগফল, চার্টের জন্য শেষ ১২ মাস */
  const chartFrom = r.from || dashAddDays(todayStr(), -364), chartTo = r.to || todayStr();
  let dayRows = [], expRows = [];
  if(cached){ dayRows = dashCache.dayRows; expRows = dashCache.expRows; }
  else try{
    dayRows = await loadDayStatsRange(chartFrom, chartTo);
    const es = await fsDB.collection('erp_expenses').where('date','>=',chartFrom).where('date','<=',chartTo).limit(3000).get();
    expRows = es.docs.map(d=>d.data());
    dashCache = {key:ckey, at:Date.now(), dayRows, expRows};
  }catch(err){ console.warn('ড্যাশবোর্ড তথ্য লোডে সমস্যা:', err); }
  if(currentPage !== 'dashboard' || dashRange !== r) return;

  const sum = k => dayRows.reduce((a,x)=>a+(x[k]||0),0);
  const st = DB.statsAlltime || {};
  const T = r.from ? {sales:sum('totalSales'), purchase:sum('totalPurchase'), expense:sum('totalExpense'), cogs:sum('totalCogs')}
                   : {sales:st.totalSales||0, purchase:st.totalPurchase||0, expense:st.totalExpense||0, cogs:st.totalCogs||0};
  const netProfit = T.sales - T.cogs - T.expense;
  const lbl = r.preset==='all' ? 'সর্বমোট' : dashRangeLabel(r);
  const totalDueFromCustomers = DB.customers.reduce((s,c)=>s+(c.due||0),0);
  const totalDueToSuppliers = DB.suppliers.reduce((s,c)=>s+(c.due||0),0);
  const lowStockItems = DB.products.filter(p=>p.stock<=p.lowStock);

  document.getElementById('mainArea').innerHTML = `
    ${topbar}
    ${dashBarHtml(r)}
    ${statsBannerHtml()}
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="stat-card teal"><div class="lbl">মোট বিক্রয়</div><div class="val">${money(T.sales)}</div><div class="ic">🧾</div></div>
      <div class="stat-card blue"><div class="lbl">মোট ক্রয়</div><div class="val">${money(T.purchase)}</div><div class="ic">🛒</div></div>
      <div class="stat-card gold"><div class="lbl">নীট লাভ/ক্ষতি</div><div class="val" style="color:${netProfit>=0?'var(--success)':'var(--danger-text)'}">${money(netProfit)}</div><div class="ic">📈</div></div>
      <div class="stat-card danger"><div class="lbl">মোট খরচ</div><div class="val">${money(T.expense)}</div><div class="ic">💵</div></div>
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin:-8px 0 14px;">উপরের চারটি সংখ্যা: ${lbl}। নিচের বাকি/স্টক সবসময় বর্তমান অবস্থা।</div>
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="stat-card amber"><div class="lbl">কাস্টমার বাকি (পাওনা)</div><div class="val" style="color:var(--amber-2)">${money(totalDueFromCustomers)}</div><div class="ic">💰</div></div>
      <div class="stat-card pink"><div class="lbl">সাপ্লায়ার বাকি (দেনা)</div><div class="val" style="color:var(--pink-2)">${money(totalDueToSuppliers)}</div><div class="ic">💰</div></div>
      <div class="stat-card purple"><div class="lbl">মোট পণ্য</div><div class="val">${DB.products.length}</div><div class="ic">📦</div></div>
      <div class="stat-card ${lowStockItems.length?'danger':'teal'}"><div class="lbl">লো-স্টক এলার্ট</div><div class="val" style="color:${lowStockItems.length?'var(--danger-text)':'var(--success)'}">${lowStockItems.length}</div><div class="ic">⚠️</div></div>
    </div>
    <div class="grid g3">
      <div class="card"><h3>📊 বিক্রয় বনাম ক্রয়</h3><div class="chart-wrap" id="chartWrapSP"><canvas id="chartSalesPurchase"></canvas></div></div>
      <div class="card"><h3>📈 নীট লাভের ট্রেন্ড</h3><div class="chart-wrap" id="chartWrapProfit"><canvas id="chartProfit"></canvas></div></div>
      <div class="card"><h3>🥧 খরচের বিভাজন</h3><div class="chart-wrap" id="chartWrapExp"><canvas id="chartExpense"></canvas></div></div>
    </div>
    <div class="card" style="margin-top:16px;" id="lowStockCard">
      <h3>⚠️ লো-স্টক পণ্য</h3>
      ${lowStockItems.length ? `<div class="tbl-wrap"><table><tr><th>পণ্য</th><th>বর্তমান স্টক</th><th>মিনিমাম লিমিট</th></tr>
        ${lowStockItems.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.stock} ${esc(p.unit)}</td><td>${p.lowStock}</td></tr>`).join('')}
      </table></div>` : `<div style="color:var(--muted);font-size:13px;">সব পণ্যের স্টক পর্যাপ্ত আছে ✅</div>`}
    </div>`;

  if(typeof Chart === 'undefined'){
    ['chartWrapSP','chartWrapProfit','chartWrapExp'].forEach(id=>{
      document.getElementById(id).innerHTML = '<div class="chart-fallback">📉 চার্ট লোড করা যায়নি — "chart.umd.js" ফাইলটা index.html এর সাথে একই ফোল্ডারে আছে কিনা দেখুন, তারপর পেজ রিফ্রেশ করুন।</div>';
    });
    return;
  }

  /* চার্ট: ৬২ দিন পর্যন্ত দিনভিত্তিক, তার বেশি হলে মাসভিত্তিক */
  const byDate = {}; dayRows.forEach(x=>byDate[x.date]=x);
  const spanDays = Math.round((new Date(chartTo+'T00:00:00') - new Date(chartFrom+'T00:00:00'))/864e5) + 1;
  let labels = [], buckets = [];
  if(spanDays <= 62){
    for(let i=0;i<spanDays;i++){ const d = dashAddDays(chartFrom, i); labels.push(fmtDate(d)); buckets.push([d]); }
  } else {
    const mm = {}; dayRows.forEach(x=>{ const k = x.date.slice(0,7); (mm[k] = mm[k]||[]).push(x.date); });
    Object.keys(mm).sort().forEach(k=>{ labels.push(k); buckets.push(mm[k]); });
  }
  const agg = (ds,k)=>ds.reduce((a,d)=>a+((byDate[d]&&byDate[d][k])||0),0);
  const salesBy = buckets.map(ds=>agg(ds,'totalSales')), purchBy = buckets.map(ds=>agg(ds,'totalPurchase'));
  const profitBy = buckets.map(ds=>agg(ds,'totalSales')-agg(ds,'totalCogs')-agg(ds,'totalExpense'));

  const inkColor = cssVar('--ink'), mutedColor = cssVar('--muted'), lineColor = cssVar('--line');
  const tealColor = cssVar('--teal-2'), goldColor = cssVar('--gold-2'), blueColor = cssVar('--blue-2');
  try{
    if(chartRefs.sp) chartRefs.sp.destroy();
    chartRefs.sp = new Chart(document.getElementById('chartSalesPurchase'), {
      type:'bar',
      data:{ labels, datasets:[
        {label:'বিক্রয়', data:salesBy, backgroundColor:tealColor, borderRadius:6, borderSkipped:false, maxBarThickness:28},
        {label:'ক্রয়', data:purchBy, backgroundColor:blueColor, borderRadius:6, borderSkipped:false, maxBarThickness:28}]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:inkColor,usePointStyle:true}}}, scales:{
        x:{ticks:{color:mutedColor, maxRotation:60, autoSkip:true}, grid:{display:false}},
        y:{ticks:{color:mutedColor}, grid:{color:lineColor}, beginAtZero:true}}}
    });
  }catch(err){ console.error('Sales/Purchase chart error:', err); }
  try{
    if(chartRefs.profit) chartRefs.profit.destroy();
    chartRefs.profit = new Chart(document.getElementById('chartProfit'), {
      type:'line',
      data:{ labels, datasets:[{ label:'নীট লাভ/ক্ষতি', data:profitBy, borderColor:goldColor, backgroundColor:'rgba(240,200,105,.18)',
        fill:true, tension:.35, pointBackgroundColor:goldColor, pointRadius:spanDays>31?2:4, pointHoverRadius:6, borderWidth:2.5 }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{
        x:{ticks:{color:mutedColor, maxRotation:60, autoSkip:true}, grid:{display:false}},
        y:{ticks:{color:mutedColor}, grid:{color:lineColor}}}}
    });
  }catch(err){ console.error('Profit trend chart error:', err); }

  const expenseCats = {};
  expRows.forEach(e=>{ expenseCats[e.category] = (expenseCats[e.category]||0) + Number(e.amount); });
  const catLabels = Object.keys(expenseCats);
  try{
    if(chartRefs.exp) chartRefs.exp.destroy();
    chartRefs.exp = new Chart(document.getElementById('chartExpense'), {
      type:'doughnut',
      data:{ labels: catLabels.length?catLabels:['এই সময়ে কোনো খরচ নেই'],
        datasets:[{ data: catLabels.length?catLabels.map(c=>expenseCats[c]):[1],
          backgroundColor:['#2f9c80','#d4a441','#c85a4a','#3d6ba8','#8a5fd3','#d35f9c','#5fd3a5'],
          borderWidth:2, borderColor:cssVar('--panel'), hoverOffset:6 }]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{color:inkColor,usePointStyle:true,boxWidth:8,padding:10,font:{size:11}}}} }
    });
  }catch(err){ console.error('Expense chart error:', err); }
}

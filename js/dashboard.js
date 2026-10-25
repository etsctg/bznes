/* ================= ড্যাশবোর্ড =================
   সর্বমোট বিক্রয়/ক্রয়/খরচ/লাভ, ৭ দিনের চার্ট, লো-স্টক তালিকা। */

/* ================= DASHBOARD =================
   এখন আর পুরো বিক্রয়/ক্রয় হিস্টোরি স্ক্যান করে যোগফল বের করা হয় না (লাখ খানেক
   এন্ট্রি জমলে সেটা স্লো হয়ে যেত) — বরং এগ্রিগেট ডকুমেন্ট থেকে (erp_stats/alltime,
   erp_daystats/<তারিখ>) সরাসরি যোগফল/চার্ট-ডেটা টেনে আনা হয়, যা প্রতিটা
   এন্ট্রির সাথেই আপডেট থাকে। কাস্টমার/সাপ্লায়ার বাকিও তাদের নিজ নিজ due
   ফিল্ড থেকে যোগ হয় (মোট কাস্টমার/সাপ্লায়ার সংখ্যা সীমিত, তাই এটা দ্রুত)। */
let chartRefs = {};
async function renderDashboard(){
  const st = DB.statsAlltime || {};
  const totalSales = st.totalSales||0;
  const totalPurchase = st.totalPurchase||0;
  const totalExpense = st.totalExpense||0;
  const costOfGoods = st.totalCogs||0;
  const totalDueFromCustomers = DB.customers.reduce((s,c)=>s+(c.due||0),0);
  const totalDueToSuppliers = DB.suppliers.reduce((s,c)=>s+(c.due||0),0);
  const grossProfit = totalSales - costOfGoods;
  const netProfit = grossProfit - totalExpense;
  const lowStockItems = DB.products.filter(p=>p.stock<=p.lowStock);

  document.getElementById('mainArea').innerHTML = `
    <div class="topbar">
      <div><h2>ড্যাশবোর্ড</h2><div class="sub">সামগ্রিক ব্যবসার সারসংক্ষেপ — ${fmtDate(new Date())}</div></div>
    </div>
    ${statsBannerHtml()}
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="stat-card teal"><div class="lbl">মোট বিক্রয় (সর্বমোট)</div><div class="val">${money(totalSales)}</div><div class="ic">🧾</div></div>
      <div class="stat-card blue"><div class="lbl">মোট ক্রয় (সর্বমোট)</div><div class="val">${money(totalPurchase)}</div><div class="ic">🛒</div></div>
      <div class="stat-card gold"><div class="lbl">নীট লাভ/ক্ষতি (সর্বমোট)</div><div class="val" style="color:${netProfit>=0?'var(--success)':'var(--danger-text)'}">${money(netProfit)}</div><div class="ic">📈</div></div>
      <div class="stat-card danger"><div class="lbl">মোট খরচ (সর্বমোট)</div><div class="val">${money(totalExpense)}</div><div class="ic">💵</div></div>
    </div>
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="stat-card amber"><div class="lbl">কাস্টমার বাকি (পাওনা)</div><div class="val" style="color:var(--amber-2)">${money(totalDueFromCustomers)}</div><div class="ic">💰</div></div>
      <div class="stat-card pink"><div class="lbl">সাপ্লায়ার বাকি (দেনা)</div><div class="val" style="color:var(--pink-2)">${money(totalDueToSuppliers)}</div><div class="ic">💰</div></div>
      <div class="stat-card purple"><div class="lbl">মোট পণ্য</div><div class="val">${DB.products.length}</div><div class="ic">📦</div></div>
      <div class="stat-card ${lowStockItems.length?'danger':'teal'}"><div class="lbl">লো-স্টক এলার্ট</div><div class="val" style="color:${lowStockItems.length?'var(--danger-text)':'var(--success)'}">${lowStockItems.length}</div><div class="ic">⚠️</div></div>
    </div>
    <div class="grid g3">
      <div class="card"><h3>📊 বিক্রয় বনাম ক্রয় (৭ দিন)</h3><div class="chart-wrap" id="chartWrapSP"><canvas id="chartSalesPurchase"></canvas></div></div>
      <div class="card"><h3>📈 নীট লাভের ট্রেন্ড (৭ দিন)</h3><div class="chart-wrap" id="chartWrapProfit"><canvas id="chartProfit"></canvas></div></div>
      <div class="card"><h3>🥧 খরচের বিভাজন (আজ)</h3><div class="chart-wrap" id="chartWrapExp"><canvas id="chartExpense"></canvas></div></div>
    </div>
    <div class="card" style="margin-top:16px;" id="lowStockCard">
      <h3>⚠️ লো-স্টক পণ্য</h3>
      ${lowStockItems.length ? `<div class="tbl-wrap"><table><tr><th>পণ্য</th><th>বর্তমান স্টক</th><th>মিনিমাম লিমিট</th></tr>
        ${lowStockItems.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.stock} ${esc(p.unit)}</td><td>${p.lowStock}</td></tr>`).join('')}
      </table></div>` : `<div style="color:var(--muted);font-size:13px;">সব পণ্যের স্টক পর্যাপ্ত আছে ✅</div>`}
    </div>
  `;

  /* Chart.js একটা বাইরের CDN থেকে লোড হয় — যদি ইন্টারনেট সমস্যার কারণে সেটা লোড
     হতে ব্যর্থ হয়, তাহলে খালি জায়গার বদলে একটা স্পষ্ট বার্তা দেখাবে। */
  if(typeof Chart === 'undefined'){
    ['chartWrapSP','chartWrapProfit','chartWrapExp'].forEach(id=>{
      document.getElementById(id).innerHTML = '<div class="chart-fallback">📉 চার্ট লোড করা যায়নি — "chart.umd.js" ফাইলটা index.html এর সাথে একই ফোল্ডারে আছে কিনা দেখুন, তারপর পেজ রিফ্রেশ করুন।</div>';
    });
    return;
  }

  const days = [...Array(7)].map((_,i)=>{ const d = new Date(); d.setDate(d.getDate()-(6-i)); return d.toISOString().slice(0,10); });
  const dayRows = await loadDayStatsRange(days[0], days[6]);
  const byDate = {}; dayRows.forEach(r=>byDate[r.date]=r);
  const salesByDay = days.map(d=>(byDate[d]?.totalSales)||0);
  const purchByDay = days.map(d=>(byDate[d]?.totalPurchase)||0);
  const profitByDay = days.map(d=>{
    const r = byDate[d]||{};
    return (r.totalSales||0) - (r.totalCogs||0) - (r.totalExpense||0);
  });
  if(currentPage !== 'dashboard') return; // ততক্ষণে অন্য পেজে চলে গেলে চার্ট আঁকার দরকার নেই

  const inkColor = cssVar('--ink'), mutedColor = cssVar('--muted'), lineColor = cssVar('--line');
  const tealColor = cssVar('--teal-2'), goldColor = cssVar('--gold-2'), blueColor = cssVar('--blue-2');

  try{
    if(chartRefs.sp) chartRefs.sp.destroy();
    chartRefs.sp = new Chart(document.getElementById('chartSalesPurchase'), {
      type:'bar',
      data:{ labels: days.map(d=>fmtDate(d)),
        datasets:[
          {label:'বিক্রয়', data:salesByDay, backgroundColor:tealColor, borderRadius:6, borderSkipped:false, maxBarThickness:28},
          {label:'ক্রয়', data:purchByDay, backgroundColor:blueColor, borderRadius:6, borderSkipped:false, maxBarThickness:28}
        ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:inkColor,usePointStyle:true}}}, scales:{
        x:{ticks:{color:mutedColor}, grid:{display:false}},
        y:{ticks:{color:mutedColor}, grid:{color:lineColor}, beginAtZero:true}
      }}
    });
  }catch(err){ console.error('Sales/Purchase chart error:', err); }

  /* নতুন: ৭ দিনের নীট লাভের ট্রেন্ড — প্রতিদিন লাভ না ক্ষতি হচ্ছে তা এক নজরে বোঝার জন্য */
  try{
    if(chartRefs.profit) chartRefs.profit.destroy();
    chartRefs.profit = new Chart(document.getElementById('chartProfit'), {
      type:'line',
      data:{ labels: days.map(d=>fmtDate(d)),
        datasets:[{
          label:'নীট লাভ/ক্ষতি', data:profitByDay, borderColor:goldColor, backgroundColor:'rgba(240,200,105,.18)',
          fill:true, tension:.35, pointBackgroundColor:goldColor, pointRadius:4, pointHoverRadius:6, borderWidth:2.5
        }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{
        x:{ticks:{color:mutedColor}, grid:{display:false}},
        y:{ticks:{color:mutedColor}, grid:{color:lineColor}}
      }}
    });
  }catch(err){ console.error('Profit trend chart error:', err); }

  const expenseCats = {};
  DB.expenses.filter(e=>e.date===todayStr()).forEach(e=>{ expenseCats[e.category] = (expenseCats[e.category]||0) + Number(e.amount); });
  const catLabels = Object.keys(expenseCats);
  try{
    if(chartRefs.exp) chartRefs.exp.destroy();
    chartRefs.exp = new Chart(document.getElementById('chartExpense'), {
      type:'doughnut',
      data:{ labels: catLabels.length?catLabels:['আজ কোনো খরচ নেই'],
        datasets:[{ data: catLabels.length?catLabels.map(c=>expenseCats[c]):[1],
          backgroundColor:['#2f9c80','#d4a441','#c85a4a','#3d6ba8','#8a5fd3','#d35f9c','#5fd3a5'],
          borderWidth:2, borderColor:cssVar('--panel'), hoverOffset:6
        }]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{color:cssVar('--ink'),usePointStyle:true,boxWidth:8,padding:10,font:{size:11}}}} }
    });
  }catch(err){ console.error('Expense chart error:', err); }
}


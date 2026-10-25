/* ================= স্টক ম্যানেজমেন্ট =================
   পণ্য যোগ/এডিট, একক ও বিকল্প-একক কনভার্সন, গড় ক্রয়মূল্য, এবং
   প্রতিটা পণ্যের স্টক-লেজার (কোন ভাউচার থেকে স্টক বাড়লো/কমলো)। */

/* ================= PRODUCTS / STOCK ================= */
function renderStock(){
  const canEdit = hasAccess('manager');
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar">
      <div><h2>স্টক ম্যানেজমেন্ট</h2><div class="sub">পণ্যের তালিকা ও ইনভেন্টরি নিয়ন্ত্রণ</div></div>
      ${canEdit?`<button class="btn btn-gold" onclick="openProductModal()">+ নতুন পণ্য যোগ করুন</button>`:''}
    </div>
    <div class="toolbar">
      <input type="text" id="stockSearch" placeholder="🔍 নাম/ব্র্যান্ড/শেলফ দিয়ে খুঁজুন..." oninput="renderStockTable()">
      <select id="stockFilter" onchange="renderStockTable()">
        <option value="all">সব অবস্থা</option>
        <option value="ok">✅ ঠিক আছে</option>
        <option value="low">⚠️ কম স্টক</option>
        <option value="out">❌ স্টক শেষ</option>
      </select>
      <select id="stockSort" onchange="renderStockTable()">
        <option value="name">নাম (A-Z)</option>
        <option value="stock_asc">স্টক (কম → বেশি)</option>
        <option value="stock_desc">স্টক (বেশি → কম)</option>
        <option value="status">অবস্থা (আগে সমস্যাযুক্ত)</option>
      </select>
      <div class="spacer"></div>
      <span style="color:var(--muted);font-size:12.5px;" id="stockCountLbl">মোট পণ্য: ${DB.products.length}</span>
    </div>
    <div class="card"><div class="tbl-wrap" id="stockTableWrap"></div></div>
  `;
  renderStockTable();
}
function renderStockTable(){
  const q = (document.getElementById('stockSearch')?.value||'').toLowerCase();
  const filterVal = document.getElementById('stockFilter')?.value||'all';
  const sortVal = document.getElementById('stockSort')?.value||'name';
  const statusOf = p=> p.stock<=0?'out':(p.stock<=p.lowStock?'low':'ok');
  let rows = DB.products.filter(p=>
    p.name.toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q) ||
    (p.shelf||'').toLowerCase().includes(q) || (p.color||'').toLowerCase().includes(q)
  );
  if(filterVal!=='all') rows = rows.filter(p=>statusOf(p)===filterVal);
  const statusRank = {out:0, low:1, ok:2};
  if(sortVal==='stock_asc') rows = [...rows].sort((a,b)=>a.stock-b.stock);
  else if(sortVal==='stock_desc') rows = [...rows].sort((a,b)=>b.stock-a.stock);
  else if(sortVal==='status') rows = [...rows].sort((a,b)=>statusRank[statusOf(a)]-statusRank[statusOf(b)] || a.name.localeCompare(b.name,'bn'));
  else rows = [...rows].sort((a,b)=>a.name.localeCompare(b.name,'bn'));
  const countLbl = document.getElementById('stockCountLbl');
  if(countLbl) countLbl.textContent = `দেখানো হচ্ছে: ${rows.length} / মোট পণ্য: ${DB.products.length}`;
  const canEdit = hasAccess('manager');
  document.getElementById('stockTableWrap').innerHTML = `
    <table>
      <tr><th>পণ্যের নাম / বিস্তারিত</th><th>শেলফ</th><th>একক</th><th class="num">গড় ক্রয়মূল্য (প্রতি প্রধান একক)</th><th class="num">বিক্রয়মূল্য</th><th class="num">স্টক</th><th>অবস্থা</th><th></th></tr>
      ${rows.map(p=>{
        const status = p.stock<=0?'<span class="pill bad">স্টক শেষ</span>':(p.stock<=p.lowStock?'<span class="pill warn">কম স্টক</span>':'<span class="pill ok">ঠিক আছে</span>');
        const detailBits = [p.brand, p.size, p.color].filter(Boolean).join(' • ');
        return `<tr>
          <td>
            <div>${esc(p.name)}</div>
            ${detailBits?`<div style="font-size:11px;color:var(--muted);margin-top:2px;">${esc(detailBits)}</div>`:''}
          </td>
          <td>${p.shelf?`<span class="pill" style="background:var(--panel-2);color:var(--gold-2);">${esc(p.shelf)}</span>`:'-'}</td>
          <td>${esc(p.unit)}</td><td class="num">${money(p.buyPrice)}</td><td class="num">${money(p.sellPrice)}</td>
          <td class="num"><b>${p.stock}</b>${(p.altUnit&&p.factor>0)?`<div style="font-size:10.5px;color:var(--muted);font-weight:600;">≈ ${r2(p.stock/p.factor)} ${esc(p.altUnit)}</div>`:''}</td><td>${status}</td>
          <td><button class="icon-btn" onclick="openStockLedger(${p.id})" title="ক্রয়/বিক্রয় হিস্টোরি (স্টক ট্রেস)">🕓</button>${canEdit?`<button class="icon-btn" onclick="openProductModal(${p.id})">✏️</button><button class="icon-btn" onclick="deleteProduct(${p.id})">🗑️</button>`:''}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);">কোনো পণ্য নেই</td></tr>`}
    </table>
  `;
}
/* ================= স্টক লেজার / মুভমেন্ট হিস্টোরি =================
   "স্টকে গড়মিল হলে সেটা যাচাই করার জন্য ক্রয় ভাউচার দরকার" — এই ফিচারটা
   ঠিক সেই সমাধান: যেকোনো পণ্যের 🕓 বাটনে চাপলে তার প্রতিটা স্টক-পরিবর্তনের
   (ক্রয়ে যোগ হওয়া / বিক্রয়ে বিয়োগ হওয়া / এন্ট্রি মোছার কারণে ফেরত) সম্পূর্ণ
   ইতিহাস এবং প্রতিটার সাথে সংশ্লিষ্ট ক্রয়/বিক্রয় ভাউচার নম্বর দেখা যায়। */
async function openStockLedger(productId){
  const p = DB.products.find(x=>x.id===productId);
  if(!p) return;
  openModal(`<h3>স্টক হিস্টোরি — ${esc(p.name)}${p.color?' ('+esc(p.color)+')':''}</h3>
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">বর্তমান স্টক: <b>${p.stock} ${esc(p.unit)}</b></div>
    <div id="stockLedgerBody" style="text-align:center;color:var(--muted);padding:20px;">লোড হচ্ছে...</div>
    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button></div>`);
  const moves = await loadStockMoves(productId);
  if(!modalOpen()) return;
  const body = document.getElementById('stockLedgerBody');
  if(moves===null){
    body.innerHTML = `<div style="color:var(--danger-text);font-size:13px;">হিস্টোরি লোড করা যায়নি। প্রথমবার এই ফিচার ব্যবহারের সময় Firestore-এ ইনডেক্স তৈরি হতে কিছুক্ষণ সময় লাগতে পারে — একটু পর আবার চেষ্টা করুন। (কনসোলে বিস্তারিত এরর দেখুন)</div>`;
    return;
  }
  if(!moves.length){ body.innerHTML = `<div style="color:var(--muted);font-size:13px;">এই পণ্যের জন্য এখনো কোনো লেনদেন রেকর্ড হয়নি (পুরনো এন্ট্রি এই ফিচার চালুর আগের হলে দেখা নাও যেতে পারে)।</div>`; return; }
  // running balance পেছন থেকে সামনে হিসাব করে দেখানো (সবচেয়ে পুরনো থেকে শুরু করে)
  const asc = [...moves].reverse();
  let bal = p.stock - moves.reduce((s,m)=>s+m.qty,0); // সবচেয়ে পুরনো এন্ট্রির আগের স্টক
  const rowsHtml = asc.map(m=>{
    bal += m.qty;
    const typeLabel = {
      'purchase':'✅ ক্রয় (স্টক বৃদ্ধি)', 'sale':'🔻 বিক্রয় (স্টক হ্রাস)',
      'purchase-void':'↩️ ক্রয় বাতিল/মোছা', 'sale-void':'↩️ বিক্রয় বাতিল/মোছা',
      'adjustment':'🛠️ ম্যানুয়াল সমন্বয়', 'opening':'🏁 ওপেনিং স্টক', 'sale-return':'↩️ বিক্রয় ফেরত (স্টকে যোগ)'
    }[m.type] || m.type;
    const refLabel = m.refType==='purchase' ? refNo('PUR', m.refId) : (m.refType==='sale' ? refNo('INV', m.refId) : (m.refType==='return' ? refNo('RET', m.refId) : '-'));
    return `<tr><td>${fmtDate(m.date||m.at)}</td><td>${typeLabel}</td><td>${refLabel}</td>
      <td class="num" style="color:${m.qty>=0?'var(--success)':'var(--danger-text)'}">${m.qty>=0?'+':''}${m.qty}</td>
      <td class="num"><b>${bal}</b></td><td style="font-size:11px;color:var(--muted);">${esc(m.by||'-')}</td></tr>`;
  }).reverse().join('');
  body.innerHTML = `<div class="tbl-wrap"><table>
    <tr><th>তারিখ</th><th>ধরন</th><th>ভাউচার #</th><th class="num">পরিমাণ</th><th class="num">স্টক ব্যালেন্স</th><th>করেছেন</th></tr>
    ${rowsHtml}
  </table></div>
  <div style="font-size:11px;color:var(--muted);margin-top:8px;">💡 সাম্প্রতিক সর্বোচ্চ ৩০০টি লেনদেন দেখানো হচ্ছে। বর্তমান স্টকের সাথে এই হিসাব না মিললে বুঝতে হবে এই আপডেটের আগে "পণ্য এডিট" থেকে হাতে স্টক বদলানো হয়ে থাকলে সেটা লগে নেই (এখন থেকে হাতে বদলালে "ম্যানুয়াল সমন্বয়" হিসেবে ধরা পড়ে)।</div>`;
}
function openProductModal(id){
  const p = id ? DB.products.find(x=>x.id===id) : null;
  openModal(`
    <div class="entry-head"><h3>${p?'✏️ পণ্য এডিট':'📦 নতুন পণ্য'}</h3></div>
    <div class="entry-body">
      <div class="form-row full"><label>পণ্যের নাম *</label><input id="pf_name" value="${p?esc(p.name):''}" placeholder="যেমন: সাবান"></div>
      <div class="form-row">
        <div><label>ব্র্যান্ড</label><input id="pf_brand" value="${p?esc(p.brand||''):''}" placeholder="যেমন: লাক্স"></div>
        <div><label>সাইজ/ওজন</label><input id="pf_size" value="${p?esc(p.size||''):''}" placeholder="যেমন: ৭৫ গ্রাম"></div>
      </div>
      <div class="form-row">
        <div><label>রং ${hintIc('ঐচ্ছিক। রং অনুযায়ী আলাদা স্টক চাইলে এখানে খালি রেখে ক্রয় এন্ট্রিতে প্রতিটা রং আলাদা লাইনে দিন — রং ও শেলফ নিজে তৈরি/আপডেট হবে।')}</label><input id="pf_color" value="${p?esc(p.color||''):''}" placeholder="যেমন: সাদা"></div>
        <div><label>শেলফ</label><input id="pf_shelf" value="${p?esc(p.shelf||''):''}" placeholder="যেমন: A3"></div>
      </div>
      <div class="form-row">
        <div><label>প্রধান একক ${hintIc('স্টক ও সব হিসাব এই এককে থাকে — যেমন কেজি, পিস, লিটার।')}</label><input id="pf_unit" value="${p?esc(p.unit):'পিস'}" placeholder="কেজি / পিস"></div>
        <div><label>${p?'বর্তমান স্টক':'ওপেনিং স্টক'} ${hintIc('এখন দোকানে এই পণ্য কতটা আছে (প্রধান এককে)। পরে ক্রয়-বিক্রয়ে নিজে বাড়বে/কমবে।', true)}</label><input id="pf_stock" type="number" inputmode="decimal" step="any" value="${p?p.stock:0}" placeholder="০"></div>
      </div>
      <div class="form-row">
        <div><label>বিকল্প একক ${hintIc('ঐচ্ছিক। যেমন বস্তা — ক্রয়/বিক্রয়ে এই এককেও লেখা যাবে। শুধু এক এককে কাজ হলে খালি রাখুন।')}</label><input id="pf_altUnit" value="${p?esc(p.altUnit||''):''}" placeholder="বস্তা / কার্টন"></div>
        <div><label>১ বিকল্প = কত? ${hintIc('১ বিকল্প একক = কত প্রধান একক। যেমন ১ বস্তা = ৫০ কেজি হলে ৫০ লিখুন।', true)}</label><input id="pf_factor" type="number" inputmode="decimal" step="any" min="0" value="${p&&p.factor?p.factor:''}" placeholder="যেমন ৫০"></div>
      </div>
      <div class="form-row">
        <div><label>${p?'গড় ক্রয়মূল্য':'ক্রয়মূল্য'} ${hintIc('প্রতি প্রধান এককের দাম'+(p?'।':' (ওপেনিং স্টকের, ঐচ্ছিক)। পরের ক্রয়ে গড় মূল্য নিজে হিসাব হয়।'))}</label><input id="pf_buy" type="number" inputmode="decimal" step="any" value="${p?p.buyPrice:''}" placeholder="৳ প্রতি একক"></div>
        <div><label>বিক্রয়মূল্য ${hintIc('প্রতি প্রধান এককের বিক্রয় দাম।', true)}</label><input id="pf_sell" type="number" inputmode="decimal" step="any" value="${p?p.sellPrice:''}" placeholder="৳ প্রতি একক"></div>
      </div>
      <div class="form-row full"><label>লো-স্টক লিমিট ${hintIc('স্টক এই সংখ্যার নিচে নামলে ড্যাশবোর্ড/স্টকে সতর্কতা দেখায়।')}</label><input id="pf_low" type="number" inputmode="decimal" value="${p?p.lowStock:5}"></div>
    </div>
    <div class="entry-foot"><div class="foot-btns" style="margin-left:auto;">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" id="modalSaveBtn" onclick="saveProduct(${p?p.id:'null'})">💾 সংরক্ষণ</button>
    </div></div>
  `);
  document.getElementById('modalBox').className = 'modal entry-modal';
  setTimeout(()=>document.getElementById('pf_name')?.focus(), 0);
}
function saveProduct(id){
  const name = document.getElementById('pf_name').value.trim();
  if(!name){ alert('পণ্যের নাম দিন'); return; }
  const altUnit = document.getElementById('pf_altUnit').value.trim();
  const factor = Number(document.getElementById('pf_factor').value)||0;
  if(altUnit && !(factor>0)){ alert('বিকল্প একক দিলে কনভার্সন ফ্যাক্টর (১ '+altUnit+' = কত প্রধান একক) অবশ্যই দিতে হবে'); document.getElementById('pf_factor').focus(); return; }
  const data = {
    name,
    brand: document.getElementById('pf_brand').value.trim(),
    size: document.getElementById('pf_size').value.trim(),
    color: document.getElementById('pf_color').value.trim(),
    shelf: document.getElementById('pf_shelf').value.trim(),
    unit: document.getElementById('pf_unit').value.trim()||'পিস',
    altUnit: altUnit, factor: altUnit ? factor : 0,
    stock: Number(document.getElementById('pf_stock').value)||0,
    buyPrice: Number(document.getElementById('pf_buy').value)||0,
    sellPrice: Number(document.getElementById('pf_sell').value)||0,
    lowStock: Number(document.getElementById('pf_low').value)||5
  };
  const batch = fsDB.batch();
  if(id){
    const old = DB.products.find(x=>x.id===id);
    batch.update(fsDB.collection('erp_products').doc(String(id)), data);
    // হাতে স্টক সংখ্যা বদলালে সেটা এখন স্টক-লেজারে "ম্যানুয়াল সমন্বয়" হিসেবে ধরা থাকে
    if(old && data.stock!==old.stock) logStockMove(batch, {productId:id, qty:r2(data.stock-old.stock), type:'adjustment', refType:'manual', refId:id, date:todayStr()});
  } else {
    const newId = genId();
    batch.set(fsDB.collection('erp_products').doc(String(newId)), {id:newId, ...data});
    if(data.stock!==0) logStockMove(batch, {productId:newId, qty:data.stock, type:'opening', refType:'manual', refId:newId, date:todayStr()});
  }
  fireWrite(batch.commit(), id?'পণ্য আপডেট':'নতুন পণ্য');
  closeModal();
}
function deleteProduct(id){
  if(!confirm('এই পণ্যটি মুছে ফেলতে চান?')) return;
  fireWrite(fsDB.collection('erp_products').doc(String(id)).delete(), 'পণ্য মোছা');
}

function productLabel(p){
  const bits = [p.brand, p.size, p.color].filter(Boolean).join(' ');
  return `${p.name}${bits?' — '+bits:''} (৳${p.sellPrice}, স্টক:${p.stock})`;
}
function purchaseProductLabel(p){
  const bits = [p.brand, p.size, p.color].filter(Boolean).join(' ');
  return `${p.name}${bits?' — '+bits:''} (ক্রয়মূল্য:৳${p.buyPrice}, স্টক:${p.stock})`;
}


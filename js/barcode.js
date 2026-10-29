/* ================= পণ্য নম্বর (কোড) • বারকোড লেবেল • ক্যামেরা স্ক্যানার • ভাউচার-নম্বর দিয়ে খোঁজা =================
   ১) প্রতিটা পণ্যের একটা ইউনিক "কোড" (নিজে তৈরি হয়, অথবা কোম্পানির বারকোড স্ক্যান/লিখে বসানো যায়)।
   ২) কোড থেকে Code128 বারকোড লেবেল প্রিন্ট (A4 শিট / ৫০×৩০ / ৩৮×২৫ মিমি রোল)।
   ৩) ক্যামেরা স্ক্যানার — মোবাইলের ক্যামেরায় (ব্রাউজারের নিজস্ব BarcodeDetector, না থাকলে lib/html5-qrcode)।
      USB/ব্লুটুথ বারকোড-গান আলাদা কিছু ছাড়াই চলে (ওটা কিবোর্ডের মতো কোড লিখে Enter দেয়)।
   ৪) ইনভয়েস/ক্রয়-ভাউচারের নম্বর (INV-/PUR-...) দিয়ে খোঁজা, রসিদে বারকোড ছাপা, স্ক্যান করে ভাউচার খোলা। */

/* ---------- ১) পণ্য কোড ---------- */
let _lastCodeReserved = 0;
function reserveProductCode(){
  let max = 100000;
  DB.products.forEach(p=>{ const c = String(p.code||''); if(/^\d{1,9}$/.test(c) && Number(c)>max) max = Number(c); });
  max = Math.max(max, _lastCodeReserved);
  _lastCodeReserved = max + 1;
  return String(_lastCodeReserved);
}
function findProductByCode(code){
  const c = String(code||'').trim().toLowerCase(); if(!c) return null;
  return DB.products.find(p=>String(p.code||'').toLowerCase()===c) || null;
}
function codeTaken(code, exceptId){
  const c = String(code||'').trim().toLowerCase(); if(!c) return null;
  return DB.products.find(p=>p.id!=exceptId && String(p.code||'').toLowerCase()===c) || null;
}
/* যেসব পণ্যের কোড নেই, সবাইকে একসাথে কোড দেওয়া (একবারের কাজ — পুরনো পণ্যের জন্য) */
async function assignMissingCodes(){
  if(!hasAccess('manager')) return;
  const miss = DB.products.filter(p=>!p.code);
  if(!miss.length){ toast('✅ সব পণ্যেরই কোড আছে'); return; }
  if(!confirm(`${miss.length}টি পণ্যে কোড নেই। এখন সবাইকে ক্রমিক কোড দেওয়া হবে — চালিয়ে যাবেন?`)) return;
  for(let i=0;i<miss.length;i+=400){
    const batch = fsDB.batch();
    miss.slice(i,i+400).forEach(p=>{ const c = reserveProductCode(); p.code = c; batch.update(fsDB.collection('erp_products').doc(String(p.id)), {code:c}); });
    await batch.commit();
  }
  logAudit('পণ্যে কোড বসানো', `${miss.length}টি`);
  toast(`✅ ${miss.length}টি পণ্যে কোড বসানো হয়েছে`);
  if(currentPage==='stock') renderStockTable();
}

/* ---------- ২) বারকোড ছবি (Code128) ---------- */
function isVoucherRef(t){ return /^(INV|PUR|RET|PRT|PMT)-\d{6}-\d{6}$/i.test(String(t||'').trim()); }
function barcodeSvg(text, heightPx, showText){
  try{
    if(typeof JsBarcode==='undefined' || !text) return '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    JsBarcode(svg, String(text), {format:'CODE128', width:2, height:heightPx||40, displayValue:showText!==false, fontSize:13, margin:2, background:'#ffffff', lineColor:'#000000'});
    const w = svg.getAttribute('width'), h = svg.getAttribute('height');
    if(!svg.getAttribute('viewBox') && w && h) svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.setAttribute('style','max-width:100%;height:'+((heightPx||40)+(showText!==false?16:4))+'px;');
    return svg.outerHTML;
  }catch(e){ console.warn('বারকোড তৈরি ব্যর্থ:', e); return ''; }
}
function barcodeCanvas(text, heightPx){
  try{
    if(typeof JsBarcode==='undefined' || !text) return null;
    const c = document.createElement('canvas');
    JsBarcode(c, String(text), {format:'CODE128', width:2, height:heightPx||44, displayValue:true, fontSize:14, margin:4, background:'#ffffff'});
    return c;
  }catch(e){ return null; }
}

/* ---------- ৩) লেবেল প্রিন্ট ---------- */
const LABEL_SIZES = {
  a4:     {name:'A4 শিট — ৩ কলাম (৬৪×৩৪ মিমি)', w:64, h:34, sheet:true},
  r5030:  {name:'রোল স্টিকার ৫০×৩০ মিমি',        w:50, h:30, sheet:false},
  r3825:  {name:'রোল স্টিকার ৩৮×২৫ মিমি',        w:38, h:25, sheet:false}
};
let labelPick = {};   // productId -> copies (শুধু টিক দেওয়া পণ্য)
function openLabelModal(ids){
  labelPick = {}; (ids||[]).forEach(i=>labelPick[i]=1);
  openModal(`
    <div class="entry-head"><h3>🏷️ বারকোড লেবেল প্রিন্ট</h3></div>
    <div class="entry-body">
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        <input id="lbl_search" type="text" placeholder="🔍 নাম / কোড / রং / শেলফ" oninput="labelRenderList()" style="flex:1;min-width:160px;">
        <button class="btn btn-outline small-btn" onclick="labelSelectAll(true)">সব টিক</button>
        <button class="btn btn-outline small-btn" onclick="labelSelectAll(false)">টিক মুছুন</button>
      </div>
      <div id="lbl_list" style="max-height:36vh;overflow:auto;border:1px solid var(--line);border-radius:8px;"></div>
      <div class="form-row" style="margin-top:10px;">
        <div><label>লেবেলের মাপ</label><select id="lbl_size">${Object.keys(LABEL_SIZES).map(k=>`<option value="${k}">${LABEL_SIZES[k].name}</option>`).join('')}</select></div>
        <div><label>কপি নির্ধারণ</label><select id="lbl_mode"><option value="each">নিচের ঘরের সংখ্যা অনুযায়ী</option><option value="stock">বর্তমান স্টকের সমান (সর্বোচ্চ ২০০)</option></select></div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin-top:6px;">
        <label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" id="lbl_price" checked> দাম ছাপুন</label>
        <label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" id="lbl_shop" checked> দোকানের নাম ছাপুন</label>
      </div>
      <div class="set-note" style="margin-top:8px;">কোড না থাকা পণ্যে প্রিন্টের সময় নিজে থেকে কোড বসে যাবে। প্রিন্ট ডায়ালগে "Margins: None" ও "Scale: 100%" রাখুন।</div>
    </div>
    <div class="entry-foot"><div class="foot-btns" style="margin-left:auto;">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" onclick="printLabels()">🖨️ লেবেল প্রিন্ট</button>
    </div></div>`);
  document.getElementById('modalBox').className = 'modal entry-modal';
  labelRenderList();
}
function labelRenderList(){
  const host = document.getElementById('lbl_list'); if(!host) return;
  const q = (document.getElementById('lbl_search')?.value||'').trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const rows = DB.products.filter(p=>{ const hay=[p.name,p.brand,p.size,p.color,p.shelf,p.code].filter(Boolean).join(' ').toLowerCase(); return words.every(w=>hay.includes(w)); })
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'bn')).slice(0,150);
  host.innerHTML = rows.map(p=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--line);">
      <input type="checkbox" ${labelPick[p.id]?'checked':''} onchange="labelToggle(${p.id},this.checked)">
      <div style="flex:1;min-width:0;font-size:13px;"><div>${esc(p.name)}</div><div style="font-size:11px;color:var(--muted);">${esc([p.brand,p.size,p.color].filter(Boolean).join(' • '))} ${p.code?'• #'+esc(p.code):'• (কোড নেই)'} • স্টক ${p.stock}</div></div>
      <input type="number" min="1" max="500" value="${labelPick[p.id]||1}" style="width:60px;" onchange="labelCopies(${p.id},this.value)" title="কপি সংখ্যা">
    </div>`).join('') || '<div style="padding:16px;text-align:center;color:var(--muted);">কোনো পণ্য নেই</div>';
}
function labelToggle(id, on){ if(on) labelPick[id] = labelPick[id]||1; else delete labelPick[id]; }
function labelCopies(id, v){ const n = Math.max(1, Math.min(500, Math.round(Number(v)||1))); if(labelPick[id]) labelPick[id] = n; else { labelPick[id] = n; labelRenderList(); } }
function labelSelectAll(on){
  const q = (document.getElementById('lbl_search')?.value||'').trim().toLowerCase(); const words = q.split(/\s+/).filter(Boolean);
  DB.products.forEach(p=>{ const hay=[p.name,p.brand,p.size,p.color,p.shelf,p.code].filter(Boolean).join(' ').toLowerCase(); if(words.every(w=>hay.includes(w))){ if(on) labelPick[p.id]=labelPick[p.id]||1; else delete labelPick[p.id]; } });
  labelRenderList();
}
async function printLabels(){
  const ids = Object.keys(labelPick).map(Number);
  if(!ids.length){ alert('অন্তত একটি পণ্যে টিক দিন'); return; }
  const sz = LABEL_SIZES[document.getElementById('lbl_size').value] || LABEL_SIZES.a4;
  const mode = document.getElementById('lbl_mode').value;
  const showPrice = document.getElementById('lbl_price').checked, showShop = document.getElementById('lbl_shop').checked;
  // কোড না থাকলে এখনই বসিয়ে নিই
  const batch = fsDB.batch(); let need = 0;
  ids.forEach(id=>{ const p = DB.products.find(x=>x.id===id); if(p && !p.code){ p.code = reserveProductCode(); batch.update(fsDB.collection('erp_products').doc(String(id)), {code:p.code}); need++; } });
  if(need) fireWrite(batch.commit(), 'পণ্যের কোড');
  const shop = esc((DB.settings&&DB.settings.shopName)||'');
  let labels = '';
  ids.forEach(id=>{
    const p = DB.products.find(x=>x.id===id); if(!p) return;
    const n = mode==='stock' ? Math.max(1, Math.min(200, Math.round(p.stock)||1)) : (labelPick[id]||1);
    const title = esc(p.name + ([p.size,p.color].filter(Boolean).length ? ' — '+[p.size,p.color].filter(Boolean).join(' ') : ''));
    const one = `<div class="lbl" style="width:${sz.w}mm;height:${sz.h}mm;box-sizing:border-box;padding:1.2mm 1.5mm;overflow:hidden;text-align:center;color:#000;background:#fff;${sz.sheet?'display:inline-block;vertical-align:top;':'page-break-after:always;'}break-inside:avoid;">
      ${showShop?`<div style="font-size:6.5pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${shop}</div>`:''}
      <div style="font-size:8pt;font-weight:700;line-height:1.15;max-height:2.3em;overflow:hidden;">${title}</div>
      <div style="margin-top:.5mm;">${barcodeSvg(p.code, sz.h>=30?34:26, true)}</div>
      ${showPrice?`<div style="font-size:9pt;font-weight:800;margin-top:.3mm;">${money(p.sellPrice)}</div>`:''}
    </div>`;
    for(let i=0;i<n;i++) labels += one;
  });
  const pa = document.getElementById('printArea');
  let st = document.getElementById('pageSizeStyle'); if(!st){ st = document.createElement('style'); st.id='pageSizeStyle'; document.head.appendChild(st); }
  st.textContent = sz.sheet ? '@media print{@page{size:A4;margin:8mm;}}' : `@media print{@page{size:${sz.w}mm ${sz.h}mm;margin:0;}}`;
  pa.className = ''; pa.style.padding = '0';
  pa.innerHTML = `<div style="font-family:'Noto Sans Bengali',sans-serif;">${labels}</div>`;
  closeModal();
  setTimeout(()=>{ window.print(); pa.style.padding = ''; }, 150);
}

/* ---------- ৪) ক্যামেরা স্ক্যানার ---------- */
let _scan = null;
function scanBeep(){
  try{ const c = new (window.AudioContext||window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 1100; g.gain.value = .08; o.start(); setTimeout(()=>{ o.stop(); c.close(); }, 110); }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate(60); }catch(e){}
}
function closeScanner(){
  const s = _scan; _scan = null;
  if(s && s.stop){ try{ s.stop(); }catch(e){} }
  const ov = document.getElementById('scanOverlay'); if(ov) ov.remove();
}
function scanSetMsg(t, color){ const m = document.getElementById('scanMsg'); if(m){ m.textContent = t; m.style.color = color||'var(--muted)'; } }
function scanHit(text){
  const s = _scan; if(!s) return;
  text = String(text||'').trim(); if(!text) return;
  const now = Date.now();
  if(text===s.last && now-s.lastAt<1800) return;       // একই কোড বারবার ধরা ঠেকাতে
  s.last = text; s.lastAt = now;
  scanBeep();
  const cb = s.onResult, cont = s.continuous;
  if(!cont) closeScanner(); else scanSetMsg('✔ '+text+' — আরও স্ক্যান করুন, শেষ হলে "বন্ধ" চাপুন', 'var(--success)');
  try{ cb(text); }catch(e){ console.error(e); }
}
function scanManualGo(){ const i = document.getElementById('scanManual'); if(i && i.value.trim()){ const v = i.value; i.value=''; if(_scan){ _scan.last=''; } scanHit(v); } }
function openScanner(onResult, opts){
  opts = opts||{};
  closeScanner();
  if(!window.isSecureContext && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){
    alert('ক্যামেরা চালাতে https:// ঠিকানা লাগে (GitHub Pages/Netlify-তে হোস্ট করলে স্বয়ংক্রিয়ভাবে https হয়)।'); return;
  }
  const ov = document.createElement('div'); ov.id = 'scanOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:12px;';
  ov.innerHTML = `<div style="width:min(480px,100%);background:var(--panel,#122924);color:var(--ink,#fff);border-radius:14px;padding:12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b>📷 ${esc(opts.title||'বারকোড/QR স্ক্যান')}</b><button class="btn btn-outline small-btn" onclick="closeScanner()">✖ বন্ধ</button></div>
    <div style="position:relative;width:100%;aspect-ratio:4/3;background:#000;border-radius:10px;overflow:hidden;">
      <video id="scanVideo" playsinline muted style="width:100%;height:100%;object-fit:cover;display:none;"></video>
      <div id="scanH5" style="width:100%;height:100%;display:none;"></div>
      <div style="position:absolute;left:10%;right:10%;top:36%;height:28%;border:2px solid #4ade80;border-radius:8px;pointer-events:none;"></div>
    </div>
    <div id="scanMsg" style="font-size:12.5px;color:var(--muted);margin:8px 0;text-align:center;">ক্যামেরা চালু হচ্ছে...</div>
    <div style="display:flex;gap:6px;"><input id="scanManual" type="text" placeholder="অথবা কোড হাতে লিখুন" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();scanManualGo();}"><button class="btn btn-gold small-btn" onclick="scanManualGo()">ঠিক আছে</button></div>
  </div>`;
  document.body.appendChild(ov);
  _scan = {onResult, continuous:!!opts.continuous, last:'', lastAt:0, stop:null};
  const mine = _scan;
  (async()=>{
    try{
      if('BarcodeDetector' in window){
        let formats = ['code_128','ean_13','ean_8','upc_a','upc_e','code_39','itf','qr_code'];
        try{ const sup = await BarcodeDetector.getSupportedFormats(); formats = formats.filter(f=>sup.includes(f)); }catch(e){}
        if(formats.length){
          const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}}, audio:false});
          if(_scan!==mine){ stream.getTracks().forEach(t=>t.stop()); return; }
          const v = document.getElementById('scanVideo'); v.style.display = 'block'; v.srcObject = stream; await v.play();
          const det = new BarcodeDetector({formats}); let stopped = false;
          mine.stop = ()=>{ stopped = true; stream.getTracks().forEach(t=>t.stop()); };
          scanSetMsg('বারকোডটা সবুজ বক্সের ভেতরে ধরুন');
          const loop = async()=>{ if(stopped || _scan!==mine) return; try{ const r = await det.detect(v); if(r.length) scanHit(r[0].rawValue); }catch(e){} setTimeout(loop, 130); };
          loop(); return;
        }
      }
      // বিকল্প: html5-qrcode (আইফোন/সাফারিসহ) — প্রথমবার ব্যবহারে লোড হয়
      if(typeof Html5Qrcode==='undefined') await loadScriptOnce('lib/html5-qrcode.min.js');
      if(_scan!==mine) return;
      document.getElementById('scanH5').style.display = 'block';
      const h = new Html5Qrcode('scanH5', {verbose:false});
      await h.start({facingMode:'environment'}, {fps:10, qrbox:(w,hh)=>({width:Math.floor(Math.min(w*0.85,340)), height:Math.floor(Math.min(hh*0.55,170))})}, txt=>scanHit(txt), ()=>{});
      mine.stop = ()=>{ h.stop().then(()=>h.clear()).catch(()=>{}); };
      scanSetMsg('বারকোডটা বক্সের ভেতরে ধরুন');
    }catch(err){
      const n = err && err.name;
      scanSetMsg(n==='NotAllowedError' ? '❌ ক্যামেরার অনুমতি দেওয়া হয়নি — ব্রাউজারের সাইট-সেটিংসে ক্যামেরা "Allow" করুন, অথবা নিচে কোড হাতে লিখুন।' : '❌ ক্যামেরা চালু করা যায়নি ('+(n||err.message||err)+') — নিচে কোড হাতে লিখুন।', 'var(--danger-text)');
    }
  })();
}

/* ---------- ৫) এন্ট্রি বারে স্ক্যান / বারকোড-গান ---------- */
function scanForEntry(kind){
  openScanner(code=>entryScanCode(kind, code), {continuous: kind==='sale', title:'পণ্যের বারকোড স্ক্যান'});
}
function entryScanCode(kind, code){
  const p = findProductByCode(code);
  if(!p){
    toast('❌ এই কোডে কোনো পণ্য নেই: '+code);
    if(kind==='purchase'){ openQuickProduct(); const c = document.getElementById('np_code'); if(c){ c.value = code; const d = c.closest('details'); if(d) d.open = true; } }
    return;
  }
  entryPick(kind, p.id);
  if(kind==='sale'){
    const ok = entryAdd('sale');
    const msg = eEl('sale','Msg'); 
    if(ok) toast('✅ '+p.name); else if(msg && msg.textContent) toast('⚠️ '+msg.textContent);
  }
}

/* ---------- ৬) ভাউচার নম্বর দিয়ে খোঁজা ---------- */
const REF_COLL = {INV:'erp_sales', PUR:'erp_purchases', RET:'erp_returns', PRT:'erp_purchase_returns', PMT:'erp_due_payments'};
function parseRefStart(text){
  const m = /^(INV|PUR|RET|PRT|PMT)-(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/i.exec(String(text||'').trim());
  if(!m) return null;
  const start = new Date(2000+Number(m[2]), Number(m[3])-1, Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7])).getTime();
  return {prefix:m[1].toUpperCase(), start, end:start+1000};
}
async function fetchVoucherByRef(text){
  const r = parseRefStart(text); if(!r) return null;
  const snap = await fsDB.collection(REF_COLL[r.prefix]).where('id','>=',r.start).where('id','<',r.end).get();
  return {prefix:r.prefix, docs:snap.docs.map(d=>d.data())};
}
function voucherFilter(rows, kind){
  const inp = document.getElementById(kind==='sale'?'saleSearch':'purSearch');
  const q = (inp&&inp.value||'').trim().toLowerCase(); if(!q) return rows;
  const pre = kind==='sale' ? 'INV' : 'PUR', words = q.split(/\s+/).filter(Boolean);
  return rows.filter(r=>{
    const prods = (r.items||[]).map(it=>{ const p = DB.products.find(x=>x.id===it.productId); return p ? [p.name,p.code,p.color].filter(Boolean).join(' ') : ''; }).join(' ');
    const hay = [refNo(pre,r.id), kind==='sale'?r.customerName:r.supplierName, r.createdBy, prods].join(' ').toLowerCase();
    return words.every(w=>hay.includes(w));
  });
}
let _vsTimer = null;
function voucherSearchInput(kind){ clearTimeout(_vsTimer); _vsTimer = setTimeout(()=>voucherSearchRun(kind), 250); }
async function voucherSearchRun(kind){
  const inp = document.getElementById(kind==='sale'?'saleSearch':'purSearch'); if(!inp) return;
  const q = inp.value.trim(), re = parseRefStart(q);
  const redraw = ()=> kind==='sale' ? renderSalesTable(true) : renderPurchaseTable(true);
  if(re && re.prefix===(kind==='sale'?'INV':'PUR')){
    const rows = kind==='sale' ? currentSalesRows() : currentPurchaseRows();
    if(!rows.some(r=>r.id>=re.start && r.id<re.end)){
      try{
        const res = await fetchVoucherByRef(q);
        if(res && res.docs.length){
          const d = res.docs[0].date;      // ভাউচারের নিজের তারিখে গিয়ে সেই দিনের তালিকা লোড করা
          document.getElementById(kind==='sale'?'saleFrom':'purFrom').value = d; document.getElementById(kind==='sale'?'saleTo':'purTo').value = d;
          kind==='sale' ? renderSalesTable() : renderPurchaseTable(); return;
        } else toast('এই নম্বরের কোনো ভাউচার পাওয়া যায়নি');
      }catch(e){ console.warn(e); toast('খুঁজতে সমস্যা — ইন্টারনেট/Rules দেখুন'); }
    }
  }
  redraw();
}
function scanVoucher(kind){
  openScanner(text=>{
    const inp = document.getElementById(kind==='sale'?'saleSearch':'purSearch'); if(!inp) return;
    inp.value = text; voucherSearchRun(kind);
  }, {title: kind==='sale' ? 'ইনভয়েসের বারকোড স্ক্যান' : 'ক্রয়-ভাউচারের বারকোড স্ক্যান'});
}
function voucherSearchHtml(kind){
  const id = kind==='sale' ? 'saleSearch' : 'purSearch';
  return `<input type="text" id="${id}" placeholder="🔍 ${kind==='sale'?'ইনভয়েস':'ভাউচার'} নম্বর / নাম / পণ্য / কোড" oninput="voucherSearchInput('${kind}')" onkeydown="if(event.key==='Enter'){event.preventDefault();voucherSearchRun('${kind}');}" style="min-width:200px;flex:1;" title="পুরো নম্বর (যেমন ${kind==='sale'?'INV':'PUR'}-261029-143055) লিখলে বা স্ক্যান করলে অন্য তারিখের ভাউচারও নিজে খুঁজে আনে">
    <button class="btn btn-outline small-btn" onclick="scanVoucher('${kind}')" title="বারকোড স্ক্যান">📷</button>`;
}

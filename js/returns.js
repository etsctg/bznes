/* ================= বিক্রয় ফেরত + ছবি-শেয়ার ইঞ্জিন =================
   ফেরত আসা পণ্য স্টকে ফেরত, বাকি/নগদ ফেরতের হিসাব, ফেরত-রশিদ, আর
   ভাউচারকে PNG ছবি বানিয়ে হোয়াটসঅ্যাপ ইত্যাদিতে শেয়ার করার কোড। */

/* ================= বিক্রয় ফেরত =================
   ফেরত আসা পণ্য স্টকে যোগ হয়, বিক্রয়/লাভের হিসাব থেকে বাদ যায়। ভাউচারে বাকি থাকলে ফেরতের মূল্য
   আগে সেখান থেকে কাটা হয়, বাকিটুকু নগদ ফেরত। প্রতিটা ফেরতের আলাদা রশিদ (RET-...) হয়। */
let returnCtx = null;
function openReturnModal(saleId){
  const s = currentSalesRows().find(x=>x.id===saleId);
  if(!s){ alert('এন্ট্রিটি বর্তমান তালিকায় পাওয়া যায়নি — তারিখ রেঞ্জ বদলে আবার চেষ্টা করুন।'); return; }
  if(!canEditVoucher(s)){ alert('ফেরত নিতে হলে ভাউচারের এন্ট্রিকারী বা ম্যানেজার/এডমিন হতে হবে।'); return; }
  const sub = s.subtotal || s.items.reduce((a,it)=>a+it.price*it.qty,0);
  const f = sub>0 ? s.total/sub : 1;
  const ret = s.retQty || {};
  returnCtx = {sale:s, f, value:0, applied:0, cash:0};
  const rows = s.items.map((it,i)=>{
    const p = DB.products.find(x=>x.id===it.productId);
    const already = ret[it.productId] || 0, max = r2(it.qty - already);
    return `<tr><td>${esc(p?p.name:'মুছে ফেলা পণ্য')}</td><td class="num">${it.qty} ${esc(p?p.unit:'')}</td><td class="num">${already||'-'}</td>
      <td class="num"><input class="ret-in" type="number" inputmode="decimal" step="any" min="0" max="${max}" data-i="${i}" value="0" ${max<=0?'disabled':''} oninput="calcReturn()" onfocus="this.select()"></td></tr>`;
  }).join('');
  openModal(`
    <div class="entry-head"><h3>↩️ বিক্রয় ফেরত — ${refNo('INV', s.id)}</h3></div>
    <div class="entry-body">
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">কাস্টমার: <b style="color:var(--ink);">${esc(s.customerName)}</b> • ভাউচারে বাকি: <b style="color:var(--ink);">${money(s.due)}</b> ${hintIc('ফেরতের মূল্য ডিসকাউন্টসহ আনুপাতিক হারে হিসাব হয়। ভাউচারে বাকি থাকলে আগে সেখান থেকে কাটা হয়, বাকিটা নগদ ফেরত দিতে হয়।')}</div>
      <div class="tbl-wrap"><table>
        <tr><th>পণ্য</th><th class="num">বিক্রিত</th><th class="num">আগে ফেরত</th><th class="num">এখন ফেরত</th></tr>
        ${rows}
      </table></div>
      <div class="sum-compact" style="margin-top:10px;">
        <div class="sum-line"><span>ফেরতের মূল্য</span><b id="ret_value">৳0</b></div>
        <div class="sum-line"><span>বাকি থেকে কাটা যাবে</span><b id="ret_due">৳0</b></div>
        <div class="sum-line"><span>💵 নগদ ফেরত দিন</span><b id="ret_cash" style="color:var(--success);">৳0</b></div>
        <div class="sum-inputs" style="grid-template-columns:1fr 1.6fr;">
          <div><label>তারিখ</label><input id="ret_date" type="date" value="${todayStr()}"></div>
          <div><label>কারণ/নোট</label><input id="ret_note" type="text" placeholder="যেমন: নষ্ট/ভুল পণ্য"></div>
        </div>
      </div>
    </div>
    <div class="entry-foot"><div class="foot-btns" style="margin-left:auto;">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" onclick="saveReturn()">↩️ ফেরত সংরক্ষণ</button>
    </div></div>`);
  document.getElementById('modalBox').className = 'modal entry-modal';
  calcReturn();
}
function calcReturn(){
  const c = returnCtx; if(!c) return;
  let value = 0;
  document.querySelectorAll('.ret-in').forEach(inp=>{
    const it = c.sale.items[Number(inp.dataset.i)], max = Number(inp.max)||0;
    let q = Number(inp.value)||0; if(q<0) q = 0; if(q>max){ q = max; inp.value = max; }
    value += q * it.price * c.f;
  });
  c.value = r2(value); c.applied = r2(Math.min(c.sale.due, c.value)); c.cash = r2(c.value - c.applied);
  setField('ret_value', money(c.value)); setField('ret_due', money(c.applied)); setField('ret_cash', money(c.cash));
}
function saveReturn(){
  const c = returnCtx; if(!c) return;
  calcReturn();
  const s = c.sale, items = [];
  document.querySelectorAll('.ret-in').forEach(inp=>{
    const q = Number(inp.value)||0; if(q<=0) return;
    const it = s.items[Number(inp.dataset.i)], p = DB.products.find(x=>x.id===it.productId);
    items.push({productId:it.productId, qty:q, price:r2(it.price*c.f), buyPrice:(it.buyPrice!=null?it.buyPrice:(p?p.buyPrice:0))});
  });
  if(!items.length){ alert('অন্তত একটি পণ্যের ফেরত পরিমাণ দিন'); return; }
  const date = document.getElementById('ret_date').value || todayStr();
  const note = document.getElementById('ret_note').value.trim();
  const retId = genId();
  const cogsRet = r2(items.reduce((a,i)=>a+i.buyPrice*i.qty,0));
  const batch = fsDB.batch();
  const net = {}; items.forEach(i=>{ net[i.productId] = (net[i.productId]||0) + i.qty; });
  Object.keys(net).forEach(pid=>{ const p = DB.products.find(x=>x.id==pid); if(p) batch.update(fsDB.collection('erp_products').doc(String(pid)), {stock: _inc(net[pid])}); });
  items.forEach(i=>logStockMove(batch, {productId:i.productId, qty:i.qty, type:'sale-return', refType:'return', refId:retId, date}));
  if(c.applied>0){ const cust = DB.customers.find(x=>x.id===s.customerId); if(cust) batch.update(fsDB.collection('erp_customers').doc(String(s.customerId)), {due: _inc(-c.applied)}); }
  const newRet = {...(s.retQty||{})}; items.forEach(i=>{ newRet[i.productId] = r2((newRet[i.productId]||0) + i.qty); });
  const upd = {retQty:newRet, returnedTotal:r2((s.returnedTotal||0)+c.value), returnedCogs:r2((s.returnedCogs||0)+cogsRet), refundedCash:r2((s.refundedCash||0)+c.cash), due:r2(s.due - c.applied), returnCount:(s.returnCount||0)+1};
  batch.update(fsDB.collection('erp_sales').doc(String(s.id)), upd);
  const rec = {id:retId, date, saleId:s.id, saleRef:refNo('INV', s.id), customerId:s.customerId, customerName:s.customerName, items, amount:c.value, appliedToDue:c.applied, cashRefund:c.cash, cogs:cogsRet, note, createdBy:currentUser?currentUser.name:'', at:new Date().toISOString()};
  batch.set(fsDB.collection('erp_returns').doc(String(retId)), rec);
  applyStatsDelta(batch, date, {totalSales:-c.value, totalCogs:-cogsRet, totalReturns:c.value, returnCount:1});
  logAudit('বিক্রয় ফেরত', `${refNo('INV', s.id)} — ${money(c.value)} (নগদ ফেরত ${money(c.cash)})`);
  Object.assign(s, upd);   // বর্তমান তালিকার এন্ট্রিটাও সাথে সাথে হালনাগাদ
  fireWrite(batch.commit(), 'বিক্রয় ফেরত');
  returnCtx = null;
  showReturnReceiptOption(rec);
}
function buildReturnModel(rec){
  const items = rec.items.map(it=>{ const p = DB.products.find(x=>x.id===it.productId); return {name: esc(p?p.name:'—'), qty: esc(`${it.qty} ${p?p.unit:''}`), rate: money(it.price), sub: money(r2(it.price*it.qty))}; });
  const totals = [{label:'ফেরতের মূল্য', value:money(rec.amount), bold:true}];
  if(rec.appliedToDue>0) totals.push({label:'বাকি থেকে কাটা হলো', value:money(rec.appliedToDue)});
  totals.push({label:'নগদ ফেরত দেওয়া হলো', value:money(rec.cashRefund), bold:true});
  const cust = DB.customers.find(c=>c.id===rec.customerId);
  const ref = refNo('RET', rec.id);
  return {title:'বিক্রয় ফেরত রশিদ', file:ref,
    meta:[['রশিদ #',ref],['তারিখ',fmtDate(rec.date)],['কাস্টমার',esc(rec.customerName)],['মূল ইনভয়েস',esc(rec.saleRef)]],
    items, totals, rateLabel:'দর', by: maskUser(rec.createdBy)||'', footer: esc(DB.settings?.footer||'ধন্যবাদ।'),
    waPhone: waNumber(cust&&cust.phone),
    waText: `${DB.settings?.shopName||'ব্যবসা ম্যানেজার'}\nবিক্রয় ফেরত ${ref} (${fmtDate(rec.date)})\nমূল ইনভয়েস: ${rec.saleRef}\nফেরতের মূল্য: ${money(rec.amount)}\nনগদ ফেরত: ${money(rec.cashRefund)}`};
}
function printReturnReceipt(rec){ printDoc(buildReturnModel(rec)); }
function shareReturnReceipt(rec){ shareDoc(buildReturnModel(rec)); }
function showReturnReceiptOption(rec){
  openModal(`
    <h3>✅ ফেরত সংরক্ষিত হয়েছে</h3>
    <div style="font-size:14px;line-height:1.9;margin-bottom:10px;">
      <div><b>${esc(rec.customerName)}</b> — ${esc(rec.saleRef)}</div>
      <div>ফেরতের মূল্য: <b>${money(rec.amount)}</b></div>
      ${rec.appliedToDue>0?`<div>বাকি থেকে কাটা: <b>${money(rec.appliedToDue)}</b></div>`:''}
      <div>💵 নগদ ফেরত দিন: <b style="color:var(--success);">${money(rec.cashRefund)}</b></div>
      <div style="font-size:12px;color:var(--muted);">ফেরত আসা পণ্য স্টকে যোগ হয়েছে।</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
      <button class="btn btn-outline" onclick='shareReturnReceipt(${attrJson(rec)})'>📤 শেয়ার</button>
      <button class="btn btn-gold" onclick='printReturnReceipt(${attrJson(rec)})'>🖨️ রশিদ প্রিন্ট</button>
    </div>`);
}
function printInvoice(id){ const s = currentSalesRows().find(x=>x.id===id); if(!s){ alert('এন্ট্রিটি খুঁজে পাওয়া যায়নি (হয়তো তালিকা রিফ্রেশ করা দরকার)'); return; } printDoc(buildInvoiceModel(s)); }
function printPurchaseVoucher(id){ const p = currentPurchaseRows().find(x=>x.id===id); if(!p){ alert('এন্ট্রিটি খুঁজে পাওয়া যায়নি (হয়তো তালিকা রিফ্রেশ করা দরকার)'); return; } printDoc(buildPurchaseModel(p)); }
function printDuePaymentReceipt(rec){ printDoc(buildDueModel(rec)); }
function shareInvoice(id){ const s = currentSalesRows().find(x=>x.id===id); if(!s){ alert('এন্ট্রিটি খুঁজে পাওয়া যায়নি'); return; } shareDoc(buildInvoiceModel(s)); }
function sharePurchaseVoucher(id){ const p = currentPurchaseRows().find(x=>x.id===id); if(!p){ alert('এন্ট্রিটি খুঁজে পাওয়া যায়নি'); return; } shareDoc(buildPurchaseModel(p)); }
function shareDuePaymentReceipt(rec){ shareDoc(buildDueModel(rec)); }

/* ===== ভাউচারকে ছবি (PNG) বানিয়ে শেয়ার — থার্মাল রসিদের মতো সুন্দর লেআউটে =====
   ফোনে "শেয়ার" চাপলে হোয়াটসঅ্যাপ/মেসেঞ্জার ইত্যাদি বেছে সরাসরি ছবি পাঠানো যায়।
   ডিভাইস সরাসরি ফাইল-শেয়ার না করলে ছবি ডাউনলোড হয়, সেটা হোয়াটসঅ্যাপে attach করা যায়। */
async function renderReceiptCanvas(model){
  try{ await document.fonts.load('700 16px "Noto Sans Bengali"'); await document.fonts.load('500 16px "Noto Sans Bengali"'); await document.fonts.ready; }catch(e){}
  const FF = '"Noto Sans Bengali","Segoe UI",Tahoma,Arial,sans-serif';
  const W = 420, S = 2, PAD = 20, IW = W - PAD*2;
  const st = DB.settings || {};
  const m = document.createElement('canvas').getContext('2d');
  const font = (w,sz)=>`${w} ${sz}px ${FF}`;
  function wrap(text, maxW, f){
    m.font = f; const out = [];
    String(text).split('\n').forEach(par=>{
      const words = par.split(/\s+/).filter(Boolean); let line = '';
      if(!words.length){ out.push(''); return; }
      words.forEach(w=>{
        const t = line ? line+' '+w : w;
        if(m.measureText(t).width <= maxW){ line = t; return; }
        if(line) out.push(line);
        if(m.measureText(w).width > maxW){
          let chunk = ''; for(const ch of w){ if(m.measureText(chunk+ch).width > maxW){ out.push(chunk); chunk = ch; } else chunk += ch; }
          line = chunk;
        } else line = w;
      });
      if(line) out.push(line);
    });
    return out;
  }
  const cmds = []; let y = PAD + 6;
  const center = (text, w, sz, color)=>{ wrap(text, IW, font(w,sz)).forEach(l=>{ cmds.push({t:'c', text:l, y:y+sz, f:font(w,sz), color}); y += sz*1.42; }); };
  const hr = ()=>{ y += 5; cmds.push({t:'hr', y}); y += 11; };
  const row = (l, r, w, sz, color)=>{
    m.font = font(w,sz); const rw = m.measureText(r).width;
    const lines = wrap(l, Math.max(70, IW - rw - 14), font(w,sz));
    lines.forEach((ln,i)=>{
      cmds.push({t:'l', text:ln, x:PAD, y:y+sz, f:font(w,sz), color});
      if(i===0) cmds.push({t:'r', text:r, x:W-PAD, y:y+sz, f:font(w,sz), color});
      y += sz*1.5;
    });
  };
  center(st.shopName || 'ব্যবসা ম্যানেজার', 800, 22, '#111');
  if(st.address) center(st.address, 500, 13, '#444');
  if(st.phone) center('ফোন: '+st.phone, 500, 13, '#444');
  hr();
  center(plain(model.title), 800, 16, '#111'); y += 2;
  (model.meta||[]).forEach(([l,v])=>row(plain(l), plain(v), 500, 13.5, '#222'));
  if((model.items||[]).length){
    hr();
    model.items.forEach(it=>{
      wrap(plain(it.name), IW, font(800,14.5)).forEach(ln=>{ cmds.push({t:'l', text:ln, x:PAD, y:y+14.5, f:font(800,14.5), color:'#111'}); y += 14.5*1.45; });
      // দুই-লাইনের "পরিমাণ × দর" ফরম্যাট (ইনভয়েস/ভাউচার) আর এক-লাইনের "শুধু টাকা" ফরম্যাট (ক্যাশবুক) — দুটোই চলে
      if(it.sub){
        if(it.qty || it.rate) row(`${plain(it.qty)} × ${plain(it.rate)}`, plain(it.sub), 500, 13.5, '#333');
        else row('', plain(it.sub), 500, 13.5, '#333');
      }
      y += 3;
    });
  }
  hr();
  (model.totals||[]).forEach(t=>row(plain(t.label), plain(t.value), t.bold?800:600, t.bold?16:14, '#111'));
  if(model.by) { y += 4; center('গ্রহণ করেছেন: '+model.by, 500, 12, '#555'); }
  hr();
  if(isVoucherRef(model.file)){
    const bc = barcodeCanvas(model.file, 44);
    if(bc){ const bw = Math.min(IW, bc.width/2), bh = bw*bc.height/bc.width; cmds.push({t:'bar', c:bc, x:(W-bw)/2, y, w:bw, h:bh}); y += bh + 8; }
  }
  center(plain(model.footer||''), 500, 12.5, '#555');
  const H = Math.ceil(y + PAD);
  const c = document.createElement('canvas'); c.width = W*S; c.height = H*S;
  const ctx = c.getContext('2d'); ctx.scale(S,S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#12805f'; ctx.fillRect(0,0,W,6);
  ctx.textBaseline = 'alphabetic';
  cmds.forEach(k=>{
    if(k.t==='bar'){ ctx.drawImage(k.c, k.x, k.y, k.w, k.h); return; }
    if(k.t==='hr'){ ctx.save(); ctx.setLineDash([4,3]); ctx.strokeStyle = '#888'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD,k.y); ctx.lineTo(W-PAD,k.y); ctx.stroke(); ctx.restore(); return; }
    ctx.font = k.f; ctx.fillStyle = k.color;
    if(k.t==='c'){ ctx.textAlign='center'; ctx.fillText(k.text, W/2, k.y); }
    else if(k.t==='l'){ ctx.textAlign='left'; ctx.fillText(k.text, k.x, k.y); }
    else { ctx.textAlign='right'; ctx.fillText(k.text, k.x, k.y); }
  });
  return c;
}
let shareState = null;
async function shareDoc(model){
  toast('⏳ ছবি তৈরি হচ্ছে...');
  let canvas;
  try{ canvas = await renderReceiptCanvas(model); }catch(e){ alert('ছবি তৈরি করা যায়নি: '+e.message); return; }
  canvas.toBlob(blob=>{
    if(!blob){ alert('ছবি তৈরি করা যায়নি'); return; }
    if(shareState && shareState.url) URL.revokeObjectURL(shareState.url);
    shareState = {blob, url: URL.createObjectURL(blob), model};
    openModal(`
      <div class="entry-head"><h3>📤 ভাউচার শেয়ার</h3></div>
      <div class="entry-body" style="text-align:center;"><img class="share-img" src="${shareState.url}" alt="ভাউচার">
        <div class="set-note">"শেয়ার" চাপলে হোয়াটসঅ্যাপ/মেসেঞ্জার ইত্যাদি বেছে সরাসরি ছবিটা পাঠানো যায়। সরাসরি শেয়ার না হলে "ডাউনলোড" করে হোয়াটসঅ্যাপে attach করুন।</div></div>
      <div class="entry-foot"><div class="foot-btns" style="flex-wrap:wrap;width:100%;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
        <button class="btn btn-outline" onclick="downloadShareImage()">⬇️ ডাউনলোড</button>
        <button class="btn btn-outline" onclick="whatsappText()">💬 টেক্সট (WhatsApp)</button>
        <button class="btn btn-gold" onclick="doShareImage()">📤 শেয়ার</button>
      </div></div>`);
    document.getElementById('modalBox').className = 'modal entry-modal';
  }, 'image/png');
}
function downloadShareImage(){
  if(!shareState) return;
  const a = document.createElement('a'); a.href = shareState.url; a.download = (shareState.model.file||'voucher') + '.png';
  document.body.appendChild(a); a.click(); a.remove();
  toast('⬇️ ছবি ডাউনলোড হয়েছে');
}
async function doShareImage(){
  if(!shareState) return;
  const file = new File([shareState.blob], (shareState.model.file||'voucher')+'.png', {type:'image/png'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title: plain(shareState.model.title), text: shareState.model.waText||''}); }
    catch(e){ if(e.name!=='AbortError') toast('শেয়ার করা যায়নি — ডাউনলোড করে পাঠান'); }
  } else {
    downloadShareImage();
    toast('এই ডিভাইসে সরাসরি ছবি-শেয়ার নেই — ছবি ডাউনলোড হয়েছে, হোয়াটসঅ্যাপে attach করুন');
  }
}
function whatsappText(){
  if(!shareState) return;
  const m = shareState.model;
  window.open(`https://wa.me/${m.waPhone||''}?text=${encodeURIComponent(m.waText||'')}`, '_blank', 'noopener');
}
function printDoc(o){
  const mode = paperMode(), pa = document.getElementById('printArea');
  const items = o.items||[], totals = o.totals||[], meta = o.meta||[];
  let html;
  if(mode==='a4'){
    html = `
    <div class="inv-head">
      <div>${shopHeaderHtml()}<div>${o.title}</div></div>
      <div style="text-align:left;">${meta.map(([l,v])=>`<div><b>${l}:</b> ${v}</div>`).join('')}</div>
    </div>
    ${items.length?`<table class="inv-table">
      <tr><th>পণ্য</th><th class="num">পরিমাণ</th><th class="num">${o.rateLabel||'দর'}</th><th class="num">সাবটোটাল</th></tr>
      ${items.map(it=>`<tr><td>${it.name}</td><td class="num">${it.qty}</td><td class="num">${it.rate}</td><td class="num">${it.sub}</td></tr>`).join('')}
    </table>`:''}
    <table class="inv-table" style="width:300px;margin-inline-start:auto;">
      ${totals.map(t=>`<tr><td>${t.bold?`<b>${t.label}</b>`:t.label}</td><td class="num">${t.bold?`<b>${t.value}</b>`:t.value}</td></tr>`).join('')}
    </table>
    ${o.by?`<p style="margin-top:8px;font-size:11px;">গ্রহণ করেছেন: ${esc(o.by)}</p>`:''}
    ${isVoucherRef(o.file)?`<div style="text-align:center;margin-top:12px;">${barcodeSvg(o.file,44,true)}</div>`:''}
    <p style="margin-top:20px;font-size:12px;">${o.footer}</p>`;
  } else {
    html = `
    <div class="rc-center">${shopHeaderHtml()}</div>
    <div class="rc-center rc-title">${o.title}</div>
    <div class="rc-hr"></div>
    ${meta.map(([l,v])=>`<div class="rc-row"><span>${l}</span><span>${v}</span></div>`).join('')}
    ${items.length?`<div class="rc-hr"></div>${items.map(it=>`<div class="rc-item"><div class="rc-name">${it.name}</div>
      <div class="rc-row"><span>${it.qty} × ${it.rate}</span><span>${it.sub}</span></div></div>`).join('')}`:''}
    <div class="rc-hr"></div>
    ${totals.map(t=>`<div class="rc-row ${t.bold?'rc-big':''}"><span>${t.label}</span><span>${t.value}</span></div>`).join('')}
    ${o.by?`<div style="margin-top:4px;font-size:.9em;">গ্রহণ করেছেন: ${esc(o.by)}</div>`:''}
    <div class="rc-hr"></div>
    ${isVoucherRef(o.file)?`<div class="rc-center" style="margin:3px 0;">${barcodeSvg(o.file,32,true)}</div>`:''}
    <div class="rc-center">${o.footer}</div>
    <div style="height:6mm;"></div>`;
  }
  pa.className = mode==='a4' ? '' : mode;
  setPageStyle(mode);
  pa.innerHTML = html;
  window.print();
}
/* ক্রয় ভাউচার প্রিন্ট — সাপ্লায়ারকে দেওয়ার জন্য বা নিজের রেকর্ডের জন্য।
   বিক্রয় ইনভয়েসের মতোই সম্পূর্ণ ফ্রি — ব্রাউজারের window.print() ব্যবহার করে,
   কোনো পেইড লাইব্রেরি/সার্ভিস লাগে না; প্রিন্টার না থাকলে "Save as PDF"-ও করা যায়। */

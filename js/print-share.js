/* ================= প্রিন্ট ইঞ্জিন (A4 / থার্মাল) =================
   ইনভয়েস/ভাউচারের জন্য একটাই printDoc() — কাগজের ধরন অনুযায়ী লেআউট
   বদলায়। ছবি-শেয়ারের canvas-রেন্ডারার returns.js-এ আছে। */

/* ================= INVOICE PRINT ================= */
function shopHeaderHtml(){
  const st = DB.settings || {};
  return `<h2>${esc(st.shopName||'ব্যবসা ম্যানেজার')}</h2>
    ${st.address?`<div>${esc(st.address)}</div>`:''}
    ${st.phone?`<div>ফোন: ${esc(st.phone)}</div>`:''}`;
}
/* ===== প্রিন্ট ইঞ্জিন (A4 / ৮০মিমি / ৫৮মিমি) =====
   এই ডিভাইসের পছন্দ (সাইডবারের "প্রিন্ট কাগজ") থাকলে সেটা, নাহলে দোকানের সেটিং ব্যবহার হয়।
   থার্মাল মোডে টেবিলের বদলে সরু রসিদ-লেআউট (পণ্যের নাম উপরে, নিচে পরিমাণ×দর ও সাবটোটাল) ব্যবহার হয়। */
function paperMode(){
  let pref=''; try{ pref = localStorage.getItem('erp_paper_pref')||''; }catch(e){}
  const m = (pref && pref!=='shop') ? pref : ((DB.settings && DB.settings.paperSize) || 'a4');
  return (m==='thermal' || m==='thermal58') ? m : 'a4';
}
function setPaperPref(v){ try{ localStorage.setItem('erp_paper_pref', v); }catch(e){} }
function setPageStyle(mode){
  let el = document.getElementById('pageSizeStyle');
  if(!el){ el = document.createElement('style'); el.id = 'pageSizeStyle'; document.head.appendChild(el); }
  el.textContent = mode==='thermal' ? '@media print{@page{size:80mm auto;margin:2mm;}}'
                 : mode==='thermal58' ? '@media print{@page{size:58mm auto;margin:1.5mm;}}'
                 : '@media print{@page{margin:10mm;}}';
}
function plain(h){ const t = document.createElement('textarea'); t.innerHTML = String(h==null?'':h); return t.value; }
function waNumber(phone){
  const d = String(phone||'').replace(/\D/g,''); if(!d) return '';
  if(d.startsWith('880')) return d;
  if(d.startsWith('0')) return '88'+d;
  return d;
}
function buildInvoiceModel(s){
  const items = s.items.map(it=>{
    const p = DB.products.find(pp=>pp.id===it.productId);
    return {name: esc(p?p.name:'—'), qty: esc(itemQtyText(it,p)), rate: esc(itemRateText(it)), sub: money(r2(it.price*it.qty))};
  });
  const totals = [];
  if(s.discount){
    totals.push({label:'সাবটোটাল', value: money(s.subtotal||(s.total+s.discount))});
    totals.push({label:`ডিসকাউন্ট ${s.discountPercent?`(${s.discountPercent}%)`:''}`, value:'-'+money(s.discount)});
  }
  totals.push({label:'সর্বমোট', value:money(s.total), bold:true});
  if(s.changeGiven){   // গ্রাহক মোট কত দিয়েছিলেন ও কত ফেরত পেয়েছেন — স্পষ্ট দেখানো হয়
    totals.push({label:'গ্রাহক দিয়েছেন', value:money(r2(s.paid+s.changeGiven))});
    totals.push({label:'ফেরত দেওয়া হয়েছে', value:money(s.changeGiven)});
  } else totals.push({label:'জমা', value:money(s.paid)});
  if(s.returnedTotal>0){
    totals.push({label:'বিক্রয় ফেরত', value:'-'+money(s.returnedTotal)});
    if(s.refundedCash>0) totals.push({label:'নগদ ফেরত দেওয়া হয়েছে', value:money(s.refundedCash)});
    totals.push({label:'ফেরতের পর নীট বিক্রয়', value:money(r2(s.total-s.returnedTotal)), bold:true});
  }
  totals.push({label:'বাকি', value:money(s.due), bold:true});
  const cust = DB.customers.find(c=>c.id===s.customerId);
  const ref = refNo('INV', s.id);
  return {title:'ইনভয়েস / রশিদ', file:ref,
    meta:[['ইনভয়েস #',ref],['তারিখ',fmtDate(s.date)],['কাস্টমার',esc(s.customerName)]],
    items, totals, rateLabel:'দর', footer: esc(DB.settings?.footer||'ধন্যবাদান্তে, আপনার ব্যবসা প্রতিষ্ঠান।'),
    waPhone: waNumber(cust&&cust.phone),
    waText: `${DB.settings?.shopName||'ব্যবসা ম্যানেজার'}\nইনভয়েস ${ref} (${fmtDate(s.date)})\nসর্বমোট: ${money(s.total)}\n${s.changeGiven?`দিয়েছেন: ${money(r2(s.paid+s.changeGiven))}, ফেরত: ${money(s.changeGiven)}`:`জমা: ${money(s.paid)}`}\nবাকি: ${money(s.due)}\nধন্যবাদ।`};
}
function buildPurchaseModel(pur){
  const items = pur.items.map(it=>{
    const p = DB.products.find(pp=>pp.id===it.productId);
    return {name: esc(p?p.name+(p.color?' ('+p.color+')':''):'—'), qty: esc(itemQtyText(it,p)), rate: esc(itemRateText(it)), sub: money(r2(it.price*it.qty))};
  });
  const totals = [{label:'সর্বমোট', value:money(pur.total), bold:true}];
  if(pur.changeGiven){
    totals.push({label:'আপনি দিয়েছেন', value:money(r2(pur.paid+pur.changeGiven))});
    totals.push({label:'ফেরত নেওয়া হয়েছে', value:money(pur.changeGiven)});
  } else totals.push({label:'জমা', value:money(pur.paid)});
  totals.push({label:'বাকি', value:money(pur.due), bold:true});
  const sup = DB.suppliers.find(c=>c.id===pur.supplierId);
  const ref = refNo('PUR', pur.id);
  return {title:'ক্রয় ভাউচার', file:ref,
    meta:[['ভাউচার #',ref],['তারিখ',fmtDate(pur.date)],['সাপ্লায়ার',esc(pur.supplierName)]],
    items, totals, rateLabel:'ক্রয়মূল্য', footer: esc(DB.settings?.footer||'ধন্যবাদান্তে।'),
    waPhone: waNumber(sup&&sup.phone),
    waText: `${DB.settings?.shopName||'ব্যবসা ম্যানেজার'}\nক্রয় ভাউচার ${ref} (${fmtDate(pur.date)})\nসর্বমোট: ${money(pur.total)}\nজমা: ${money(pur.paid)}\nবাকি: ${money(pur.due)}`};
}
function buildDueModel(rec){
  const meta = [['রশিদ #',refNo('PMT',rec.id)],['তারিখ',fmtDate(rec.date)],[rec.type==='customer'?'কাস্টমার':'সাপ্লায়ার',esc(rec.partyName)]];
  if(rec.voucherRef) meta.push(['সংশ্লিষ্ট ভাউচার', esc(rec.voucherRef)]);
  const party = (rec.type==='customer'?DB.customers:DB.suppliers).find(x=>x.id===rec.partyId);
  return {title: rec.type==='customer'?'জমা রশিদ (Payment Receipt)':'পরিশোধ রশিদ (Payment Voucher)', file:refNo('PMT',rec.id),
    meta, items:[],
    totals:[{label:'আগের বাকি', value:money(rec.dueBefore)},
            {label: rec.type==='customer'?'জমা নেওয়া হলো':'পরিশোধ করা হলো', value:money(rec.amount)},
            {label:'নতুন বাকি', value:money(rec.dueAfter), bold:true}],
    by: rec.by||'', footer: esc(DB.settings?.footer||'ধন্যবাদান্তে, আপনার ব্যবসা প্রতিষ্ঠান।'),
    waPhone: waNumber(party&&party.phone),
    waText: `${DB.settings?.shopName||'ব্যবসা ম্যানেজার'}\n${rec.type==='customer'?'জমা রশিদ':'পরিশোধ রশিদ'} ${refNo('PMT',rec.id)} (${fmtDate(rec.date)})\nপরিমাণ: ${money(rec.amount)}\nনতুন বাকি: ${money(rec.dueAfter)}\nধন্যবাদ।`};
}

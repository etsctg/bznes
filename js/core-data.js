/* ================= CORE / DATA LAYER =================
   DB অবজেক্ট, Firebase/Firestore হেল্পার, পাসওয়ার্ড-হ্যাশিং, লগইন-লক,
   অডিট লগ, মডাল, থিম, নেভিগেশন, রোল-অ্যাক্সেস — বাকি সব মডিউল এগুলোর
   ওপর নির্ভর করে, তাই এই ফাইলটা সবার আগে লোড হয়। */

/* =====================================================================
   DATA LAYER — অফলাইন-ফার্স্ট Firestore: ডেটা ডিভাইসেই ক্যাশ থাকে (IndexedDB),
   তাই ইন্টারনেট না থাকলেও অ্যাপ পড়া ও নতুন এন্ট্রি দেওয়া — দুটোই করা যায়।
   ইন্টারনেট ফিরলে যা যা এন্ট্রি দেওয়া হয়েছিল সব স্বয়ংক্রিয়ভাবে সিঙ্ক হয়ে যায়।
   এই কারণে এখানে Firestore Transaction ব্যবহার করা হয়নি (transaction অফলাইনে
   কাজ করে না) — বদলে সাধারণ write/batch ব্যবহার করা হয়েছে, যা লোকালি সাথে
   সাথে প্রয়োগ হয় (UI তাৎক্ষণিক আপডেট হয়) এবং ব্যাকগ্রাউন্ডে সিঙ্ক হয়।
   ===================================================================== */

let fbApp, fbAuth, fsDB;
let currentUser = null;
let currentPage = 'dashboard';

let DB = {
  products:[], customers:[], suppliers:[], sales:[], purchases:[], expenses:[], users:[],
  settings:{shopName:'ব্যবসা ম্যানেজার',address:'',phone:'',footer:'ধন্যবাদান্তে, আপনার ব্যবসা প্রতিষ্ঠান।',paperSize:'a4'},
  statsAlltime:{totalSales:0, totalPurchase:0, totalExpense:0, totalCogs:0, salesCount:0, purchaseCount:0},
  dayStatsCache: {} // date(yyyy-mm-dd) -> {salesTotal,purchaseTotal,expenseTotal,cogs}
};
let salesRangeUnsub = null, purchaseRangeUnsub = null; // date-range লোডের জন্য বর্তমান লিসেনার আনসাবস্ক্রাইব ফাংশন

/* ================= পাসওয়ার্ড হ্যাশিং (নিরাপত্তা) =================
   পাসওয়ার্ড আর প্লেইন-টেক্সটে জমা থাকে না — ব্রাউজারের বিল্ট-ইন Web Crypto API
   দিয়ে SHA-256 হ্যাশ করে জমা রাখা হয়, সাথে ইউজারনেম "সল্ট" হিসেবে মেশানো হয়
   (যাতে একই পাসওয়ার্ড হলেও হ্যাশ আলাদা হয়)। এতে করে Firestore console থেকে
   কেউ ডেটা দেখলেও আসল পাসওয়ার্ড বুঝতে পারবে না।
   ⚠️ মনে রাখবেন: এটি ক্লায়েন্ট-সাইড অ্যাপ, তাই প্রকৃত এক্সেস-কন্ট্রোল
   Firestore Security Rules দিয়েও নিশ্চিত করা জরুরি (সাথে দেওয়া
   firestore.rules.txt ফাইলটি দেখুন ও Firebase Console-এ বসান)। */
async function sha256Hash(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function hashPassword(username, plain){
  return sha256Hash('bzn-erp-salt::' + String(username).toLowerCase() + '::' + plain);
}
/* ===== শক্তিশালী পাসওয়ার্ড হ্যাশ (PBKDF2-SHA256, প্রতি ইউজারে আলাদা র‍্যান্ডম salt) =====
   কেউ ডেটাবেসের কপি পেলেও পাসওয়ার্ড আন্দাজ করা অনেক ধীর হয়। পুরনো (SHA-256/প্লেইন) পাসওয়ার্ড
   ইউজার পরের বার লগইন করলেই নিজে নিজে নতুন ফরম্যাটে বদলে যায়। */
const PBKDF2_ITER = 150000;
function toB64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function fromB64(str){ return Uint8Array.from(atob(str), c=>c.charCodeAt(0)); }
async function pbkdf2Hash(plain, salt, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:iter}, key, 256);
}
async function makePasswordRecord(username, plain){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${toB64(salt)}$${toB64(await pbkdf2Hash(plain, salt, PBKDF2_ITER))}`;
}
async function verifyPassword(username, plain, stored){
  stored = String(stored||''); if(!stored) return false;
  if(stored.startsWith('pbkdf2$')){
    const [, it, saltB, hashB] = stored.split('$');
    return toB64(await pbkdf2Hash(plain, fromB64(saltB), Number(it))) === hashB;
  }
  if(stored === await hashPassword(username, plain)) return true;   // পুরনো SHA-256
  return stored === plain;                                          // আরও পুরনো প্লেইন-টেক্সট
}
function needsRehash(stored){ return !String(stored||'').startsWith('pbkdf2$'); }

function modalOpen(){ return document.getElementById('modalBg')?.classList.contains('show'); }

let _lastGenId = 0;
function genId(){
  let id = Date.now();
  if(id <= _lastGenId) id = _lastGenId + 1;
  _lastGenId = id;
  return id;
}
function refNo(prefix, id){
  const d = new Date(id);
  const p2 = n=>String(n).padStart(2,'0');
  return `${prefix}-${String(d.getFullYear()).slice(-2)}${p2(d.getMonth()+1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

/* pendingWriteCount: অফলাইনে করা এন্ট্রি Firestore-এ প্রকৃত সিঙ্ক না হওয়া পর্যন্ত
   promise resolve হয় না (offline persistence-এর স্বভাব) — তাই এই কাউন্টার দিয়ে
   ঠিক বোঝা যায় কয়টা এন্ট্রি এখনো সার্ভারে সিঙ্ক হওয়ার অপেক্ষায় আছে, এবং
   ইন্টারনেট ফিরলে সেগুলো স্বয়ংক্রিয়ভাবে সিঙ্ক হয়ে গেলে ব্যাজে তা দেখানো যায়। */
let pendingWriteCount = 0;
function fireWrite(promise, label){
  pendingWriteCount++;
  updateConnBadge();
  promise.then(()=>{
    pendingWriteCount = Math.max(0, pendingWriteCount-1);
    updateConnBadge();
  }).catch(err=>{
    pendingWriteCount = Math.max(0, pendingWriteCount-1);
    updateConnBadge();
    console.error(label, err);
    alert(`⚠️ "${label}" সিঙ্ক করতে সমস্যা হয়েছে: ${err.message}\nইন্টারনেট সংযোগ থাকলে এটা এমনিতেই আবার চেষ্টা করবে।`);
  });
}

/* ================= AUDIT LOG (কে কখন কী মুছলো/পরিবর্তন করলো) =================
   ডিলিট, ডেটা মোছা, রিস্টোর, লগইন/লগআউট-এর মতো স্পর্শকাতর কাজগুলো এখানে
   লগ হয়ে থাকে যাতে পরে দরকার হলে যাচাই করা যায় কে কী করেছে। */
function logAudit(action, detail){
  if(!fsDB) return;
  try{
    fsDB.collection('erp_audit_log').add({
      action, detail: detail||'', user: currentUser?currentUser.name:'—',
      username: currentUser?currentUser.username:'—',
      at: new Date().toISOString()
    }).catch(e=>console.warn('audit log ব্যর্থ:', e));
  }catch(e){ console.warn('audit log ব্যর্থ:', e); }
}
async function loadAuditLog(){
  try{
    const snap = await fsDB.collection('erp_audit_log').orderBy('at','desc').limit(100).get();
    return snap.docs.map(d=>d.data());
  }catch(e){ console.warn('audit log লোড ব্যর্থ:', e); return []; }
}

/* সেটিংস ফর্মে লেখার সময় ব্যাকগ্রাউন্ডে ডেটা বদলালে পেজ রিফ্রেশ হয়ে লেখা হারিয়ে যাওয়া ঠেকাতে */
function syncSessionWithUsers(){
  if(!currentUser) return;
  const u = DB.users.find(x=>x.id===currentUser.id);
  if(!u || u.disabled){
    setTimeout(()=>{ if(currentUser){ alert('আপনার অ্যাকাউন্টটি বন্ধ বা মুছে ফেলা হয়েছে। লগআউট করা হচ্ছে।'); logout('অ্যাকাউন্ট বন্ধ'); } }, 0);
    return;
  }
  const roleChanged = u.role!==currentUser.role;
  currentUser = u;
  if(roleChanged){ buildNav(); const r = document.getElementById('curUserRole'); if(r) r.textContent = ROLE_NAME_BN[u.role]; }
}
function skipRerenderWhileEditing(){
  if(currentPage!=='settings') return false;
  const a = document.activeElement;
  return !!(a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.closest && a.closest('#mainArea'));
}
function listenCollection(collName, key){
  return new Promise(resolve=>{
    let firstLoad = true;
    fsDB.collection(collName).onSnapshot(snap=>{
      const arr = [];
      snap.forEach(d=>arr.push(d.data()));
      arr.sort((a,b)=>(a.id||0)-(b.id||0));
      DB[key] = arr;
      if(key==='users') syncSessionWithUsers();
      if(firstLoad){ firstLoad = false; resolve(); }
      else if(currentUser && !modalOpen() && !skipRerenderWhileEditing()){ renderPage(currentPage); }
    }, err=>{
      console.error('Listen error on '+collName, err);
      if(firstLoad){ firstLoad = false; resolve(); }
    });
  });
}
function listenDoc(collName, docId, key){
  return new Promise(resolve=>{
    let firstLoad = true;
    fsDB.collection(collName).doc(docId).onSnapshot(snap=>{
      if(snap.exists) DB[key] = {...DB[key], ...snap.data()};
      if(firstLoad){ firstLoad = false; resolve(); }
      else if(currentUser && !modalOpen() && !skipRerenderWhileEditing()){ renderPage(currentPage); }
    }, err=>{
      console.error('Listen error on '+collName+'/'+docId, err);
      if(firstLoad){ firstLoad = false; resolve(); }
    });
  });
}

/* =====================================================================
   স্কেল-বান্ধব লোডিং — বিক্রয়/ক্রয়
   -----------------------------------------------------------------
   হাজার হাজার পণ্য ঠিক আছে (ব্রাউজারের মেমরিতে থাকা যায়), কিন্তু বছরে
   লাখ খানেক বিক্রয়/ক্রয় এন্ট্রি সারাজীবনের জন্য একসাথে মেমরিতে রাখলে
   অ্যাপ ভারী ও স্লো হয়ে যাবে। তাই:
   - "আজকের" এন্ট্রি সবসময় রিয়েল-টাইম শোনা হয় (তাৎক্ষণিক আপডেট দরকার)।
   - নির্দিষ্ট তারিখ-রেঞ্জ (পুরনো রিপোর্ট ইত্যাদি) দেখতে চাইলে, ঠিক তখনই
     শুধু সেই রেঞ্জটুকু Firestore থেকে কোয়েরি করে লোড করা হয় (limit সহ) —
     পুরো কালেকশন কখনোই একসাথে ডাউনলোড হয় না।
   - ড্যাশবোর্ড/রিপোর্টের সর্বমোট হিসাব রাখা হয় ছোট ছোট "aggregate" ডকুমেন্টে
     (erp_stats/alltime এবং erp_daystats/<তারিখ>), যা প্রতিটা এন্ট্রির সাথে
     সাথেই আপডেট হয় — ফলে লাখ লাখ পুরনো এন্ট্রি স্ক্যান না করেই
     সর্বমোট/রিপোর্ট মুহূর্তেই দেখানো যায়।
   ===================================================================== */
function listenTodaySales(){
  return new Promise(resolve=>{
    let firstLoad = true;
    fsDB.collection('erp_sales').where('date','==', todayStr())
      .onSnapshot(snap=>{
        const arr = []; snap.forEach(d=>arr.push(d.data()));
        arr.sort((a,b)=>b.id-a.id);
        DB.sales = arr;
        if(firstLoad){ firstLoad=false; resolve(); }
        else if(currentUser && !modalOpen() && currentPage==='sales' && rangeSalesRows===null) renderSalesTable();
      }, err=>{ console.error('today sales listen', err); if(firstLoad){ firstLoad=false; resolve(); } });
  });
}
function listenTodayPurchases(){
  return new Promise(resolve=>{
    let firstLoad = true;
    fsDB.collection('erp_purchases').where('date','==', todayStr())
      .onSnapshot(snap=>{
        const arr = []; snap.forEach(d=>arr.push(d.data()));
        arr.sort((a,b)=>b.id-a.id);
        DB.purchases = arr;
        if(firstLoad){ firstLoad=false; resolve(); }
        else if(currentUser && !modalOpen() && currentPage==='purchase' && rangePurchaseRows===null) renderPurchaseTable();
      }, err=>{ console.error('today purchases listen', err); if(firstLoad){ firstLoad=false; resolve(); } });
  });
}
/* কাস্টম তারিখ-রেঞ্জ দেখতে চাইলে (আজকের বাইরে) — এককালীন কোয়েরি, limit সহ */
const RANGE_LOAD_LIMIT = 500;
async function loadSalesRange(from, to){
  let q = fsDB.collection('erp_sales').orderBy('date','desc');
  if(from) q = q.where('date','>=',from);
  if(to) q = q.where('date','<=',to);
  const snap = await q.limit(RANGE_LOAD_LIMIT).get();
  const arr = []; snap.forEach(d=>arr.push(d.data()));
  arr.sort((a,b)=>b.id-a.id);
  return {rows: arr, truncated: snap.size>=RANGE_LOAD_LIMIT};
}
async function loadPurchaseRange(from, to){
  let q = fsDB.collection('erp_purchases').orderBy('date','desc');
  if(from) q = q.where('date','>=',from);
  if(to) q = q.where('date','<=',to);
  const snap = await q.limit(RANGE_LOAD_LIMIT).get();
  const arr = []; snap.forEach(d=>arr.push(d.data()));
  arr.sort((a,b)=>b.id-a.id);
  return {rows: arr, truncated: snap.size>=RANGE_LOAD_LIMIT};
}

/* ---- এগ্রিগেট (দৈনিক + সর্বমোট) আপডেট করার হেল্পার — প্রতিটা ক্রয়/বিক্রয়/খরচ
   এন্ট্রি সেভ/মোছার সাথেই একই ব্যাচে চলে, যাতে ড্যাশবোর্ড কখনো পুরো
   কালেকশন স্ক্যান না করেই তাৎক্ষণিক সর্বমোট দেখাতে পারে। */
function applyStatsDelta(batch, date, deltas){
  const inc = firebase.firestore.FieldValue.increment;
  const dayRef = fsDB.collection('erp_daystats').doc(date);
  const allRef = fsDB.collection('erp_stats').doc('alltime');
  const dayData = {}, allData = {};
  Object.keys(deltas).forEach(k=>{ if(deltas[k]){ dayData[k]=inc(deltas[k]); allData[k]=inc(deltas[k]); } });
  if(Object.keys(dayData).length) batch.set(dayRef, dayData, {merge:true});
  if(Object.keys(allData).length) batch.set(allRef, allData, {merge:true});
}
/* ---- স্টক মুভমেন্ট লগ — প্রতিটা ক্রয়/বিক্রয়ে পণ্যের স্টক ঠিক কোন ভাউচারের
   কারণে বাড়লো/কমলো তার ট্রেস রাখা হয়। স্টকে গরমিল দেখা দিলে "স্টক ম্যানেজমেন্ট"
   পেজ থেকে যেকোনো পণ্যের 🕓 হিস্টোরি বাটনে চেপে পুরো লেনদেনের তালিকা
   (কোন ক্রয়/বিক্রয় ভাউচার থেকে কত পরিমাণ যোগ/বিয়োগ হয়েছে) দেখা যায়। */
function logStockMove(batch, {productId, qty, type, refType, refId, date}){
  const ref = fsDB.collection('erp_stock_moves').doc();
  batch.set(ref, {
    productId, qty, type, refType, refId, date,
    at: new Date().toISOString(), by: currentUser?currentUser.name:''
  });
}
async function loadStockMoves(productId){
  try{
    const snap = await fsDB.collection('erp_stock_moves').where('productId','==',productId).orderBy('at','desc').limit(300).get();
    return snap.docs.map(d=>d.data());
  }catch(e){
    console.warn('stock moves লোড ব্যর্থ (হয়তো ইনডেক্স তৈরি হচ্ছে):', e);
    return null;
  }
}
async function loadDayStatsRange(from, to){
  let q = fsDB.collection('erp_daystats');
  if(from) q = q.where(firebase.firestore.FieldPath.documentId(),'>=',from);
  if(to) q = q.where(firebase.firestore.FieldPath.documentId(),'<=',to);
  const snap = await q.get();
  const rows = [];
  snap.forEach(d=>rows.push({date:d.id, ...d.data()}));
  return rows;
}

async function seedDefaults(){
  const batch = fsDB.batch();
  const adminPass = genPassword();     // র‍্যান্ডম প্রাথমিক পাসওয়ার্ড — সোর্স-কোডে কোনো ডিফল্ট পাসওয়ার্ড নেই
  const adminHash = await makePasswordRecord('admin', adminPass);
  batch.set(fsDB.collection('erp_users').doc('1'),
    {id:1, username:'admin', password:adminHash, role:'admin', name:'প্রধান এডমিন', mustChange:true});
  batch.set(fsDB.collection('erp_products').doc('1'),
    {id:1, name:'চাল (৫০ কেজি বস্তা)', unit:'বস্তা', buyPrice:2500, sellPrice:2700, stock:20, lowStock:5,
     brand:'নমুনা কোম্পানি', size:'৫০ কেজি', color:'', shelf:'A1'});
  batch.set(fsDB.collection('erp_products').doc('2'),
    {id:2, name:'সয়াবিন তেল (৫ লিটার)', unit:'ক্যান', buyPrice:750, sellPrice:820, stock:30, lowStock:8,
     brand:'নমুনা কোম্পানি', size:'৫ লিটার', color:'', shelf:'B2'});
  batch.set(fsDB.collection('erp_customers').doc('1'), {id:1, name:'সাধারণ কাস্টমার', phone:'', due:0});
  batch.set(fsDB.collection('erp_suppliers').doc('1'), {id:1, name:'সাধারণ সাপ্লায়ার', phone:'', due:0});
  batch.set(fsDB.collection('erp_settings').doc('business'), {shopName:'ব্যবসা ম্যানেজার', address:'', phone:'', footer:'ধন্যবাদান্তে, আপনার ব্যবসা প্রতিষ্ঠান।', paperSize:'a4'});
  batch.set(fsDB.collection('erp_stats').doc('alltime'), {totalSales:0, totalPurchase:0, totalExpense:0, totalCogs:0, salesCount:0, purchaseCount:0});
  await batch.commit();
  return {user:'admin', pass:adminPass};
}

/* ================= AUTH (লগইন লক-আউট সহ) =================
   বারবার ভুল পাসওয়ার্ড দিলে (৫ বার) ইউজারনেমটি ৫ মিনিটের জন্য লক হয়ে যায় —
   এতে করে কেউ পাসওয়ার্ড আন্দাজ করে বারবার চেষ্টা (brute-force) করতে পারবে না। */
const LOGIN_LOCK_KEY = 'erp_login_lock';
function getLoginLocks(){ try{ return JSON.parse(localStorage.getItem(LOGIN_LOCK_KEY)||'{}'); }catch(e){ return {}; } }
function setLoginLocks(obj){ try{ localStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify(obj)); }catch(e){} }
function checkLoginLock(username){
  const locks = getLoginLocks();
  const rec = locks[username];
  if(!rec) return 0;
  const remainMs = (rec.until||0) - Date.now();
  return remainMs > 0 ? Math.ceil(remainMs/1000) : 0;
}
function registerFailedLogin(username){
  const locks = getLoginLocks();
  const rec = locks[username] || {count:0, until:0};
  rec.count = (rec.count||0) + 1;
  if(rec.count >= 5){ rec.until = Date.now() + 5*60*1000; rec.count = 0; }
  locks[username] = rec;
  setLoginLocks(locks);
}
function clearLoginLock(username){
  const locks = getLoginLocks();
  delete locks[username];
  setLoginLocks(locks);
}
async function doLogin(){
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');
  const lockedFor = checkLoginLock(u);
  if(lockedFor > 0){
    errEl.textContent = `অনেকবার ভুল দেওয়া হয়েছে — ${Math.ceil(lockedFor/60)} মিনিট পর আবার চেষ্টা করুন।`;
    return;
  }
  const cand = DB.users.find(x=>x.username===u);
  let found = null;
  if(cand && await verifyPassword(u, p, cand.password)) found = cand;
  else if(!cand){ try{ await pbkdf2Hash(p, new Uint8Array(16), PBKDF2_ITER); }catch(e){} }   // ইউজার আছে কিনা সময় দেখে বোঝা কঠিন করতে
  if(!found){
    registerFailedLogin(u);
    errEl.textContent = 'ভুল ইউজারনেম বা পাসওয়ার্ড!';
    return;
  }
  if(found.disabled){ errEl.textContent = 'এই অ্যাকাউন্টটি বন্ধ করা আছে — এডমিনের সাথে যোগাযোগ করুন'; return; }
  if(needsRehash(found.password)){          // পুরনো দুর্বল হ্যাশ → নতুন শক্তিশালী হ্যাশে আপগ্রেড
    try{
      const rec = await makePasswordRecord(u, p);
      found.password = rec;
      fsDB.collection('erp_users').doc(String(found.id)).update({password: rec}).catch(e=>console.warn('পাসওয়ার্ড আপগ্রেড ব্যর্থ:', e));
    }catch(e){ console.warn(e); }
  }
  clearLoginLock(u);
  currentUser = found;
  sessionStorage.setItem('erp_session_user', String(found.id));
  logAudit('লগইন', found.name);
  enterApp();
  if(found.mustChange || p==='admin123'){
    setTimeout(()=>{ alert('⚠️ নিরাপত্তা: আপনার পাসওয়ার্ড এখনো প্রাথমিক/দুর্বল অবস্থায় আছে। এখনই নতুন পাসওয়ার্ড দিন।'); openChangePasswordModal(); }, 500);
  }
}
function logout(reason){
  document.body.classList.remove('in-app');
  if(currentUser) logAudit('লগআউট' + (reason?` (${reason})`:''), currentUser.name);
  currentUser = null;
  sessionStorage.removeItem('erp_session_user');
  document.getElementById('appScreen').classList.remove('show');
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
  document.getElementById('loginErr').textContent='';
  clearInactivityTimer();
}

/* ---- নিষ্ক্রিয় থাকলে অটো-লগআউট (২০ মিনিট) — সিকিউরিটির জন্য ---- */
let inactivityTimer = null;
const INACTIVITY_LIMIT_MS = 20*60*1000;
function resetInactivityTimer(){
  if(!currentUser) return;
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(()=>{
    alert('নিষ্ক্রিয় থাকার কারণে স্বয়ংক্রিয়ভাবে লগআউট করা হলো — নিরাপত্তার স্বার্থে।');
    logout('নিষ্ক্রিয়তা');
  }, INACTIVITY_LIMIT_MS);
}
function clearInactivityTimer(){ clearTimeout(inactivityTimer); }
['click','keydown','touchstart','mousemove'].forEach(evt=>{
  document.addEventListener(evt, ()=>{ if(currentUser) resetInactivityTimer(); }, {passive:true});
});
function tryAutoLogin(){
  const id = sessionStorage.getItem('erp_session_user');
  if(id){
    const u = DB.users.find(x=>x.id==id);
    if(u && !u.disabled){ currentUser = u; enterApp(); return; }
  }
}

/* উপরের বারের বাম অংশে বর্তমান পেজের নাম ও স্ট্যাটাস-লাইন (পেজের নিজস্ব হেডিং এখানে চলে আসে) */
function syncTopbar(){
  const titleEl = document.getElementById('tbTitle'), subEl = document.getElementById('tbSub');
  const t = document.querySelector('#mainArea > .topbar:not(.moved)');
  if(!titleEl || !t) return;
  const h2 = t.querySelector('h2'), sub = t.querySelector('.sub');
  if(!h2) return;
  const page = PAGES.find(x=>x.key===currentPage);
  const txt = h2.textContent.trim();
  titleEl.textContent = ((page && !txt.includes(page.ic)) ? page.ic + ' ' : '') + txt;
  subEl.textContent = sub ? sub.textContent.trim() : '';
  const box = document.getElementById('tbTitles'); if(box){ box.title = titleEl.textContent + (subEl.textContent ? ' — ' + subEl.textContent : ''); box.classList.remove('open'); }
  const first = t.firstElementChild;
  if(first && first.contains(h2)) first.style.display = 'none';
  t.classList.add('moved');
  if(t.children.length===1) t.style.display = 'none';
}
(function(){ const m = document.getElementById('mainArea'); if(m) new MutationObserver(syncTopbar).observe(m, {childList:true}); })();
let statsStale = false;
let pageHostId = 'mainArea';
function pageHost(){ return document.getElementById(pageHostId) || document.getElementById('mainArea'); }
const APP_VERSION = '3.8.0';
(function(){ const e=document.getElementById('appVerTxt'); if(e) e.textContent = APP_VERSION; })();
const ROLE_LEVEL = {user:1, manager:2, director:3, admin:4};
function hasAccess(minRole){ return ROLE_LEVEL[currentUser.role] >= ROLE_LEVEL[minRole]; }

const PAGES = [
  {key:'dashboard', label:'ড্যাশবোর্ড', ic:'📊', minView:'user'},
  {key:'sales', label:'বিক্রয় হিসাব', ic:'🧾', minView:'user'},
  {key:'purchase', label:'ক্রয় হিসাব', ic:'🛒', minView:'manager'},
  {key:'stock', label:'স্টক ম্যানেজমেন্ট', ic:'📦', minView:'user'},
  {key:'dues', label:'বাকি/দেনা-পাওনা', ic:'💰', minView:'manager'},
  {key:'cashbook', label:'ক্যাশবুক', ic:'📒', minView:'manager'},
  {key:'expenses', label:'খরচের হিসাব', ic:'💵', minView:'manager'},
  {key:'reports', label:'লাভ-ক্ষতির রিপোর্ট', ic:'📈', minView:'director'},
  {key:'settings', label:'সেটিংস', ic:'⚙️', minView:'user'},
];
const ROLE_NAME_BN = {user:'ইউজার', manager:'ম্যানেজার', director:'ডাইরেক্টর', admin:'এডমিন'};

function enterApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appScreen').classList.add('show');
  document.getElementById('curUserName').textContent = currentUser.name;
  document.getElementById('curUserRole').textContent = ROLE_NAME_BN[currentUser.role];
  document.getElementById('userInitial').textContent = currentUser.name.charAt(0);
  buildNav();
  updateConnBadge();
  resetInactivityTimer();
  document.body.classList.add('in-app');
  try{ syncTopbar(); if(hasAccess('director')) checkStatsHealth(); }catch(e){}
  document.getElementById('fabSale').classList.remove('hidden');
  document.getElementById('fabPurchase').classList.toggle('hidden', !hasAccess('manager'));
  renderPage('dashboard');
}
function buildNav(){
  const nav = document.getElementById('navList');
  nav.innerHTML = '';
  PAGES.forEach(p=>{
    if(!hasAccess(p.minView)) return;
    const div = document.createElement('div');
    div.className = 'nav-item' + (p.key===currentPage?' active':'');
    div.id = 'nav-'+p.key;
    div.onclick = ()=>{ renderPage(p.key); closeSidebarMobile(); };
    div.innerHTML = `<span class="ic">${p.ic}</span><span>${p.label}</span>`;
    nav.appendChild(div);
  });
}
function setActiveNav(key){
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const el = document.getElementById('nav-'+key);
  if(el) el.classList.add('active');
}
function renderPage(key){
  const page = PAGES.find(p=>p.key===key);
  if(!page || !hasAccess(page.minView)){
    document.getElementById('mainArea').innerHTML = `<div class="access-denied"><div class="ic">🔒</div><h3>এই সেকশনে প্রবেশের অনুমতি নেই</h3><p>আপনার রোল: ${ROLE_NAME_BN[currentUser.role]}</p></div>`;
    return;
  }
  currentPage = key;
  setActiveNav(key);
  const map = {
    dashboard: renderDashboard, sales: renderSales, purchase: renderPurchase,
    stock: renderStock, dues: renderDues, expenses: renderExpenses,
    reports: renderReports, settings: renderSettings, cashbook: renderCashbook
  };
  map[key]();
}

/* ================= MOBILE SIDEBAR ================= */
function toggleSidebarMobile(){
  const open = document.getElementById('sidebarEl').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('show', open);
  document.body.classList.toggle('nav-open', open);   // মেনু খোলা থাকলে পেছনের পেজ স্ক্রল হবে না
}
function closeSidebarMobile(){
  document.getElementById('sidebarEl').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
  document.body.classList.remove('nav-open');
}
/* ===== উপরের বারের মোবাইল-মেনু (Help/About/থিম/পাসওয়ার্ড/লগআউট এক জায়গায়) ===== */
function closeTopMenu(){ const m = document.getElementById('tbMenu'); if(m) m.classList.remove('show'); }
function toggleTopMenu(e){
  if(e) e.stopPropagation();
  const m = document.getElementById('tbMenu'); if(!m || !currentUser) return;
  if(m.classList.contains('show')){ closeTopMenu(); return; }
  const isLight = document.documentElement.getAttribute('data-theme')==='light';
  m.innerHTML = `
    <div class="tbm-user"><div class="brand-mark">${esc(currentUser.name.charAt(0))}</div>
      <div><b>${esc(currentUser.name)}</b><span class="role-badge" style="margin:0;font-size:10px;">${ROLE_NAME_BN[currentUser.role]}</span>
      <div class="tbm-conn" id="connBadgeMenu"></div></div></div>
    <button class="tbm-item" onclick="topMenuDo('help')">❓ Help — ব্যবহার নির্দেশিকা</button>
    <button class="tbm-item" onclick="topMenuDo('about')">ℹ️ About</button>
    <button class="tbm-item" onclick="topMenuDo('theme')">${isLight?'🌙 ডার্ক থিম':'☀️ লাইট থিম'}</button>
    <button class="tbm-item" onclick="topMenuDo('pass')">🔑 পাসওয়ার্ড পরিবর্তন</button>
    <button class="tbm-item danger" onclick="topMenuDo('logout')">🚪 লগআউট</button>`;
  m.classList.add('show');
  updateConnBadge();
}
function topMenuDo(k){
  closeTopMenu();
  ({help:openHelp, about:openAbout, theme:toggleTheme, pass:openChangePasswordModal, logout:()=>logoutWithBackupCheck()})[k]();
}
document.addEventListener('click', e=>{ if(!e.target.closest || !e.target.closest('.tb-menu-wrap')) closeTopMenu(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeTopMenu(); });
/* হেডিং-এর নিচের বিবরণ বড় হলে ট্যাপ করলে পুরোটা দেখা যায় (কিছুক্ষণ পর নিজে গুটিয়ে যায়) */
let tbTitleTimer = null;
function toggleTbTitle(){
  const el = document.getElementById('tbTitles'); if(!el) return;
  const open = el.classList.toggle('open');
  clearTimeout(tbTitleTimer);
  if(open) tbTitleTimer = setTimeout(()=>el.classList.remove('open'), 6000);
}

/* ================= CONNECTION STATUS ================= */
function setConnText(html, color){
  ['connBadge','connBadgeTop','connBadgeMenu'].forEach(id=>{ const el = document.getElementById(id); if(el){ el.innerHTML = html; el.style.color = color; } });
}
function updateConnBadge(){
  if(!navigator.onLine){
    setConnText(`🟠 অফলাইন — এন্ট্রি লোকালি সেভ হচ্ছে${pendingWriteCount>0?` (${pendingWriteCount}টি বাকি)`:''}`, 'var(--gold-2)');
  } else if(pendingWriteCount > 0){
    setConnText(`🔄 সিঙ্ক হচ্ছে... (${pendingWriteCount}টি বাকি)`, 'var(--gold-2)');
  } else {
    setConnText('🟢 অনলাইন — সব সিঙ্ক আছে', 'var(--teal-2)');
  }
}
window.addEventListener('online', ()=>{
  updateConnBadge();
  setTimeout(()=>{
    if(pendingWriteCount===0 && currentUser){ setConnText('✅ ইন্টারনেট ফিরেছে — সব এন্ট্রি সিঙ্ক হয়ে গেছে','var(--teal-2)'); setTimeout(updateConnBadge, 3500); }
  }, 1200);
});
window.addEventListener('offline', updateConnBadge);

/* ================= THEME ================= */
function applyThemeIcon(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ['themeToggleBtn','themeToggleBtn2'].forEach(id=>{ const btn = document.getElementById(id); if(btn) btn.textContent = isLight ? '☀️' : '🌙'; });
}
function toggleTheme(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if(isLight){
    document.documentElement.removeAttribute('data-theme');
    try{ localStorage.setItem('erp_theme','dark'); }catch(e){}
  } else {
    document.documentElement.setAttribute('data-theme','light');
    try{ localStorage.setItem('erp_theme','light'); }catch(e){}
  }
  applyThemeIcon();
  if(currentUser) renderPage(currentPage); // চার্টের রং রিফ্রেশ করতে পুনরায় আঁকা হয়
}
applyThemeIcon();

/* ================= HELPERS ================= */
function itemQtyText(it,p){ const u = p?p.unit:''; return it.dispUnit ? `${it.dispQty} ${it.dispUnit} (${it.qty} ${u})` : `${it.qty} ${u}`; }
function itemRateText(it){ return (it.dispUnit && it.dispPrice!=null) ? `${money(it.dispPrice)}/${it.dispUnit}` : money(it.price); }
function r2(x){ return Math.round((Number(x)||0)*100)/100; }
function money(n){ n = Number(n)||0; return '৳' + n.toLocaleString('en-BD', {maximumFractionDigits:2}); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function daysAgoStr(n){ const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function fmtDate(d){ const dt = new Date(d); return dt.toLocaleDateString('bn-BD', {year:'numeric',month:'short',day:'numeric'}); }
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
/* কোনো অবজেক্টকে JSON বানিয়ে HTML-এর সিঙ্গেল-কোট অ্যাট্রিবিউটের ভেতরে নিরাপদে
   বসানোর জন্য — নাম/টেক্সটে ' (apostrophe) থাকলেও যেন ভেঙে না যায় */
function attrJson(obj){ return JSON.stringify(obj).replace(/'/g, "&#39;"); }
/* কে একটা ভাউচার এডিট করতে পারবে — যে ইউজার এন্ট্রিটা করেছে, অথবা ম্যানেজার+ */
function canEditVoucher(entry){
  if(!currentUser || !entry) return false;
  return hasAccess('manager') || entry.createdBy===currentUser.name;
}
/* ভাউচার নম্বরটা এডিট-যোগ্য হলে ক্লিকযোগ্য লিঙ্ক আকারে দেখানো হয় (যে এন্ট্রি করেছে
   সে নিজে, অথবা ম্যানেজার+ হলে) — নাহলে শুধু প্লেইন টেক্সট */
function voucherLink(prefix, entry, kind){
  const label = refNo(prefix, entry.id);
  if(!canEditVoucher(entry)) return esc(label);
  const fn = kind==='purchase' ? `openPurchaseModal(${entry.id})` : `openSaleModal(${entry.id})`;
  return `<a href="javascript:void(0)" onclick="${fn}" title="এডিট করতে ক্লিক করুন" style="color:var(--teal-2);text-decoration:underline;font-weight:600;">${esc(label)}</a>`;
}
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/* মোবাইলে কিবোর্ড খুললে ফর্মটা কিবোর্ডের উপরের দৃশ্যমান অংশের মধ্যেই থাকে — পণ্যের তালিকা/সেভ বাটন ঢাকা পড়ে না */
function fitModalToViewport(){
  const bg = document.getElementById('modalBg'); if(!bg || !bg.classList.contains('show')) return;
  const vv = window.visualViewport; if(!vv) return;
  bg.style.top = vv.offsetTop + 'px'; bg.style.height = vv.height + 'px'; bg.style.bottom = 'auto';
  document.documentElement.style.setProperty('--vvh', vv.height + 'px');
}
if(window.visualViewport){ window.visualViewport.addEventListener('resize', fitModalToViewport); window.visualViewport.addEventListener('scroll', fitModalToViewport); }
/* মোবাইলে কিবোর্ড ওঠার পর যে ঘরে লেখা হচ্ছে সেটা যেন ঢাকা না পড়ে — ফোকাস করলে ঘরটা দৃশ্যমান অংশে স্ক্রল করে আনা হয় */
function revealFocused(){
  const a = document.activeElement;
  if(!a || !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
  const box = document.getElementById('modalBox');
  if(!box || !box.contains(a) || a.closest('.entry-bar')) return;
  try{ a.scrollIntoView({block:'center', behavior:'smooth'}); }catch(e){}
}
document.addEventListener('focusin', e=>{ if(e.target.closest && e.target.closest('#modalBox')) setTimeout(revealFocused, 320); });
if(window.visualViewport) window.visualViewport.addEventListener('resize', ()=>setTimeout(revealFocused, 120));
document.addEventListener('click', e=>{ document.querySelectorAll('.hint.open').forEach(h=>{ if(h!==e.target) h.classList.remove('open'); }); });
function hintIc(text, right){ return `<span class="hint${right?' r':''}" tabindex="0" data-hint="${esc(text)}" onclick="event.preventDefault();event.stopPropagation();this.classList.toggle('open')">ⓘ</span>`; }
function openModal(html){
  document.getElementById('modalBox').className='modal';
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalBg').classList.add('show');
  fitModalToViewport();
}
function closeModal(){
  document.getElementById('modalBox').innerHTML='';
  const bg = document.getElementById('modalBg'); bg.classList.remove('show');
  bg.style.top=''; bg.style.height=''; bg.style.bottom='';
  document.documentElement.style.removeProperty('--vvh');
}
/* মোবাইলে টেবিলকে কার্ড-লেআউটে দেখাতে — প্রতিটা ঘরে কলামের নাম বসিয়ে দেওয়া হয় (CSS এ ≤640px এ কার্ড হয়) */
function labelTables(){
  document.querySelectorAll('table:not(.resp):not(.inv-table)').forEach(t=>{
    if(t.closest('#printArea')) return;
    const rows = [...t.rows]; if(rows.length<2) return;
    const head = rows[0], cells = [...head.cells];
    if(cells.length<3 || cells.some(c=>c.tagName!=='TH' || c.colSpan>1)) return;
    const labels = cells.map(c=>c.textContent.trim());
    head.classList.add('th-row');
    rows.slice(1).forEach(r=>{
      const cs = [...r.cells];
      if(cs.length===labels.length && cs.every(c=>c.colSpan===1)) cs.forEach((c,i)=>c.setAttribute('data-label', labels[i]));
      else r.classList.add('sumrow');   // মোট/সারসংক্ষেপ সারি — কার্ডে "বাম: নাম, ডান: মান" আকারে
    });
    t.classList.add('resp');
  });
}
(function(){ let tm; new MutationObserver(()=>{ clearTimeout(tm); tm = setTimeout(labelTables, 0); }).observe(document.body, {childList:true, subtree:true}); })();
/* ইচ্ছাকৃতভাবে ফর্মের বাইরে ক্লিক করলে মডাল বন্ধ হওয়ার ব্যবস্থা রাখা হয়নি —
   ভুলবশত বাইরে ক্লিক পড়লে এন্ট্রি করা তথ্য হারিয়ে যাওয়ার ঝুঁকি থাকে।
   শুধু "বাতিল"/"বন্ধ করুন" বাটনে চাপলে বা Esc চাপলেই মডাল বন্ধ হবে। */
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && modalOpen()) closeModal(); });
/* F2/F3 শর্টকাট এখন যেকোনো পেজেই কাজ করবে — শুধু বিক্রয়/ক্রয় পেজে আর সীমাবদ্ধ না,
   যাতে দ্রুত এন্ট্রি দিতে আগে ওই পেজে যেতে না হয়। */
document.addEventListener('keydown', e=>{
  if(modalOpen() || !currentUser) return;
  if(e.key==='F2'){ e.preventDefault(); openSaleModal(); }
  if(e.key==='F3' && hasAccess('manager')){ e.preventDefault(); openPurchaseModal(); }
});


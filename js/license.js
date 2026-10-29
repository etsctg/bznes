/* =================================================================
   লাইসেন্স গেট (৩য় পক্ষের কাছে বিক্রি/লাইসেন্স দেওয়ার জন্য — ঐচ্ছিক)
   -----------------------------------------------------------------
   erp_license/current ডকুমেন্টে মেয়াদ, সর্বোচ্চ ইউজার ও ডিভাইস সংখ্যা
   রাখা থাকে। এই ডকুমেন্ট না থাকলে (ডিফল্ট) কোনো সীমা প্রযোজ্য হয় না —
   একে বিক্রেতা (আপনি) Firebase Console থেকে সরাসরি তৈরি/এডিট করবেন;
   চলমান অ্যাপ শুধু পড়তে পারে এবং activeUserCount/activeDeviceCount
   (শুধু এই দুই ফিল্ড) আপডেট করতে পারে — বাকি সব ফিল্ড (মেয়াদ, সর্বোচ্চ
   সংখ্যা, status) ক্লায়েন্টের পক্ষ থেকে বদলানো Firestore Rules-এ
   বন্ধ করা আছে (firestore.rules.txt), শুধু কোডে নয় — তাই অ্যাপের
   ফাইল কপি করে অন্য কোথাও বসালেও (আপনার backend-এর সাথে যুক্ত থাকলে)
   মেয়াদ/সীমা নিজে থেকে পাল্টানো যায় না।
   বিস্তারিত ব্যবহারবিধি ও নতুন লাইসেন্স ইস্যু করার ধাপ: LICENSING_SETUP.txt
   ================================================================= */
let licenseInfo = null;

function daysUntil(dateStr){
  if(!dateStr) return null;
  const a = new Date(todayStr()+'T00:00:00'), b = new Date(dateStr+'T00:00:00');
  return Math.round((b-a)/86400000);
}

/* লাইসেন্স ডকুমেন্ট পড়ে মেয়াদ/অবস্থা যাচাই করে — ডকুমেন্ট না থাকলে unrestricted ধরা হয় */
async function checkLicenseGate(){
  let snap;
  try{ snap = await fsDB.collection('erp_license').doc('current').get(); }
  catch(err){ console.warn('লাইসেন্স পড়া যায়নি (রুলস/ইন্টারনেট সমস্যা হতে পারে):', err); licenseInfo = null; return {ok:true}; }
  if(!snap.exists){ licenseInfo = null; return {ok:true}; }
  const lic = snap.data();
  licenseInfo = lic;
  const left = daysUntil(lic.expiryDateStr);
  if(lic.status !== 'active') return {ok:false, reason:'suspended', lic};
  if(left!=null && left < 0) return {ok:false, reason:'expired', lic};
  return {ok:true, lic, daysLeft:left};
}

/* মেয়াদ শেষ/বন্ধ হলে বুট-স্ক্রিনেই আটকে দেওয়া হয় — লগইন স্ক্রিন পর্যন্ত যাওয়া যায় না */
function showLicenseBlockScreen(reason, lic){
  const statusEl = document.getElementById('bootStatus');
  const title = reason==='expired' ? '⏳ লাইসেন্সের মেয়াদ শেষ হয়ে গেছে' : '⛔ লাইসেন্স বন্ধ আছে';
  statusEl.innerHTML = `
    <div style="text-align:center;max-width:380px;margin:0 auto;">
      <div style="font-size:34px;margin-bottom:8px;">${reason==='expired'?'⏳':'⛔'}</div>
      <div style="font-weight:800;font-size:16px;margin-bottom:10px;">${title}</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.9;margin-bottom:16px;">
        ${lic?`প্রতিষ্ঠান: <b style="color:var(--ink);">${esc(lic.clientName||'-')}</b><br>মেয়াদ ছিল: <b style="color:var(--ink);">${lic.expiryDateStr?fmtDate(lic.expiryDateStr):'-'}</b><br>`:''}
        অ্যাপ আবার ব্যবহার করতে লাইসেন্স নবায়ন/সক্রিয় করা প্রয়োজন — নিচের ঠিকানায় যোগাযোগ করুন।
      </div>
      <div class="about-links" style="max-width:320px;margin:0 auto;">
        <a class="about-link" href="tel:01869866899">📞 01869866899</a>
        <a class="about-link" href="mailto:info.wasbd@gmail.com">✉️ ইমেইল</a>
      </div>
    </div>`;
}

/* ---- ডিভাইস রেজিস্ট্রেশন/সীমা ---- */
function getDeviceId(){
  let id = null;
  try{ id = localStorage.getItem('erp_device_id'); }catch(e){}
  if(!id){
    id = (crypto.randomUUID ? crypto.randomUUID() : 'dev-'+Math.random().toString(36).slice(2)+Date.now().toString(36));
    try{ localStorage.setItem('erp_device_id', id); }catch(e){}
  }
  return id;
}
function deviceLabel(){
  const ua = navigator.userAgent||'';
  let os = 'অজানা ডিভাইস';
  if(/android/i.test(ua)) os='অ্যান্ড্রয়েড';
  else if(/iphone|ipad|ipod/i.test(ua)) os='আইফোন/আইপ্যাড';
  else if(/windows/i.test(ua)) os='উইন্ডোজ';
  else if(/mac os/i.test(ua)) os='ম্যাক';
  else if(/linux/i.test(ua)) os='লিনাক্স';
  let browser = '';
  if(/edg\//i.test(ua)) browser='এজ';
  else if(/chrome/i.test(ua)) browser='ক্রোম';
  else if(/firefox/i.test(ua)) browser='ফায়ারফক্স';
  else if(/safari/i.test(ua)) browser='সাফারি';
  return `${os}${browser?' • '+browser:''}`;
}
/* এই ব্রাউজার/ডিভাইসটা আগে থেকে নিবন্ধিত কিনা দেখে; না থাকলে এবং সীমার মধ্যে থাকলে নতুন করে নিবন্ধন করে।
   সীমা পূর্ণ হলে ok:false — তখন বুট-স্ক্রিনেই আটকে যাবে (অ্যাপ লোড হবে না), নতুন স্লট খালি করতে
   ইতিমধ্যে-নিবন্ধিত অন্য কোনো ডিভাইস থেকে ঢুকে "সেটিংস → লাইসেন্স" থেকে একটা ডিভাইস সরাতে হবে। */
async function ensureDeviceRegistered(lic){
  if(!lic || !lic.maxDevices){ return {ok:true}; }
  const deviceId = getDeviceId();
  const docRef = fsDB.collection('erp_devices').doc(deviceId);
  let snap;
  try{ snap = await docRef.get(); }catch(err){ console.warn('ডিভাইস-তালিকা পড়া যায়নি:', err); return {ok:true}; }
  if(snap.exists){
    docRef.update({lastSeenAt:new Date().toISOString(), label:deviceLabel()}).catch(()=>{});
    return {ok:true};
  }
  let allSnap;
  try{ allSnap = await fsDB.collection('erp_devices').get(); }catch(err){ console.warn('ডিভাইস-তালিকা পড়া যায়নি:', err); return {ok:true}; }
  if(allSnap.size >= lic.maxDevices) return {ok:false, count:allSnap.size, max:lic.maxDevices};
  try{
    await docRef.set({id:deviceId, label:deviceLabel(), firstSeenAt:new Date().toISOString(), lastSeenAt:new Date().toISOString()});
    const inc = firebase.firestore.FieldValue.increment(1);
    fsDB.collection('erp_license').doc('current').set({activeDeviceCount:inc}, {merge:true}).catch(()=>{});
  }catch(err){ console.warn('ডিভাইস নিবন্ধন ব্যর্থ:', err); }
  return {ok:true};
}
function showDeviceLimitBlockScreen(count, max){
  const statusEl = document.getElementById('bootStatus');
  statusEl.innerHTML = `
    <div style="text-align:center;max-width:380px;margin:0 auto;">
      <div style="font-size:34px;margin-bottom:8px;">📵</div>
      <div style="font-weight:800;font-size:16px;margin-bottom:10px;">এই লাইসেন্সে ডিভাইসের সীমা শেষ</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.9;margin-bottom:16px;">
        সর্বোচ্চ <b style="color:var(--ink);">${max}</b> টি ডিভাইসের অনুমতি আছে, বর্তমানে <b style="color:var(--ink);">${count}</b> টি ব্যবহৃত হচ্ছে।<br>
        এই ডিভাইসে চালাতে — ইতিমধ্যে-নিবন্ধিত অন্য কোনো ডিভাইসে গিয়ে <b>সেটিংস → লাইসেন্স</b> থেকে একটা পুরনো/অব্যবহৃত ডিভাইস সরান, অথবা বিক্রেতার সাথে যোগাযোগ করে সীমা বাড়ান।
      </div>
      <div class="about-links" style="max-width:320px;margin:0 auto;">
        <a class="about-link" href="tel:01869866899">📞 01869866899</a>
        <a class="about-link" href="mailto:info.wasbd@gmail.com">✉️ ইমেইল</a>
      </div>
    </div>`;
}

/* ---- ইউজার-সংখ্যা সীমা (সেটিংস → ইউজার ম্যানেজমেন্টে নতুন ইউজার তৈরির সময় চেক হয়) ---- */
function activeUserCountNow(){ return DB.users.filter(u=>!u.disabled).length; }
function userCapExceeded(){
  if(!licenseInfo || !licenseInfo.maxUsers) return false;
  return activeUserCountNow() >= licenseInfo.maxUsers;
}
function bumpUserCounter(delta){
  if(!licenseInfo) return;
  const inc = firebase.firestore.FieldValue.increment(delta);
  fsDB.collection('erp_license').doc('current').set({activeUserCount:inc}, {merge:true}).catch(()=>{});
}

/* ---- সেটিংসে লাইসেন্স ট্যাব ---- */
function settingsLicenseHtml(){
  const lic = licenseInfo;
  if(!lic){
    return `<div class="card set-card"><h3>🔑 লাইসেন্স</h3>
      <div class="set-note">এই ইনস্টলেশনে কোনো লাইসেন্স-সীমা সেট করা নেই — সীমাহীন ব্যবহার চলছে।</div></div>`;
  }
  const left = daysUntil(lic.expiryDateStr);
  const leftColor = left==null ? 'var(--muted)' : (left<0 ? 'var(--danger-text)' : (left<=14 ? 'var(--warn-text)' : 'var(--success)'));
  return `
  <div class="card set-card">
    <h3>🔑 লাইসেন্স</h3>
    <div class="sum-compact">
      <div class="sum-line"><span>প্রতিষ্ঠান</span><b>${esc(lic.clientName||'-')}</b></div>
      <div class="sum-line"><span>অবস্থা</span>${lic.status==='active'?'<span class="pill ok">সক্রিয়</span>':'<span class="pill bad">বন্ধ</span>'}</div>
      <div class="sum-line"><span>মেয়াদ</span><b>${lic.expiryDateStr?fmtDate(lic.expiryDateStr):'-'}</b></div>
      <div class="sum-line"><span>বাকি দিন</span><b style="color:${leftColor};">${left==null?'-':(left<0?'মেয়াদ শেষ':left+' দিন')}</b></div>
      <div class="sum-line"><span>ইউজার</span><b>${activeUserCountNow()} / ${lic.maxUsers||'∞'}</b></div>
      <div class="sum-line"><span>ডিভাইস</span><b>${lic.activeDeviceCount||0} / ${lic.maxDevices||'∞'}</b></div>
    </div>
    <div class="set-note">মেয়াদ, সর্বোচ্চ ইউজার/ডিভাইস সংখ্যা শুধু বিক্রেতা বদলাতে পারেন। নবায়ন বা সীমা বাড়াতে যোগাযোগ করুন:
      <b>01869866899</b> / <b>info.wasbd@gmail.com</b></div>
  </div>
  <div class="card set-card" style="margin-top:16px;" id="licDevicesCard"><h3>💻 নিবন্ধিত ডিভাইস</h3><div style="color:var(--muted);padding:12px;text-align:center;">লোড হচ্ছে...</div></div>`;
}
async function loadLicenseDevices(){
  const host = document.getElementById('licDevicesCard'); if(!host) return;
  let rows = [];
  try{ const snap = await fsDB.collection('erp_devices').orderBy('lastSeenAt','desc').get(); rows = snap.docs.map(d=>d.data()); }
  catch(err){ host.innerHTML = `<h3>💻 নিবন্ধিত ডিভাইস</h3><div class="help-warn">লোড করা যায়নি: ${esc(err.message||err)}</div>`; return; }
  const myId = getDeviceId();
  host.innerHTML = `<h3>💻 নিবন্ধিত ডিভাইস</h3><div class="tbl-wrap"><table>
    <tr><th>ডিভাইস</th><th>প্রথম ব্যবহার</th><th>সর্বশেষ ব্যবহার</th><th></th></tr>
    ${rows.map(d=>`<tr><td>${esc(d.label||'অজানা')}${d.id===myId?' <span class="pill ok">এই ডিভাইস</span>':''}</td>
      <td>${fmtDate(d.firstSeenAt.slice(0,10))}</td><td>${fmtDate((d.lastSeenAt||d.firstSeenAt).slice(0,10))}</td>
      <td>${hasAccess('admin')?`<button class="icon-btn" onclick="removeLicenseDevice('${d.id}')" title="এই ডিভাইস সরান">🗑️</button>`:''}</td></tr>`).join('')
      || `<tr><td colspan="4" style="text-align:center;color:var(--muted);">কোনো ডিভাইস নিবন্ধিত নেই</td></tr>`}
  </table></div>`;
}
function removeLicenseDevice(deviceId){
  if(!confirm('এই ডিভাইসটা তালিকা থেকে সরাবেন? ওই ডিভাইসে আবার ব্যবহার করতে চাইলে নতুন করে স্লট লাগবে।')) return;
  const batch = fsDB.batch();
  batch.delete(fsDB.collection('erp_devices').doc(deviceId));
  batch.set(fsDB.collection('erp_license').doc('current'), {activeDeviceCount: firebase.firestore.FieldValue.increment(-1)}, {merge:true});
  fireWrite(batch.commit(), 'ডিভাইস সরানো');
  logAudit('লাইসেন্স ডিভাইস সরানো', deviceId);
  setTimeout(loadLicenseDevices, 400);
}

/* ---- প্রতিদিন লগআউটের সময় ব্যাকআপ মনে করিয়ে দেওয়া (সফট-বাধ্যতামূলক) ----
   ⚠️ সততার সাথে বলা জরুরি: এটা ব্রাউজার বন্ধ করে দেওয়া/অ্যাপ ক্র্যাশ হওয়া ঠেকাতে পারে না,
   শুধু স্বাভাবিকভাবে "লগআউট" বাটনে চাপলে কার্যকর হয়। ১০০% নিশ্চিত দৈনিক ব্যাকআপের জন্য
   সার্ভার-সাইড Cloud Function লাগবে — দেখুন cloud-functions/scheduled-backup.js ও
   LICENSING_SETUP.txt। */
function todaysBackupDone(){
  const last = DB.settings && DB.settings.lastBackupAt;
  return !!(last && last.slice(0,10) === todayStr());
}
function logoutWithBackupCheck(){
  if(currentUser && hasAccess('director') && !todaysBackupDone()){
    openModal(`
      <h3>⬇️ আজকের ব্যাকআপ এখনো নেওয়া হয়নি</h3>
      <div style="font-size:13px;color:var(--muted);line-height:1.8;margin-bottom:12px;">
        নিরাপত্তার স্বার্থে প্রতিদিন অন্তত একটা ব্যাকআপ রাখা জরুরি। এখন ডাউনলোড করে লগআউট করুন —
        ফাইলটা পেনড্রাইভ/ক্লাউডে (গুগল ড্রাইভ ইত্যাদি) সরিয়ে রাখুন।
      </div>
      <div class="modal-actions">
        ${hasAccess('admin')?`<button class="btn btn-outline" onclick="closeModal();logout();">এড়িয়ে লগআউট (শুধু এডমিন)</button>`:''}
        <button class="btn btn-gold" onclick="backupThenLogout()">⬇️ ব্যাকআপ নিয়ে লগআউট করুন</button>
      </div>`);
  } else {
    logout();
  }
}
async function backupThenLogout(){
  closeModal();
  await downloadBackup();
  fsDB.collection('erp_settings').doc('business').set({lastBackupAt:new Date().toISOString()}, {merge:true}).catch(()=>{});
  if(DB.settings) DB.settings.lastBackupAt = new Date().toISOString();
  logout('দৈনিক ব্যাকআপ নিয়ে');
}

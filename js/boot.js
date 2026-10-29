/* ================= Firebase কনফিগ, দোকান-সংযোগ (গেট), ও বুট =================
   সবশেষে লোড হয় — কারণ শেষ লাইনে bootApp() চালু হয়, যার আগে বাকি সব
   মডিউলের ফাংশন (listenCollection, renderDashboard, ইত্যাদি) থাকা লাগে। */

/* =====================================================================
   CONFIG — এখানে আপনার Firebase তথ্য বসান
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyDrFR9Ycw4xpeaueNn92wWrT3c2diD1cLM",
  authDomain: "bzneserp.firebaseapp.com",
  projectId: "bzneserp",
  storageBucket: "bzneserp.firebasestorage.app",
  messagingSenderId: "412722396147",
  appId: "1:412722396147:web:ddbf530520c5b662f67086"
};

/* =====================================================================
   নিরাপত্তা সেটিং
   SHOP_AUTH_REQUIRED = true  → ডেটাবেসে ঢুকতে "দোকান-সংযোগ" (Firebase Email/Password) লাগে।
     অ্যাপ GitHub Pages/Netlify-তে সার্বজনীনভাবে হোস্ট করলে অবশ্যই true রাখুন, নাহলে
     যে কেউ আপনার ডেটাবেস পড়তে/বদলাতে পারবে। (সেটআপ: SECURITY_SETUP.txt)
   APP_CHECK_SITE_KEY → ঐচ্ছিক বাড়তি সুরক্ষা (Firebase App Check, reCAPTCHA v3 সাইট-কী)।
   ===================================================================== */
const SHOP_AUTH_REQUIRED = true;
const APP_CHECK_SITE_KEY = '';

/* ---------- দোকান-সংযোগ (গেট) ---------- */
let shopGateResolve = null;
let firstRunInfo = null;
function authErrMsg(e){
  const c = (e && e.code) || '';
  if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-login-credentials'].includes(c)) return 'ইমেইল বা পাসওয়ার্ড ভুল!';
  if(c==='auth/invalid-email') return 'ইমেইলের ফরম্যাট ঠিক নেই';
  if(c==='auth/too-many-requests') return 'অনেকবার ভুল চেষ্টা — কিছুক্ষণ পর আবার চেষ্টা করুন';
  if(c==='auth/operation-not-allowed') return 'Firebase-এ Email/Password সাইন-ইন চালু করা নেই (Authentication → Sign-in method)';
  if(c==='auth/network-request-failed') return 'ইন্টারনেট সংযোগ নেই — সংযোগ দিয়ে আবার চেষ্টা করুন';
  if(c==='auth/user-disabled') return 'এই সংযোগ-অ্যাকাউন্টটি বন্ধ করা আছে';
  return 'সংযোগ ব্যর্থ: ' + ((e && e.message) || c || 'অজানা সমস্যা');
}
function waitForShopLogin(){
  return new Promise(resolve=>{
    shopGateResolve = resolve;
    document.getElementById('bootScreen').style.display = 'none';
    document.getElementById('shopGate').style.display = 'flex';
    setTimeout(()=>{ const e = document.getElementById('gateEmail'); if(e) e.focus(); }, 50);
  });
}
async function shopGateLogin(){
  const email = document.getElementById('gateEmail').value.trim();
  const pass = document.getElementById('gatePass').value;
  const err = document.getElementById('gateErr'), btn = document.getElementById('gateBtn');
  err.textContent = '';
  if(!email || !pass){ err.textContent = 'ইমেইল ও পাসওয়ার্ড দিন'; return; }
  btn.disabled = true; btn.textContent = 'সংযুক্ত হচ্ছে...';
  try{
    await fbAuth.signInWithEmailAndPassword(email, pass);
    document.getElementById('gatePass').value = '';
    document.getElementById('shopGate').style.display = 'none';
    document.getElementById('bootScreen').style.display = 'flex';
    if(shopGateResolve){ const r = shopGateResolve; shopGateResolve = null; r(); }
  }catch(e){
    err.textContent = authErrMsg(e);
  }finally{
    btn.disabled = false; btn.textContent = 'সংযুক্ত করুন';
  }
}
(function(){ const g = document.getElementById('gatePass'); if(g) g.addEventListener('keydown', e=>{ if(e.key==='Enter') shopGateLogin(); }); })();
async function disconnectShopDevice(){
  if(!confirm('এই ডিভাইসের দোকান-সংযোগ বিচ্ছিন্ন করবেন? (আবার সংযোগ-ইমেইল ও পাসওয়ার্ড লাগবে। শেয়ার্ড/পাবলিক কম্পিউটারে কাজ শেষে এটা করা ভালো।)')) return;
  try{ await fbAuth.signOut(); }catch(e){}
  try{ sessionStorage.clear(); }catch(e){}
  location.reload();
}
function loadScriptOnce(src){
  return new Promise((resolve,reject)=>{ const el = document.createElement('script'); el.src = src; el.onload = resolve; el.onerror = ()=>reject(new Error('স্ক্রিপ্ট লোড হয়নি: '+src)); document.head.appendChild(el); });
}
/* ঐচ্ছিক: Firebase App Check — ডেটাবেসের অনুরোধ শুধু আপনার সাইট থেকে এসেছে কিনা যাচাই করে */
async function initAppCheck(){
  if(!APP_CHECK_SITE_KEY) return;
  try{
    await loadScriptOnce('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check-compat.js');
    firebase.appCheck().activate(APP_CHECK_SITE_KEY, true);
  }catch(e){ console.warn('App Check চালু করা যায়নি:', e); }
}
function renderLoginHint(){
  const el = document.getElementById('loginHint'); if(!el || !firstRunInfo) return;
  el.style.borderColor = 'var(--gold-2)';
  el.innerHTML = `🆕 <b>প্রথমবার সেটআপ সম্পন্ন।</b> এডমিন ইউজারনেম: <b>${esc(firstRunInfo.user)}</b> • পাসওয়ার্ড: <b style="user-select:all;letter-spacing:1px;">${esc(firstRunInfo.pass)}</b><br>⚠️ এটা এখনই কাগজে লিখে রাখুন — পেজ রিফ্রেশ করলে আর দেখা যাবে না। লগইনের পর পাসওয়ার্ড বদলাতে বলা হবে।`;
}

/* ================= INIT / BOOT ================= */
async function bootApp(){
  const statusEl = document.getElementById('bootStatus');
  const setupEl = document.getElementById('bootSetup');

  if(!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY'){
    statusEl.textContent = '';
    setupEl.classList.remove('hidden');
    return;
  }

  try{
    fbApp = firebase.initializeApp(firebaseConfig);
    await initAppCheck();
    fbAuth = firebase.auth();
    fsDB = firebase.firestore();
    /* কিছু নেটওয়ার্ক/প্রক্সিতে স্ট্রিমিং সংযোগ ('Listen' transport errored) বারবার ভেঙে যায় — সেক্ষেত্রে স্বয়ংক্রিয়ভাবে long-polling এ নেমে আসে */
    try{ fsDB.settings({experimentalAutoDetectLongPolling:true, merge:true}); }catch(e){ console.warn('Firestore settings:', e); }

    try{
      await fsDB.enablePersistence({synchronizeTabs:true});
    }catch(persErr){
      console.warn('Offline persistence চালু করা যায়নি:', persErr.code);
    }

    statusEl.textContent = '🔐 প্রমাণীকরণ করা হচ্ছে...';
    await new Promise(resolve=>{
      const unsub = fbAuth.onAuthStateChanged(user=>{ unsub(); resolve(user); });
    });
    if(SHOP_AUTH_REQUIRED){
      if(fbAuth.currentUser && fbAuth.currentUser.isAnonymous){ await fbAuth.signOut(); }   // পুরনো বেনামী সেশন আর চলবে না
      if(!fbAuth.currentUser){ await waitForShopLogin(); statusEl.textContent = '🔐 সংযোগ সম্পন্ন...'; }
    } else if(!fbAuth.currentUser){
      await fbAuth.signInAnonymously();
    }

    /* ---- লাইসেন্স/ডিভাইস গেট (ঐচ্ছিক — শুধু erp_license/current ডকুমেন্ট থাকলেই সক্রিয় হয়) ---- */
    statusEl.textContent = '🔑 লাইসেন্স যাচাই করা হচ্ছে...';
    const licCheck = await checkLicenseGate();
    if(!licCheck.ok){
      showLicenseBlockScreen(licCheck.reason, licCheck.lic);
      return;
    }
    const devCheck = await ensureDeviceRegistered(licCheck.lic);
    if(!devCheck.ok){
      showDeviceLimitBlockScreen(devCheck.count, devCheck.max);
      return;
    }

    statusEl.textContent = '📦 প্রথমবার সেটআপ পরীক্ষা করা হচ্ছে...';
    const usersSnap = await fsDB.collection('erp_users').limit(1).get();
    if(usersSnap.empty){
      statusEl.textContent = '🌱 প্রাথমিক ডেটা তৈরি করা হচ্ছে...';
      firstRunInfo = await seedDefaults();
    }

    statusEl.textContent = '📦 ডেটা লোড করা হচ্ছে...';
    /* বিক্রয়/ক্রয় এখন সম্পূর্ণ কালেকশন চিরকাল লোড করে রাখা হয় না (লাখ লাখ এন্ট্রি হলে
       অ্যাপ ভারী/স্লো হয়ে যেত) — বরং শুধু "আজকের" এন্ট্রি রিয়েল-টাইম শোনা হয়;
       পুরনো তারিখ দেখতে চাইলে সেই মুহূর্তেই সেই রেঞ্জটুকু আলাদাভাবে লোড হয়
       (দেখুন loadSalesRange/loadPurchaseRange)। */
    await Promise.all([
      listenCollection('erp_products','products'),
      listenCollection('erp_customers','customers'),
      listenCollection('erp_suppliers','suppliers'),
      listenCollection('erp_expenses','expenses'),
      listenCollection('erp_users','users'),
      listenDoc('erp_settings','business','settings'),
      listenDoc('erp_stats','alltime','statsAlltime'),
      listenTodaySales(),
      listenTodayPurchases(),
    ]);

    document.getElementById('bootScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    renderLoginHint();
    tryAutoLogin();
    document.getElementById('loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  }catch(err){
    console.error(err);
    if(!navigator.onLine){
      statusEl.innerHTML = '📴 ইন্টারনেট সংযোগ নেই।<br><br>এই ডিভাইসে প্রথমবার চালু করতে অন্তত একবার ইন্টারনেট সংযোগ প্রয়োজন (এরপর থেকে অফলাইনেও কাজ করবে)।';
    } else {
      statusEl.innerHTML = '❌ সংযোগ ব্যর্থ হয়েছে: ' + esc(err.message) +
        '<br><br>' + (SHOP_AUTH_REQUIRED ? 'Firebase Authentication-এ "Email/Password" পদ্ধতি চালু আছে কিনা এবং Firestore rules ঠিক আছে কিনা যাচাই করুন।' : 'Firebase Authentication-এ "Anonymous" পদ্ধতি চালু আছে কিনা এবং Firestore rules ঠিক আছে কিনা যাচাই করুন।');
    }
  }
}

document.getElementById('loginScreen').style.display = 'none';
bootApp();

/* ================= PWA: INSTALLABLE APP ================= */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(err=>console.log('SW registration failed (হয়তো manifest/sw.js ফাইল একই ফোল্ডারে নেই):', err));
  });
}
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if(btn) btn.classList.remove('hidden');
});
function triggerInstall(){
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(()=>{
    deferredInstallPrompt = null;
    document.getElementById('installBtn')?.classList.add('hidden');
  });
}
window.addEventListener('appinstalled', ()=>{
  document.getElementById('installBtn')?.classList.add('hidden');
});


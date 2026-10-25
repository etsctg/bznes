/* ================= সেটিংস =================
   ইউজার ম্যানেজমেন্ট (এডমিন), দোকানের তথ্য, প্রিন্ট পছন্দ, নিজের
   অ্যাকাউন্ট, ব্যাকআপ/রিস্টোর, অ্যাক্টিভিটি লগ, Help ও About। */

/* ================= USER MANAGEMENT (Admin only) ================= */
function activeAdminCount(exceptId){ return DB.users.filter(u=>u.role==='admin' && !u.disabled && u.id!==exceptId).length; }
function renderUsers(){
  pageHost().innerHTML = `
    <div class="topbar">
      <div><h2>ইউজার ম্যানেজমেন্ট</h2><div class="sub">নতুন ইউজার, রোল পরিবর্তন, পাসওয়ার্ড রিসেট, লগইন বন্ধ ও মোছা — শুধু এডমিন</div></div>
      <button class="btn btn-gold" onclick="openUserModal()">+ নতুন ইউজার যোগ করুন</button>
    </div>
    <div class="card"><div class="tbl-wrap">
      <table>
        <tr><th>নাম</th><th>ইউজারনেম</th><th>রোল</th><th>অবস্থা</th><th>অ্যাকশন</th></tr>
        ${DB.users.map(u=>{
          const me = currentUser && u.id===currentUser.id;
          return `<tr><td>${esc(u.name)}${me?' <span class="pill ok">আপনি</span>':''}</td><td>${esc(u.username)}</td>
            <td><span class="role-badge">${ROLE_NAME_BN[u.role]}</span></td>
            <td>${u.disabled?'<span class="pill bad">বন্ধ</span>':'<span class="pill ok">সক্রিয়</span>'}</td>
            <td style="white-space:nowrap;">
              <button class="icon-btn" onclick="openEditUserModal(${u.id})" title="নাম/রোল এডিট">✏️</button>
              <button class="icon-btn" onclick="openResetPasswordModal(${u.id})" title="পাসওয়ার্ড রিসেট">🔑</button>
              ${!me?`<button class="icon-btn" onclick="toggleUserActive(${u.id})" title="${u.disabled?'আবার চালু করুন':'লগইন বন্ধ করুন'}">${u.disabled?'✅':'⛔'}</button>`:''}
              ${(!me && u.id!==1)?`<button class="icon-btn" onclick="deleteUser(${u.id})" title="ইউজার মুছুন">🗑️</button>`:''}
            </td></tr>`; }).join('')}
      </table>
    </div></div>
    <div class="set-note">✏️ নাম/রোল বদল • 🔑 পাসওয়ার্ড রিসেট (ইউজার ভুলে গেলে নতুন পাসওয়ার্ড দিয়ে তাকে জানান) • ⛔ লগইন বন্ধ (ডেটা থাকে, পরে ✅ দিয়ে চালু) • 🗑️ স্থায়ীভাবে মোছা। কমপক্ষে একজন সক্রিয় এডমিন সবসময় থাকতে হবে।</div>
  `;
}
function openEditUserModal(id){
  const u = DB.users.find(x=>x.id===id); if(!u) return;
  openModal(`
    <h3>✏️ ইউজার এডিট — @${esc(u.username)}</h3>
    <div class="form-row full"><label>পূর্ণ নাম</label><input id="eu_name" value="${esc(u.name)}"></div>
    <div class="form-row full"><label>রোল / এক্সেস লেভেল</label>
      <select id="eu_role">
        ${['user','manager','director','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_NAME_BN[r]} (${r})</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" onclick="saveEditUser(${id})">সংরক্ষণ করুন</button>
    </div>`);
}
function saveEditUser(id){
  const u = DB.users.find(x=>x.id===id); if(!u) return;
  const name = document.getElementById('eu_name').value.trim();
  const role = document.getElementById('eu_role').value;
  if(!name){ alert('নাম দিন'); return; }
  if(u.role==='admin' && role!=='admin' && activeAdminCount(id)===0){ alert('কমপক্ষে একজন সক্রিয় এডমিন রাখতে হবে — এই ইউজারের রোল নামানো যাবে না।'); return; }
  if(currentUser.id===id && role!==u.role && !confirm('নিজের রোল বদলালে আপনার অ্যাক্সেস বদলে যাবে। চালিয়ে যাবেন?')) return;
  fireWrite(fsDB.collection('erp_users').doc(String(id)).update({name, role}), 'ইউজার এডিট');
  logAudit('ইউজার এডিট', `${u.username}: ${u.name}/${ROLE_NAME_BN[u.role]} → ${name}/${ROLE_NAME_BN[role]}`);
  closeModal();
}
function genPassword(){
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789', a = new Uint32Array(8); crypto.getRandomValues(a);
  return Array.from(a).map(n=>chars[n%chars.length]).join('');
}
function openResetPasswordModal(id){
  const u = DB.users.find(x=>x.id===id); if(!u) return;
  openModal(`
    <h3>🔑 পাসওয়ার্ড রিসেট — ${esc(u.name)} (@${esc(u.username)})</h3>
    <div class="form-row full"><label>নতুন পাসওয়ার্ড (কমপক্ষে ৬ ক্যারেক্টার)</label>
      <div style="display:flex;gap:6px;"><input id="rp_pass" type="text" autocomplete="off" style="flex:1;min-width:0;" value="${genPassword()}">
      <button type="button" class="btn btn-outline small-btn" onclick="document.getElementById('rp_pass').value=genPassword()">🎲 নতুন বানান</button></div></div>
    <div class="set-note">এই পাসওয়ার্ডটি ইউজারকে জানিয়ে দিন। লগইনের পর সে নিজে "সেটিংস → আমার অ্যাকাউন্ট" থেকে বদলে নিতে পারবে।</div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" onclick="saveResetPassword(${id})">রিসেট করুন</button>
    </div>`);
}
async function saveResetPassword(id){
  const u = DB.users.find(x=>x.id===id); if(!u) return;
  const pass = document.getElementById('rp_pass').value;
  if(pass.length<6){ alert('পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে'); return; }
  const hash = await makePasswordRecord(u.username, pass);
  fireWrite(fsDB.collection('erp_users').doc(String(id)).update({password:hash, mustChange:true}), 'পাসওয়ার্ড রিসেট');
  logAudit('পাসওয়ার্ড রিসেট', `${u.name} (@${u.username})`);
  openModal(`
    <h3>✅ পাসওয়ার্ড রিসেট হয়েছে</h3>
    <div style="font-size:13px;margin-bottom:8px;">${esc(u.name)} (@${esc(u.username)}) এর নতুন পাসওয়ার্ড:</div>
    <div style="font-size:22px;font-weight:800;letter-spacing:1px;background:var(--panel-2);border:1px dashed var(--line);border-radius:10px;padding:12px;text-align:center;" id="rp_shown">${esc(pass)}</div>
    <div class="set-note">এই জানালা বন্ধ করলে পাসওয়ার্ড আর দেখা যাবে না — এখনই ইউজারকে জানিয়ে দিন।</div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('rp_shown').textContent).then(()=>toast('✅ কপি হয়েছে'))">📋 কপি</button>
      <button class="btn btn-gold" onclick="closeModal()">বন্ধ করুন</button>
    </div>`);
}
function toggleUserActive(id){
  const u = DB.users.find(x=>x.id===id); if(!u) return;
  const turnOff = !u.disabled;
  if(turnOff && u.role==='admin' && activeAdminCount(id)===0){ alert('কমপক্ষে একজন সক্রিয় এডমিন রাখতে হবে।'); return; }
  if(!confirm(turnOff ? `"${u.name}" এর লগইন বন্ধ করবেন? (সে চালু থাকলে সাথে সাথে লগআউট হয়ে যাবে)` : `"${u.name}" এর লগইন আবার চালু করবেন?`)) return;
  fireWrite(fsDB.collection('erp_users').doc(String(id)).update({disabled: turnOff}), 'ইউজার অবস্থা');
  logAudit(turnOff?'ইউজার লগইন বন্ধ':'ইউজার লগইন চালু', `${u.name} (@${u.username})`);
}
function openUserModal(){
  openModal(`
    <h3>নতুন ইউজার যোগ করুন</h3>
    <div class="form-row full"><label>পূর্ণ নাম</label><input id="uf_name"></div>
    <div class="form-row full"><label>ইউজারনেম</label><input id="uf_username"></div>
    <div class="form-row">
      <div><label>পাসওয়ার্ড (কমপক্ষে ৬ ক্যারেক্টার)</label><input id="uf_password" type="password"></div>
      <div><label>পাসওয়ার্ড পুনরায় লিখুন</label><input id="uf_password2" type="password"></div>
    </div>
    <div class="form-row full"><label>রোল / এক্সেস লেভেল</label>
      <select id="uf_role">
        <option value="user">User (ইউজার — সীমিত অ্যাক্সেস)</option>
        <option value="manager">Manager (ম্যানেজার)</option>
        <option value="director">Director (ডাইরেক্টর)</option>
        <option value="admin">Admin (সম্পূর্ণ অ্যাক্সেস)</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" id="modalSaveBtn" onclick="saveUser()">সংরক্ষণ করুন</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('uf_name')?.focus(), 0);
}
async function saveUser(){
  const name = document.getElementById('uf_name').value.trim();
  const username = document.getElementById('uf_username').value.trim();
  const password = document.getElementById('uf_password').value;
  const password2 = document.getElementById('uf_password2').value;
  if(!name||!username||!password){ alert('সব ঘর পূরণ করুন'); return; }
  if(password.length < 6){ alert('পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে'); return; }
  if(password !== password2){ alert('দুই ঘরের পাসওয়ার্ড মিলছে না'); return; }
  if(DB.users.find(u=>u.username===username)){ alert('এই ইউজারনেম আগে থেকেই আছে'); return; }
  const newId = genId();
  const hash = await makePasswordRecord(username, password);
  fireWrite(fsDB.collection('erp_users').doc(String(newId)).set({id:newId, name, username, password:hash, role: document.getElementById('uf_role').value}), 'নতুন ইউজার');
  logAudit('নতুন ইউজার তৈরি', `${name} (${username})`);
  closeModal();
}
function deleteUser(id){
  const u = DB.users.find(x=>x.id===id); if(!u) return;
  if(currentUser && id===currentUser.id){ alert('নিজের অ্যাকাউন্ট নিজে মোছা যায় না।'); return; }
  if(u.id===1){ alert('প্রধান এডমিন মোছা যায় না।'); return; }
  if(u.role==='admin' && activeAdminCount(id)===0){ alert('কমপক্ষে একজন সক্রিয় এডমিন রাখতে হবে।'); return; }
  if(!confirm(`"${u.name}" (@${u.username}) কে স্থায়ীভাবে মুছে ফেলবেন?\n(এর করা আগের বিক্রয়/ক্রয়ের রেকর্ডে নাম থেকে যাবে। শুধু লগইন বন্ধ করতে চাইলে ⛔ ব্যবহার করুন।)`)) return;
  fireWrite(fsDB.collection('erp_users').doc(String(id)).delete(), 'ইউজার মোছা');
  logAudit('ইউজার মোছা', `${u.name} (@${u.username})`);
}
function openChangePasswordModal(){
  openModal(`
    <h3>নিজের পাসওয়ার্ড পরিবর্তন করুন</h3>
    <div class="form-row full"><label>বর্তমান পাসওয়ার্ড</label><input id="cp_old" type="password"></div>
    <div class="form-row full"><label>নতুন পাসওয়ার্ড (কমপক্ষে ৬ ক্যারেক্টার)</label><input id="cp_new" type="password"></div>
    <div class="form-row full"><label>নতুন পাসওয়ার্ড আবার লিখুন</label><input id="cp_confirm" type="password"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বাতিল</button>
      <button class="btn btn-gold" onclick="changeOwnPassword()">পরিবর্তন করুন</button>
    </div>
  `);
}
async function changeOwnPassword(){
  const oldP = document.getElementById('cp_old').value;
  const newP = document.getElementById('cp_new').value;
  const confirmP = document.getElementById('cp_confirm').value;
  if(!(await verifyPassword(currentUser.username, oldP, currentUser.password))){ alert('বর্তমান পাসওয়ার্ড ভুল!'); return; }
  if(newP.length < 6){ alert('নতুন পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে'); return; }
  if(newP !== confirmP){ alert('নতুন পাসওয়ার্ড দুই ঘরে মিলছে না'); return; }
  const newHash = await makePasswordRecord(currentUser.username, newP);
  fireWrite(fsDB.collection('erp_users').doc(String(currentUser.id)).update({password:newHash, mustChange:false}), 'পাসওয়ার্ড পরিবর্তন');
  logAudit('নিজের পাসওয়ার্ড পরিবর্তন', currentUser.name);
  closeModal();
  alert('পাসওয়ার্ড পরিবর্তন হয়েছে।');
}

/* ================= সেটিংস (দোকানের তথ্য / প্রিন্ট) ================= */
/* ================= সেটিংস (সব সেটিংস এক জায়গায়) ================= */
let settingsTab = 'shop';
function toast(msg){
  const old = document.getElementById('toastEl'); if(old) old.remove();
  const t = document.createElement('div'); t.className='toast'; t.id='toastEl'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2400);
}
function paperLabel(m){ return m==='thermal' ? '৮০মিমি থার্মাল' : (m==='thermal58' ? '৫৮মিমি থার্মাল' : 'A4 / A5'); }
function settingsTabList(){
  return [
    {k:'shop',    ic:'🏪', label:'দোকানের তথ্য',        min:'director'},
    {k:'print',   ic:'🖨️', label:'প্রিন্ট',              min:'user'},
    {k:'account', ic:'👤', label:'আমার অ্যাকাউন্ট',      min:'user'},
    {k:'users',   ic:'🔐', label:'ইউজার ম্যানেজমেন্ট',   min:'admin'},
    {k:'backup',  ic:'♻️', label:'ব্যাকআপ / রিস্টোর',    min:'director'},
    {k:'audit',   ic:'📜', label:'অ্যাক্টিভিটি লগ',      min:'admin'}
  ].filter(t=>hasAccess(t.min));
}
function renderSettings(){
  const tabs = settingsTabList();
  if(!tabs.find(t=>t.k===settingsTab)) settingsTab = tabs[0].k;
  document.getElementById('mainArea').innerHTML = `
    <div class="topbar"><div><h2>⚙️ সেটিংস</h2><div class="sub">দোকানের তথ্য, প্রিন্ট, অ্যাকাউন্ট ও সিস্টেমের সব সেটিংস এক জায়গায়</div></div></div>
    <div class="set-tabs">${tabs.map(t=>`<button class="set-tab ${t.k===settingsTab?'active':''}" onclick="switchSettingsTab('${t.k}')"><span>${t.ic}</span>${t.label}</button>`).join('')}</div>
    <div id="settingsBody"></div>`;
  renderSettingsBody();
}
function switchSettingsTab(k){ settingsTab = k; renderSettings(); }
function renderSettingsBody(){
  const host = document.getElementById('settingsBody'); if(!host) return;
  if(settingsTab==='users' || settingsTab==='backup' || settingsTab==='audit'){
    pageHostId = 'settingsBody';
    try{ ({users:renderUsers, backup:renderBackup, audit:renderAuditLog})[settingsTab](); }
    finally{ pageHostId = 'mainArea'; }
    return;
  }
  host.innerHTML = settingsTab==='shop' ? settingsShopHtml() : (settingsTab==='print' ? settingsPrintHtml() : settingsAccountHtml());
  if(settingsTab==='shop') updateShopPreview();
}
function settingsShopHtml(){
  const st = DB.settings || {};
  return `<div class="card set-card">
    <h3>🏪 দোকানের তথ্য</h3>
    <div class="recv-preview" id="shopPreview"></div>
    <div class="form-row full"><label>দোকান/প্রতিষ্ঠানের নাম</label><input id="st_name" value="${esc(st.shopName||'')}" oninput="updateShopPreview()"></div>
    <div class="form-row full"><label>ঠিকানা (ঐচ্ছিক)</label><input id="st_addr" value="${esc(st.address||'')}" oninput="updateShopPreview()"></div>
    <div class="form-row full"><label>ফোন নম্বর (ঐচ্ছিক)</label><input id="st_phone" value="${esc(st.phone||'')}" oninput="updateShopPreview()"></div>
    <div class="form-row full"><label>ভাউচারের নিচে ফুটার লাইন</label><input id="st_footer" value="${esc(st.footer||'')}" oninput="updateShopPreview()"></div>
    <button class="btn btn-gold" onclick="saveShopInfo()">💾 সংরক্ষণ করুন</button>
    <div class="set-note">উপরের বক্সটা ভাউচারের মাথায় ও নিচে যেভাবে ছাপা হবে তার নমুনা। এই তথ্য বিক্রয় ইনভয়েস, ক্রয় ভাউচার ও বাকি জমা/পরিশোধ রশিদে ব্যবহার হয়।</div>
  </div>`;
}
function updateShopPreview(){
  const el = document.getElementById('shopPreview'); if(!el) return;
  const v = id => (document.getElementById(id)?.value||'').trim();
  el.innerHTML = `<h4>${esc(v('st_name')||'ব্যবসা ম্যানেজার')}</h4>${v('st_addr')?`<div>${esc(v('st_addr'))}</div>`:''}${v('st_phone')?`<div>ফোন: ${esc(v('st_phone'))}</div>`:''}<div style="font-size:11px;color:var(--muted);margin-top:6px;">${esc(v('st_footer'))}</div>`;
}
function saveShopInfo(){
  const data = {
    shopName: document.getElementById('st_name').value.trim() || 'ব্যবসা ম্যানেজার',
    address: document.getElementById('st_addr').value.trim(),
    phone: document.getElementById('st_phone').value.trim(),
    footer: document.getElementById('st_footer').value.trim()
  };
  fireWrite(fsDB.collection('erp_settings').doc('business').set(data, {merge:true}), 'দোকানের তথ্য');
  logAudit('দোকানের তথ্য পরিবর্তন', data.shopName);
  toast('✅ সংরক্ষণ হয়েছে');
}
function settingsPrintHtml(){
  const st = DB.settings || {};
  const shopMode = (st.paperSize==='thermal' || st.paperSize==='thermal58') ? st.paperSize : 'a4';
  let pref = 'shop'; try{ pref = localStorage.getItem('erp_paper_pref') || 'shop'; }catch(e){}
  const canShop = hasAccess('director');
  return `<div class="grid g2">
    <div class="card">
      <h3>🖨️ এই ডিভাইসের কাগজ</h3>
      <div class="form-row full"><label>এই কম্পিউটার/মোবাইলে যে কাগজে ছাপবেন</label>
        <select id="dev_paper" onchange="setDevicePaper(this.value)">
          <option value="shop" ${pref==='shop'?'selected':''}>দোকানের ডিফল্ট অনুযায়ী (${paperLabel(shopMode)})</option>
          <option value="a4" ${pref==='a4'?'selected':''}>A4 / A5 (সাধারণ প্রিন্টার বা "Save as PDF")</option>
          <option value="thermal" ${pref==='thermal'?'selected':''}>৮০মিমি থার্মাল POS প্রিন্টার</option>
          <option value="thermal58" ${pref==='thermal58'?'selected':''}>৫৮মিমি থার্মাল প্রিন্টার</option>
        </select>
      </div>
      <div class="set-note">বর্তমানে এই ডিভাইসে ছাপা হবে: <b>${paperLabel(paperMode())}</b>। কাউন্টারের কম্পিউটারে ৮০মিমি আর মোবাইলে ৫৮মিমি — এভাবে প্রতিটা ডিভাইসে আলাদা রাখা যায়।</div>
      <button class="btn btn-outline" style="margin-top:12px;" onclick="testPrint()">🧾 টেস্ট প্রিন্ট করুন</button>
    </div>
    <div class="card">
      <h3>🏪 দোকানের ডিফল্ট কাগজ</h3>
      ${canShop ? `
      <div class="form-row full"><label>যে ডিভাইসে আলাদা পছন্দ দেওয়া নেই, সেখানে এটা ব্যবহার হবে</label>
        <select id="st_paper">
          <option value="a4" ${shopMode==='a4'?'selected':''}>A4 / A5</option>
          <option value="thermal" ${shopMode==='thermal'?'selected':''}>৮০মিমি থার্মাল</option>
          <option value="thermal58" ${shopMode==='thermal58'?'selected':''}>৫৮মিমি থার্মাল</option>
        </select>
      </div>
      <button class="btn btn-gold" onclick="savePrintDefault()">💾 সংরক্ষণ করুন</button>`
      : `<div class="set-note">দোকানের ডিফল্ট: <b>${paperLabel(shopMode)}</b> (বদলাতে ডাইরেক্টর/এডমিন লাগবে)</div>`}
    </div>
  </div>
  <div class="card" style="margin-top:16px;">
    <h3>💡 কম খরচে প্রিন্টের টিপস</h3>
    <ul style="margin-left:18px;line-height:1.9;font-size:13px;">
      <li>প্রিন্ট সম্পূর্ণ ফ্রি — ব্রাউজারের প্রিন্ট ডায়ালগ ব্যবহার হয়, কোনো পেইড সার্ভিস লাগে না।</li>
      <li>থার্মাল প্রিন্টারে কালি/টোনার লাগে না, শুধু কাগজের রোল — চলতি খরচ সবচেয়ে কম।</li>
      <li>পিসিতে: প্রিন্ট ডায়ালগে <b>Margins: None</b> দিন এবং <b>Headers and footers</b> বন্ধ রাখুন। বারবার ডায়ালগ এড়াতে ক্রোম শর্টকাটে <b>--kiosk-printing</b> যোগ করা যায়।</li>
      <li>প্রিন্টার না থাকলে ডায়ালগে "Save as PDF" বেছে হোয়াটসঅ্যাপে পাঠানো যায়।</li>
    </ul>
  </div>`;
}
function setDevicePaper(v){ setPaperPref(v); toast('✅ এই ডিভাইসের কাগজ: ' + (v==='shop' ? 'দোকানের ডিফল্ট' : paperLabel(v))); renderSettingsBody(); }
function savePrintDefault(){
  const v = document.getElementById('st_paper').value;
  fireWrite(fsDB.collection('erp_settings').doc('business').set({paperSize:v}, {merge:true}), 'প্রিন্ট সেটিংস');
  toast('✅ দোকানের ডিফল্ট কাগজ: ' + paperLabel(v));
}
function testPrint(){
  printDoc({title:'টেস্ট প্রিন্ট',
    meta:[['টেস্ট #','TEST-001'],['তারিখ',fmtDate(new Date())],['কাগজ',paperLabel(paperMode())]],
    items:[{name:'নমুনা পণ্য ১', qty:'২ কেজি', rate:money(100), sub:money(200)},{name:'নমুনা পণ্য ২', qty:'১ পিস', rate:money(50), sub:money(50)}],
    totals:[{label:'সর্বমোট', value:money(250), bold:true},{label:'জমা', value:money(200)},{label:'বাকি', value:money(50), bold:true}],
    footer: esc(DB.settings?.footer||'ধন্যবাদ')});
}
function settingsAccountHtml(){
  const u = currentUser;
  const isLight = document.documentElement.getAttribute('data-theme')==='light';
  return `<div class="card set-card">
    <h3>👤 আমার অ্যাকাউন্ট</h3>
    <div class="acct-row">
      <div class="brand-mark">${esc(u.name.charAt(0))}</div>
      <div><b style="font-size:15px;">${esc(u.name)}</b><div style="color:var(--muted);font-size:12.5px;">@${esc(u.username)}</div><span class="role-badge">${ROLE_NAME_BN[u.role]}</span></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-outline" onclick="openChangePasswordModal()">🔑 পাসওয়ার্ড পরিবর্তন</button>
      <button class="btn btn-outline" onclick="toggleTheme()">${isLight?'🌙 ডার্ক থিম':'☀️ লাইট থিম'}</button>
      <button class="btn btn-outline" onclick="logout()">🚪 লগআউট</button>
      ${SHOP_AUTH_REQUIRED?`<button class="btn btn-outline" onclick="disconnectShopDevice()">🔌 এই ডিভাইসের দোকান-সংযোগ বিচ্ছিন্ন করুন</button>`:''}
    </div>
    <div class="set-note">অ্যাপ ভার্সন: <b>${APP_VERSION}</b> • নিরাপত্তার জন্য ২০ মিনিট নিষ্ক্রিয় থাকলে নিজে থেকে লগআউট হয়ে যাবে।</div>
  </div>`;
}
/* ================= About / Help ================= */
function openAbout(){
  openModal(`
    <div class="entry-head"><h3>ℹ️ About — অ্যাপ সম্পর্কে</h3></div>
    <div class="entry-body">
      <div class="about-banner">
        <div class="brand-mark">৳</div>
        <div><h2>ব্যবসা ম্যানেজার</h2><div>Smart Business ERP • ভার্সন ${APP_VERSION}</div>
        <div style="font-size:12px;opacity:.9;margin-top:3px;">বিক্রয় • ক্রয় • স্টক • বাকি • খরচ • লাভ-ক্ষতি • অফলাইন সিঙ্ক • প্রিন্ট</div></div>
      </div>
      <div class="about-dev">
        <div><b>Developed by:</b></div>
        <div class="co">Easy Tech Solution &amp; Web App Solution, BD.</div>
      </div>
      <div class="about-links">
        <a class="about-link" href="tel:01869866899">📞 01869866899</a>
        <a class="about-link" href="mailto:info.wasbd@gmail.com">✉️ info.wasbd@gmail.com</a>
        <a class="about-link" href="https://wasbd.github.io/appbazar/" target="_blank" rel="noopener">🌐 Web</a>
        <a class="about-link" href="https://web.facebook.com/etsctg" target="_blank" rel="noopener">📘 Facebook</a>
      </div>
      <div class="set-note" style="text-align:center;">অ্যাপ সংক্রান্ত যেকোনো সহায়তা, কাস্টমাইজেশন বা নতুন অ্যাপ তৈরির জন্য যোগাযোগ করুন।<br>© 2026 Easy Tech Solution &amp; Web App Solution, BD.</div>
    </div>
    <div class="entry-foot"><div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
      <button class="btn btn-gold" onclick="openHelp()">❓ ব্যবহার নির্দেশিকা</button>
    </div></div>`);
  document.getElementById('modalBox').className = 'modal entry-modal';
}
function helpFilter(q){
  q = (q||'').trim().toLowerCase();
  document.querySelectorAll('#helpBody .help-sec').forEach(d=>{
    const m = !q || d.textContent.toLowerCase().includes(q);
    d.style.display = m ? '' : 'none';
    if(q && m) d.open = true;
  });
}
function openHelp(){
  const secs = [
  ['🚀 দ্রুত শুরু (৫ ধাপ)', `
    <ol>
      <li><b>লগইন করুন</b> — প্রথমবার চালু করলে এডমিন ইউজার (<b>admin</b>) ও একটা র‍্যান্ডম পাসওয়ার্ড লগইন-বক্সে একবার দেখানো হয় — কাগজে লিখে রাখুন। লগইনের পর নতুন পাসওয়ার্ড দিতে বলা হবে। নতুন ডিভাইসে প্রথমে মালিকের দেওয়া <b>দোকান-সংযোগ</b> (ইমেইল/পাসওয়ার্ড) লাগে।</li>
      <li><b>দোকানের তথ্য দিন</b> — <i>সেটিংস → দোকানের তথ্য</i>: নাম, ঠিকানা, ফোন। এগুলো ভাউচারে ছাপা হবে।</li>
      <li><b>পণ্য যোগ করুন</b> — <i>স্টক ম্যানেজমেন্ট → + নতুন পণ্য</i>: নাম, একক, ওপেনিং স্টক, ক্রয়মূল্য, বিক্রয়মূল্য।</li>
      <li><b>কাস্টমার/সাপ্লায়ার</b> — <i>বাকি/দেনা-পাওনা</i> পেজ থেকে, অথবা বিক্রয়/ক্রয় ফর্মের পাশের <b>+</b> বাটন থেকে।</li>
      <li><b>প্রথম বিক্রয়</b> — <kbd>F2</kbd> চাপুন (বা নিচে-ডানের "নতুন বিক্রয়" বাটন) এবং এন্ট্রি দিন।</li>
    </ol>
    <div class="help-tip">💡 নতুন "নতুন বিক্রয়/ক্রয়" বাটন দুটো যেকোনো পেজে সবসময় দেখা যায়, পেজ বদলানো লাগে না।</div>`],
  ['👥 ইউজার রোল — কে কী করতে পারে', `
    <table><tr><th>রোল</th><th>যা যা পারে</th></tr>
    <tr><td><b>User</b></td><td>ড্যাশবোর্ড, বিক্রয় এন্ট্রি, স্টক দেখা, নিজের এন্ট্রি এডিট, প্রিন্ট ও পাসওয়ার্ড বদল</td></tr>
    <tr><td><b>Manager</b></td><td>উপরেরগুলো + ক্রয়, বাকি/দেনা-পাওনা, খরচ, পণ্য যোগ/এডিট, যেকোনো এন্ট্রি এডিট/মোছা, ক্রয়মূল্য ও লাভ দেখা</td></tr>
    <tr><td><b>Director</b></td><td>উপরেরগুলো + লাভ-ক্ষতির রিপোর্ট, দোকানের তথ্য ও ডিফল্ট প্রিন্ট সেটিং, ব্যাকআপ/রিস্টোর</td></tr>
    <tr><td><b>Admin</b></td><td>সব কিছু + ইউজার ম্যানেজমেন্ট, অ্যাক্টিভিটি লগ, সম্পূর্ণ ডেটা মোছা</td></tr></table>
    <div class="help-tip">যার যতটুকু অনুমতি, সেটিংস ও মেনুতে শুধু ততটুকুই দেখা যায়।</div>`],
  ['🧾 নতুন বিক্রয় এন্ট্রি', `
    <ol>
      <li><kbd>F2</kbd> বা "নতুন বিক্রয়" বাটন চাপুন। তারিখ ও কাস্টমার বাছুন। নতুন কাস্টমার হলে পাশের <b>+</b> চাপুন, নাম/মোবাইল দিয়ে সাথে সাথে যোগ করুন।</li>
      <li><b>পণ্য ঘরে</b> ক্লিক করলেই তালিকা খোলে (নাম লিখলে ছোট হয়ে আসে) → <kbd>↑</kbd><kbd>↓</kbd> দিয়ে বাছুন → <kbd>Enter</kbd>। প্রতিটা সাজেশনে বিক্রয়মূল্য ও স্টক দেখায়। মাউস/টাচে ট্যাপ করলেও হয়।</li>
      <li><b>পরিমাণ</b> লিখে <kbd>Enter</kbd> — লাইনটা নিচের তালিকায় যোগ হয় আর কার্সর আবার পণ্য ঘরে ফিরে আসে।</li>
      <li>সব পণ্য হলে <b>পণ্য ঘর খালি রেখে</b> <kbd>Enter</kbd> চাপুন — কার্সর সোজা "জমা" ঘরে যাবে।</li>
      <li>তালিকার প্রতিটা লাইনে ✏️ (এডিট — পরিমাণ/পণ্য বদলান) ও 🗑️ (মুছুন)।</li>
      <li>পণ্যে <b>বিকল্প একক</b> থাকলে (যেমন বস্তা/কেজি) পরিমাণের পাশে একক বেছে নেওয়া যায়; স্টক সবসময় প্রধান এককে কাটে।</li>
      <li><b>ডিসকাউন্ট</b> — % বা টাকা, যেকোনো একটায় লিখলে অন্যটা নিজে হিসাব হয়।</li>
      <li><b>জমা</b> — যত টাকা পেলেন। কম হলে বাকি থাকে (কাস্টমারের খাতায় যোগ হয়)। বেশি দিলে সবুজ বক্সে <b>"ফেরত দিন"</b> দেখায় — বাকি কখনো ঋণাত্মক হয় না।</li>
      <li>জমা ঘরে <kbd>Enter</kbd> বা "বিক্রয় সংরক্ষণ করুন" চাপলেই সেভ।</li>
    </ol>
    <div class="help-warn">⚠️ স্টকের বেশি বিক্রি করা যায় না — লাল বার্তায় সর্বোচ্চ কত যোগ করা যাবে বলে দেয়। ফর্মের বাইরে ক্লিক করলে ফর্ম বন্ধ হয় না; বন্ধ করতে "বাতিল" বা <kbd>Esc</kbd>।</div>`],
  ['🛒 নতুন ক্রয় এন্ট্রি (ম্যানেজার+)', `
    <ol>
      <li><kbd>F3</kbd> বা "নতুন ক্রয়" বাটন। সাপ্লায়ার বাছুন (নতুন হলে <b>+</b>)।</li>
      <li>পণ্য বাছুন → পরিমাণ লিখে <kbd>Enter</kbd> → <b>ক্রয়মূল্য (আজকের দাম)</b> দেখে <kbd>Enter</kbd> — লাইন যোগ হবে।</li>
      <li><b>দাম বাড়লে/কমলে নতুন পণ্য খোলার দরকার নেই।</b> আজকের দাম লিখুন; অ্যাপ নিজে "গড় ক্রয়মূল্য" হিসাব করে। উদাহরণ: ১০ ডজন ডিম ১৫০ টাকায় আছে, আরও ১০ ডজন ১৬০ টাকায় কিনলে নতুন গড় = ১৫৫ টাকা; বিক্রয়ের লাভ এই গড়ের ভিত্তিতে হবে।</li>
      <li><b>নতুন বিক্রয়মূল্য</b> ঘরে লিখলে ক্রয়ের সাথেই বিক্রয়মূল্য বদলে যায়; ফাঁকা রাখলে আগের দামই থাকে। দাম বদলালে অ্যাপ আগের লাভের হার ঠিক রাখার মতো একটা মূল্য পরামর্শ দেয়, আর লোকসানের সম্ভাবনা থাকলে লাল সতর্কতা দেখায়।</li>
      <li><b>নতুন পণ্য?</b> পণ্য-ঘরের পাশের <b>＋</b> চাপুন (বা তালিকার "নতুন পণ্য যোগ করুন" ধরনে ট্যাপ করুন; নাম লিখে কোনো মিল না পেলে <kbd>Enter</kbd>-ও চলে)। নাম, একক ও দাম দিলেই পণ্য তৈরি হয়ে বাছাই হয়ে যায় — স্টক পেজে যেতে হয় না। স্টক ০ থেকে শুরু; এই ক্রয়ই স্টক বাড়ায়।</li>
      <li><b>রং/শেলফ</b> (ঐচ্ছিক) — নতুন রং লিখলে সেই রঙের আলাদা পণ্য তৈরি হয়; আগে থাকলে তার স্টক বাড়ে।</li>
      <li>জমা/বাকি/ফেরত — বিক্রয়ের মতোই; বাকি থাকলে সাপ্লায়ারের দেনায় যোগ হয়।</li>
    </ol>`],
  ['✏️ এন্ট্রি দেখা, এডিট, প্রিন্ট, মোছা', `
    <ul>
      <li>বিক্রয়/ক্রয় পেজে ডিফল্টে <b>আজকের</b> এন্ট্রি (রিয়েল-টাইম)। পুরনো এন্ট্রির জন্য তারিখ রেঞ্জ বদলান; "সব সময়" দিলে সাম্প্রতিক ৫০০টি আসে।</li>
      <li><b>ভাউচার নম্বরে ক্লিক</b> (নীল, আন্ডারলাইন) = এডিট। যে ইউজার এন্ট্রি করেছে সে নিজে অথবা ম্যানেজার+ এডিট করতে পারে। এডিটে স্টক, বাকি ও হিসাব নিজে ঠিক হয়ে যায়।</li>
      <li>👁️ বিস্তারিত • 🖨️ প্রিন্ট • 📤 ছবি শেয়ার • ↩️ পণ্য ফেরত • 💳 বাকি পরিশোধ (বাকি থাকলে) • 🗑️ মোছা (ম্যানেজার+; মুছলে স্টক ফেরত যায়)।</li>
      <li><b>↩️ বিক্রয় ফেরত:</b> ভাউচারের ↩️ চেপে ফেরত আসা পণ্যের পরিমাণ দিন। পণ্য স্টকে যোগ হয়, বিক্রয় ও লাভ থেকে বাদ যায়। ভাউচারে বাকি থাকলে ফেরতের মূল্য আগে সেখান থেকে কাটা হয়, বাকিটা <b>নগদ ফেরত</b> দিতে হয়। প্রতিবার আলাদা ফেরত-রশিদ (RET-) প্রিন্ট/শেয়ার করা যায়। ফেরত থাকা ভাউচার মোছা/এডিট করা যায় না। পণ্য বদল করতে চাইলে ফেরত নিয়ে নতুন বিক্রয় দিন।</li>
      <li><b>"ভিউ"</b> ড্রপডাউনে "পণ্য-ভিত্তিক রিপোর্ট" বাছলে প্রতিটা পণ্য-লাইন আলাদা সারিতে দেখায় — তারিখ, পণ্য, পরিমাণ, দর, মোট, লাভ (বিক্রয়ে), পার্টি, এন্ট্রি করেছেন, অ্যাকশন।</li>
      <li>পেজের নিচে <b>ইউজার-ভিত্তিক সারাংশ</b> — কে কত টাকার বিক্রয়/ক্রয় করেছে।</li>
    </ul>`],
  ['💰 বাকি / দেনা-পাওনা', `
    <ul>
      <li>ডান পাশে কাস্টমারের পাওনা, বাম পাশে সাপ্লায়ারের দেনা। "জমা নিন"/"পরিশোধ করুন" দিয়ে সামগ্রিক বাকি মেটানো যায়।</li>
      <li>নির্দিষ্ট ভাউচারের বাকি মেটাতে সেই এন্ট্রির <b>💳</b> বাটন চাপুন — ভাউচারে কত পরিশোধ হলো তা সেখানেই লেখা থাকে। পরে আবার ক্লিক করে বাকিটুকুও দেওয়া যায়।</li>
      <li>প্রতিটা পরিশোধের পর <b>রশিদ প্রিন্ট</b>-এর অপশন আসে। পেজের নিচের "সাম্প্রতিক রেকর্ড" থেকে পরেও যেকোনো রশিদ আবার প্রিন্ট করা যায়।</li>
    </ul>`],
  ['📒 ক্যাশবুক', `
    <p>হাতে লেখা ক্যাশবইয়ের মতোই — একপাশে <b>প্রাপ্তি</b> (নগদ জমা), অন্যপাশে <b>পরিশোধ</b> (নগদ খরচ), নিচে সমাপনী জের।</p>
    <ul>
      <li>উপরে তারিখ বাছুন (◀ ▶ বা "আজ")। প্রাপ্তি-কলামে সেদিনের বিক্রয়ে পাওয়া নগদ ও বাকি-আদায়; পরিশোধ-কলামে ক্রয়ের নগদ, সাপ্লায়ারকে বাকি-পরিশোধ, খরচ ও বিক্রয়-ফেরতের নগদ — এগুলো অ্যাপ নিজে বিক্রয়/ক্রয়/বাকি/খরচ/ফেরতের এন্ট্রি থেকে টেনে আনে, হাতে আলাদা করে লিখতে হয় না।</li>
      <li><b>শুরুর জের (ওপেনিং ব্যালেন্স)</b> — প্রতিদিনের জন্য একবার সেভ করে রাখুন। পরদিন থেকে "⬅️ গতকালের সমাপনী আনুন" চাপলেই আগের দিনের সমাপনী জের এই দিনের শুরুর জের হিসেবে বসে যায়।</li>
      <li>সমাপনী জের = শুরুর জের + মোট প্রাপ্তি − মোট পরিশোধ। হিসাব না মিললে বুঝতে হবে হাতে থাকা নগদ ও হিসাবের মধ্যে গরমিল আছে — কোন লাইনে সমস্যা তা এই পেজ থেকেই ধরা যায়।</li>
      <li>🖨️ প্রিন্ট (A4-তে পাশাপাশি দুই কলাম, থার্মালে একটার পর একটা) ও 📤 ছবি করে শেয়ার — দুটোই আছে।</li>
    </ul>`],
  ['📦 স্টক ম্যানেজমেন্ট', `
    <ul>
      <li>উপরের বক্সে নাম/ব্র্যান্ড/শেলফ/রং লিখে খুঁজুন; "অবস্থা" দিয়ে ফিল্টার (ঠিক আছে/কম স্টক/স্টক শেষ) ও "সর্ট" করা যায়।</li>
      <li><b>নতুন পণ্য:</b> নাম, ব্র্যান্ড, সাইজ, রং, শেলফ, <b>প্রধান একক</b>, <b>ওপেনিং স্টক</b> (প্রধান এককে), <b>বিকল্প একক</b> ও <b>কনভার্সন</b> (১ বিকল্প একক = কত প্রধান একক), ক্রয়মূল্য (ওপেনিং স্টকের), বিক্রয়মূল্য, লো-স্টক সীমা।</li>
      <li>উদাহরণ: চাল — প্রধান একক কেজি, বিকল্প একক বস্তা, কনভার্সন ৫০। ক্রয়ে "২ বস্তা" লিখলে স্টকে ১০০ কেজি যোগ হয়; বিক্রয়ে কেজি বা বস্তা যেকোনোটায় দেওয়া যায়।</li>
      <li><b>🕓 হিস্টোরি</b> — কোন ক্রয়/বিক্রয় ভাউচার থেকে স্টক কতটা বাড়ল/কমল তার পুরো তালিকা ও চলতি ব্যালেন্স। <b>স্টকে গরমিল হলে এখান থেকেই কারণ খুঁজুন।</b></li>
      <li>পণ্য এডিট করে হাতে স্টক সংখ্যা বদলালে সেটা "ম্যানুয়াল সমন্বয়" হিসেবে হিস্টোরিতে লেখা থাকে।</li>
      <li>লো-স্টক পণ্য ড্যাশবোর্ডেও দেখায়।</li>
    </ul>`],
  ['💵 খরচ, 📊 ড্যাশবোর্ড ও 📈 রিপোর্ট', `
    <ul>
      <li><b>খরচ</b> পেজে খাত, পরিমাণ, তারিখ ও নোট দিয়ে খরচ যোগ করুন (ম্যানেজার+)।</li>
      <li><b>ড্যাশবোর্ড:</b> সর্বমোট বিক্রয়/ক্রয়/খরচ/নীট লাভ, কাস্টমার বাকি ও সাপ্লায়ার দেনা, ৭ দিনের বিক্রয়-বনাম-ক্রয় ও লাভের ট্রেন্ড, আজকের খরচের বিভাজন, লো-স্টক তালিকা।</li>
      <li><b>রিপোর্ট</b> (ডাইরেক্টর+): উপরে তারিখ বা "এই মাস/গত মাস/এই বছর" বাছুন। ট্যাব: <b>সারসংক্ষেপ</b> (বিক্রয়, COGS, গ্রস লাভ, খরচ, নীট লাভ), <b>দিনভিত্তিক/মাসভিত্তিক</b> (টেবিল ও চার্ট), <b>পণ্যভিত্তিক লাভ</b> (কোন পণ্যে কত বিক্রয় ও লাভ), <b>পার্টি/ইউজার</b> (কাস্টমার, সাপ্লায়ার ও ইউজারভিত্তিক)। লাভ = বিক্রয় − বিক্রিত পণ্যের (গড়) ক্রয়মূল্য − খরচ। পণ্যভিত্তিক ও পার্টি রিপোর্টে "রিপোর্ট তৈরি করুন" চাপতে হয় (ওই সময়ের এন্ট্রি পড়ে হিসাব করে)। যেকোনো রিপোর্ট <b>🖨️ প্রিন্ট</b> বা <b>⬇️ CSV</b> (Excel) করা যায়।</li>
    </ul>`],
  ['🖨️ প্রিন্ট (A4 / থার্মাল)', `
    <ul>
      <li>বিক্রয় ইনভয়েস, ক্রয় ভাউচার ও বাকি জমা/পরিশোধ রশিদ — সবই 🖨️ বাটনে প্রিন্ট হয়। সম্পূর্ণ ফ্রি, ব্রাউজারের প্রিন্ট ডায়ালগ ব্যবহার হয়।</li>
      <li><i>সেটিংস → প্রিন্ট</i> থেকে এই ডিভাইসের কাগজ বাছুন: A4/A5, ৮০মিমি বা ৫৮মিমি থার্মাল। "টেস্ট প্রিন্ট" দিয়ে আগে দেখে নিন। দোকানের ডিফল্ট কাগজ বদলাতে ডাইরেক্টর/এডমিন লাগে।</li>
      <li>ডায়ালগে <b>Margins: None</b> ও <b>Headers and footers: বন্ধ</b> রাখুন; থার্মাল প্রিন্টারের কাগজের সাইজ রোলের মাপ অনুযায়ী দিন।</li>
      <li>প্রিন্টার না থাকলে "Save as PDF" বেছে ফাইল রাখুন বা হোয়াটসঅ্যাপে পাঠান।</li>
      <li><b>📤 শেয়ার:</b> বিক্রয়/ক্রয়/রশিদের পাশের 📤 বাটনে চাপলে ভাউচারটা রসিদ-ধাঁচের একটা ছবি (PNG) হয়ে আসে। "শেয়ার" চেপে হোয়াটসঅ্যাপ ইত্যাদিতে পাঠান, অথবা "ডাউনলোড" করে attach করুন। "টেক্সট (WhatsApp)" বাটনে কাস্টমারের নম্বরে (থাকলে) সারসংক্ষেপ লেখা সহ হোয়াটসঅ্যাপ খোলে।</li>
    </ul>`],
  ['📶 অফলাইনে কাজ ও সিঙ্ক', `
    <ul>
      <li>ইন্টারনেট না থাকলেও এন্ট্রি দেওয়া যায় — ডিভাইসেই জমা থাকে। বাম মেনুর নিচের ব্যাজে "অফলাইন — (N টি বাকি)" দেখায়।</li>
      <li>ইন্টারনেট ফিরলে <b>নিজে নিজেই সিঙ্ক</b> হয়ে যায়; ব্যাজে "সিঙ্ক হচ্ছে" ও শেষে "সব সিঙ্ক আছে" দেখায়। আলাদা কিছু করতে হয় না।</li>
      <li>অফলাইনে যে তারিখের ডেটা আগে ডিভাইসে লোড হয়নি সেটা নাও দেখা যেতে পারে। ব্যাকআপ রিস্টোর ও সম্পূর্ণ ডেটা মোছায় ইন্টারনেট লাগে।</li>
      <li>লগইন পেজের "অ্যাপ হিসেবে ইনস্টল করুন" বাটনে চাপলে মোবাইল/পিসিতে অ্যাপের মতো চালানো যায়।</li>
    </ul>`],
  ['🔐 নিরাপত্তা ও ব্যাকআপ', `
    <ul>
      <li>ডেটাবেসে ঢুকতে প্রতিটা ডিভাইসে একবার <b>দোকান-সংযোগ</b> (Firebase ইমেইল/পাসওয়ার্ড) লাগে — তাই সাইটের ঠিকানা জানলেই কেউ ডেটা দেখতে পারে না। পাবলিক কম্পিউটারে কাজ শেষে <i>সেটিংস → আমার অ্যাকাউন্ট → দোকান-সংযোগ বিচ্ছিন্ন</i> করুন।</li>
      <li>ইউজারের পাসওয়ার্ড শক্তিশালী পদ্ধতিতে (PBKDF2) হ্যাশ করে সংরক্ষিত হয় (কমপক্ষে ৬ অক্ষর)। ৫ বার ভুল দিলে ৫ মিনিট লগইন বন্ধ থাকে। ২০ মিনিট নিষ্ক্রিয় থাকলে নিজে লগআউট হয়।</li>
      <li><b>ইউজার ম্যানেজমেন্ট</b> (এডমিন): নতুন ইউজার, ✏️ নাম/রোল বদল, 🔑 পাসওয়ার্ড রিসেট, ⛔ লগইন বন্ধ/চালু, 🗑️ মোছা। কমপক্ষে একজন সক্রিয় এডমিন সবসময় থাকে।</li>
      <li><i>সেটিংস → অ্যাক্টিভিটি লগ</i> (এডমিন): লগইন, ডিলিট, এডিট, ব্যাকআপ ইত্যাদি কে কখন করেছে।</li>
      <li><b>ব্যাকআপ:</b> <i>সেটিংস → ব্যাকআপ / রিস্টোর</i> থেকে নিয়মিত (অন্তত সপ্তাহে একবার) JSON ফাইল ডাউনলোড করে পেনড্রাইভ/ক্লাউডে রাখুন। রিস্টোর করলে বর্তমান ডেটা প্রতিস্থাপিত হয়।</li>
      <li>ডেটাবেসের আসল নিরাপত্তার জন্য Firebase Console-এ <b>firestore.rules.txt</b> ফাইলের Rules বসিয়ে রাখুন।</li>
    </ul>`],
  ['⌨️ কিবোর্ড শর্টকাট', `
    <table><tr><th>কী</th><th>কাজ</th></tr>
    <tr><td><kbd>F2</kbd></td><td>যেকোনো পেজ থেকে নতুন বিক্রয়</td></tr>
    <tr><td><kbd>F3</kbd></td><td>যেকোনো পেজ থেকে নতুন ক্রয় (ম্যানেজার+)</td></tr>
    <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>পণ্যের তালিকায় ওঠানামা</td></tr>
    <tr><td><kbd>Enter</kbd></td><td>পণ্য বাছাই → পরিমাণ → লাইন যোগ (ক্রয়ে পরিমাণের পর দাম)। খালি পণ্য-ঘরে Enter = "জমা" ঘরে যাওয়া</td></tr>
    <tr><td><kbd>Tab</kbd></td><td>হাইলাইট করা পণ্য বাছাই করে পরিমাণে যাওয়া</td></tr>
    <tr><td><kbd>Backspace</kbd></td><td>খালি পরিমাণ ঘরে চাপলে পণ্য ঘরে ফেরা</td></tr>
    <tr><td><kbd>Esc</kbd></td><td>পণ্যের তালিকা বন্ধ; তালিকা বন্ধ থাকলে ফর্ম বন্ধ</td></tr></table>`],
  ['🛠️ সমস্যা ও সমাধান', `
    <ul>
      <li><b>স্টক মিলছে না</b> → স্টক পেজে ওই পণ্যের 🕓 চাপুন, ভাউচার ধরে ধরে দেখুন।</li>
      <li><b>ভুল এন্ট্রি হয়েছে</b> → ভাউচার নম্বরে ক্লিক করে এডিট করুন, অথবা 🗑️ দিয়ে মুছে নতুন দিন (স্টক ও বাকি নিজে ঠিক হয়)।</li>
      <li><b>পণ্য তালিকায় আসছে না</b> → নামের অংশ/ব্র্যান্ড লিখে দেখুন; স্টক পেজে পণ্যটা আছে কিনা দেখুন।</li>
      <li><b>"Missing or insufficient permissions"</b> → Firebase Console → Firestore → Rules এ firestore.rules.txt-এর রুলস বসিয়ে Publish করুন।</li>
      <li><b>"The query requires an index"</b> → কনসোলের এররে দেওয়া লিংকে ক্লিক করে ইনডেক্স তৈরি করুন; কয়েক মিনিট পর ঠিক হবে।</li>
      <li><b>প্রিন্ট ছোট/বড় আসছে</b> → <i>সেটিংস → প্রিন্ট</i>-এ কাগজের ধরন বদলান; ডায়ালগে Scale 100% রাখুন।</li>
      <li><b>ড্যাশবোর্ড/রিপোর্টে ০ বা কম আসছে</b> → <i>সেটিংস → ব্যাকআপ / রিস্টোর → 🔄 হিসাব পুনঃগণনা</i> চাপুন (ডাইরেক্টর/এডমিন)। পুরনো এন্ট্রির সারসংক্ষেপ নতুন করে তৈরি হবে।</li>
      <li><b>কাস্টমার/সাপ্লায়ার মুছতে</b> → বাকি/দেনা-পাওনা পেজে 🗑️ (বাকি ০ হলে এবং অন্তত একজন বাকি থাকলে)।</li>
      <li><b>লগইন বন্ধ</b> → ৫ বার ভুল পাসওয়ার্ডের পর ৫ মিনিট অপেক্ষা করুন।</li>
    </ul>`]
  ];
  openModal(`
    <div class="entry-head"><h3>❓ Help — ব্যবহার নির্দেশিকা</h3></div>
    <div class="entry-body">
      <input type="search" placeholder="🔍 নির্দেশিকায় খুঁজুন (যেমন: ডিসকাউন্ট, প্রিন্ট, ব্যাকআপ)..." oninput="helpFilter(this.value)" style="margin-bottom:12px;width:100%;">
      <div id="helpBody">${secs.map((x,i)=>`<details class="help-sec" ${i===0?'open':''}><summary>${x[0]}</summary><div class="hb">${x[1]}</div></details>`).join('')}</div>
    </div>
    <div class="entry-foot"><div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">বন্ধ করুন</button>
      <button class="btn btn-gold" onclick="openAbout()">ℹ️ About</button>
    </div></div>`);
  document.getElementById('modalBox').className = 'modal entry-modal help-modal';
}

/* ================= অ্যাক্টিভিটি লগ (Admin only) ================= */
async function renderAuditLog(){
  pageHost().innerHTML = `
    <div class="topbar"><div><h2>অ্যাক্টিভিটি লগ</h2><div class="sub">সাম্প্রতিক ১০০টি স্পর্শকাতর কাজ (লগইন, ডিলিট, ডেটা মোছা/রিস্টোর ইত্যাদি)</div></div></div>
    <div class="card"><div class="tbl-wrap" id="auditWrap"><div style="text-align:center;color:var(--muted);padding:20px;">লোড হচ্ছে...</div></div></div>
  `;
  const log = await loadAuditLog();
  if(!document.getElementById('auditWrap')) return;
  document.getElementById('auditWrap').innerHTML = `
    <table>
      <tr><th>সময়</th><th>ইউজার</th><th>কাজ</th><th>বিবরণ</th></tr>
      ${log.map(l=>`<tr><td style="white-space:nowrap;">${new Date(l.at).toLocaleString('bn-BD')}</td><td>${esc(l.user)} (${esc(l.username)})</td><td>${esc(l.action)}</td><td>${esc(l.detail||'-')}</td></tr>`).join('')
        || `<tr><td colspan="4" style="text-align:center;color:var(--muted);">কোনো লগ নেই</td></tr>`}
    </table>
  `;
}

/* ================= BACKUP / RESTORE ================= */
function renderBackup(){
  pageHost().innerHTML = `
    <div class="topbar"><div><h2>ব্যাকআপ / রিস্টোর</h2><div class="sub">আপনার সকল ডেটা নিরাপদে সংরক্ষণ করুন</div></div></div>
    <div class="grid g2">
      <div class="card">
        <h3>⬇️ ব্যাকআপ ডাউনলোড করুন</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:14px;">সমস্ত বিক্রয়, ক্রয়, স্টক, খরচ ও ইউজার তথ্য একটি JSON ফাইলে সংরক্ষণ হবে।</p>
        <button class="btn btn-gold" id="backupBtn" onclick="downloadBackup()">ব্যাকআপ ডাউনলোড করুন</button>
      </div>
      <div class="card">
        <h3>⬆️ ব্যাকআপ রিস্টোর করুন</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:14px;">⚠️ রিস্টোর করলে বর্তমান সব ডেটা প্রতিস্থাপিত হবে। সতর্কতার সাথে ব্যবহার করুন। (এই কাজটার জন্য ইন্টারনেট লাগবে)</p>
        <input type="file" id="restoreFile" accept=".json" style="margin-bottom:12px;color:var(--muted);">
        <br><button class="btn btn-danger" id="restoreBtn" onclick="restoreBackup()">রিস্টোর করুন</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h3>🔄 হিসাব পুনঃগণনা (ড্যাশবোর্ড/রিপোর্ট ঠিক করুন)</h3>
      <p style="color:var(--muted);font-size:13px;margin-bottom:14px;line-height:1.8;">ড্যাশবোর্ড ও লাভ-ক্ষতির রিপোর্ট দ্রুত রাখতে দৈনিক সারসংক্ষেপ জমা রাখা হয়। আপডেটের আগের পুরনো এন্ট্রির সারসংক্ষেপ না থাকলে রিপোর্টে ০ বা কম আসে। এই বাটন সব বিক্রয়/ক্রয়/খরচ আবার পড়ে সারসংক্ষেপ নতুন করে বানিয়ে দেয় (আপনার এন্ট্রি বদলায় না; ইন্টারনেট লাগে)।</p>
      <button class="btn btn-gold" id="rebuildBtn" onclick="rebuildStatsFromData()">🔄 সারসংক্ষেপ পুনঃগণনা করুন</button>
    </div>
    ${hasAccess('admin') ? `
    <div class="card" style="margin-top:16px;border-color:var(--pill-bad-bg);">
      <h3 style="color:var(--danger-text);">⚠️ ডেঞ্জার জোন — সম্পূর্ণ ব্যবসায়িক ডেটা মুছে ফেলুন</h3>
      <p style="color:var(--muted);font-size:13px;margin-bottom:14px;">
        এটি সমস্ত পণ্য/স্টক, বিক্রয়, ক্রয়, কাস্টমার, সাপ্লায়ার ও খরচের তথ্য স্থায়ীভাবে মুছে দেবে —
        যেন নতুন করে শুরু করছেন। <b>ইউজার একাউন্টগুলো (লগইন) অক্ষত থাকবে</b>, তাই লগআউট হবেন না।
        এই কাজ ফিরিয়ে আনা যাবে না — আগে অবশ্যই উপরের "ব্যাকআপ ডাউনলোড করুন" চেপে একটা কপি রেখে দিন।
      </p>
      <button class="btn btn-danger" onclick="wipeAllData()">🗑️ সম্পূর্ণ ব্যবসায়িক ডেটা মুছে ফেলুন</button>
    </div>` : ''}
  `;
}
async function wipeAllData(){
  if(!hasAccess('admin')) return;
  if(!navigator.onLine){ alert('এই কাজের জন্য ইন্টারনেট সংযোগ লাগবে।'); return; }
  if(!confirm('⚠️ এটি সমস্ত পণ্য, বিক্রয়, ক্রয়, কাস্টমার, সাপ্লায়ার ও খরচের ডেটা স্থায়ীভাবে মুছে ফেলবে। ইউজার একাউন্ট থাকবে। এই কাজ ফিরিয়ে আনা যাবে না। আপনি কি নিশ্চিত?')) return;
  const typed = prompt('নিশ্চিত করতে নিচের ঘরে ঠিক এই কথাটা লিখুন: মুছে ফেলুন');
  if(typed !== 'মুছে ফেলুন'){ alert('লেখাটা মিলেনি — বাতিল করা হলো, কোনো ডেটা মোছা হয়নি।'); return; }
  try{
    const collections = ['erp_products','erp_customers','erp_suppliers','erp_sales','erp_purchases','erp_expenses','erp_stock_moves','erp_daystats'];
    for(const collName of collections){
      const snap = await fsDB.collection(collName).get();
      const docs = snap.docs;
      for(let i=0;i<docs.length;i+=400){
        const batch = fsDB.batch();
        docs.slice(i,i+400).forEach(d=>batch.delete(d.ref));
        await batch.commit();
      }
    }
    await fsDB.collection('erp_stats').doc('alltime').set({totalSales:0,totalPurchase:0,totalExpense:0,totalCogs:0,salesCount:0,purchaseCount:0});
    logAudit('সম্পূর্ণ ব্যবসায়িক ডেটা মুছে ফেলা হলো', '');
    alert('সম্পূর্ণ ব্যবসায়িক ডেটা মুছে ফেলা হয়েছে। পেজ রিলোড হচ্ছে...');
    location.reload();
  }catch(err){
    alert('মুছতে সমস্যা হয়েছে: ' + err.message);
  }
}
/* ব্যাকআপে অবশ্যই সম্পূর্ণ ইতিহাস (শুধু আজকের না) থাকা দরকার — তাই এখানে
   সরাসরি Firestore থেকে erp_sales/erp_purchases এর পুরো কালেকশন এক-কালীন
   fetch করা হয় (DB.sales/DB.purchases ব্যবহার করা হয় না, কারণ সেগুলোতে
   পারফরম্যান্সের জন্য শুধু "আজকের" ডেটা লাইভ রাখা হয়)। এটা একটা কদাচিৎ,
   ইচ্ছাকৃত কাজ বলে পুরো কালেকশন পড়া এখানে গ্রহণযোগ্য — লাখ খানেক এন্ট্রি
   হলে কিছুটা সময়/মেমরি লাগতে পারে, নিচে লোডিং বার্তা দেখানো হয়। */
async function downloadBackup(){
  const btn = document.getElementById('backupBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'সম্পূর্ণ ডেটা লোড হচ্ছে...'; }
  try{
    const [salesSnap, purchSnap] = await Promise.all([
      fsDB.collection('erp_sales').get(),
      fsDB.collection('erp_purchases').get()
    ]);
    const allSales = []; salesSnap.forEach(d=>allSales.push(d.data()));
    const allPurchases = []; purchSnap.forEach(d=>allPurchases.push(d.data()));
    const allReturns = [];
    try{ const rs = await fsDB.collection('erp_returns').get(); rs.forEach(d=>allReturns.push(d.data())); }catch(e){ console.warn('erp_returns ব্যাকআপে যায়নি:', e); }
    const exportObj = {
      products: DB.products, customers: DB.customers, suppliers: DB.suppliers,
      sales: allSales, purchases: allPurchases, returns: allReturns, expenses: DB.expenses, users: DB.users,
      settings: DB.settings,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportObj,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `business-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logAudit('ব্যাকআপ ডাউনলোড', `${allSales.length} বিক্রয়, ${allPurchases.length} ক্রয়`);
  }catch(err){
    alert('ব্যাকআপ তৈরি করতে সমস্যা হয়েছে: ' + err.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'ব্যাকআপ ডাউনলোড করুন'; }
  }
}
/* রিস্টোরের পর erp_stats/erp_daystats (দ্রুত ড্যাশবোর্ডের জন্য এগ্রিগেট) নতুন করে
   হিসাব করে নেওয়া হয়, যাতে ড্যাশবোর্ড/রিপোর্ট রিস্টোর হওয়া ডেটার সাথে মিলে যায়।
   পুরনো erp_stock_moves (ভাউচার-ভিত্তিক স্টক ট্রেস) ব্যাকআপ ফাইলে থাকে না বলে
   রিস্টোরের পর সেটা খালি করে দেওয়া হয় (নাহলে ভুল/অসংগত ট্রেস দেখাবে)। */
function computeAggregates(sales, purchases, expenses, returns){
  const byDate = {};
  const T = {totalSales:0, totalPurchase:0, totalExpense:0, totalCogs:0, salesCount:0, purchaseCount:0, totalReturns:0, returnCount:0};
  const add = (date, key, val)=>{ if(!date) return; const d = byDate[date] || (byDate[date] = {}); d[key] = r2((d[key]||0) + val); };
  sales.forEach(s=>{
    // খুব পুরনো এন্ট্রিতে cogs/buyPrice সেভ না থাকলে বর্তমান পণ্য-ক্রয়মূল্য দিয়ে আনুমানিক ধরা হয়
    const cogs = (s.cogs!=null) ? Number(s.cogs) : r2((s.items||[]).reduce((a,it)=>{
      const pr = DB.products.find(x=>x.id===it.productId);
      const bp = (it.buyPrice!=null) ? it.buyPrice : (pr ? pr.buyPrice : 0);
      return a + bp*it.qty;
    }, 0));
    add(s.date,'totalSales',s.total||0); add(s.date,'totalCogs',cogs); add(s.date,'salesCount',1);
    T.totalSales += s.total||0; T.totalCogs += cogs; T.salesCount++;
  });
  purchases.forEach(p=>{ add(p.date,'totalPurchase',p.total||0); add(p.date,'purchaseCount',1); T.totalPurchase += p.total||0; T.purchaseCount++; });
  expenses.forEach(e=>{ add(e.date,'totalExpense',Number(e.amount)||0); T.totalExpense += Number(e.amount)||0; });
  // বিক্রয় ফেরত: নীট বিক্রয়/COGS থেকে বাদ — ফেরতের তারিখে (erp_returns থাকলে তা থেকে, নাহলে ভাউচারের তথ্য থেকে)
  const rets = returns ? returns.map(r=>({date:r.date, amount:r.amount||0, cogs:r.cogs||0}))
                       : sales.filter(s=>s.returnedTotal>0).map(s=>({date:s.date, amount:s.returnedTotal, cogs:s.returnedCogs||0}));
  rets.forEach(r=>{
    add(r.date,'totalSales',-r.amount); add(r.date,'totalCogs',-r.cogs); add(r.date,'totalReturns',r.amount); add(r.date,'returnCount',1);
    T.totalSales -= r.amount; T.totalCogs -= r.cogs; T.totalReturns += r.amount; T.returnCount++;
  });
  Object.keys(T).forEach(k=>T[k]=r2(T[k]));
  return {byDate, totals:T};
}
async function writeAggregates(agg, alsoClearMoves){
  const colls = alsoClearMoves ? ['erp_daystats','erp_stock_moves'] : ['erp_daystats'];
  for(const collName of colls){
    const snap = await fsDB.collection(collName).get();
    const docs = snap.docs;
    for(let i=0;i<docs.length;i+=400){
      const batch = fsDB.batch();
      docs.slice(i,i+400).forEach(d=>batch.delete(d.ref));
      await batch.commit();
    }
  }
  const dates = Object.keys(agg.byDate);
  for(let i=0;i<dates.length;i+=400){
    const batch = fsDB.batch();
    dates.slice(i,i+400).forEach(d=>batch.set(fsDB.collection('erp_daystats').doc(d), agg.byDate[d]));
    await batch.commit();
  }
  await fsDB.collection('erp_stats').doc('alltime').set(agg.totals);
}
/* রিস্টোরের পর হিসাব নতুন করে বসানো (সাথে ভাউচার-ভিত্তিক স্টক-ট্রেস খালি করা, কারণ ব্যাকআপে সেটা থাকে না) */
async function rebuildAggregatesAfterRestore(sales, purchases, expenses, returns){
  await writeAggregates(computeAggregates(sales, purchases, expenses, returns||null), true);
}
/* পুরনো এন্ট্রির সারসংক্ষেপ না থাকলে ড্যাশবোর্ড/রিপোর্টে ০ আসে — এই বাটন সব বিক্রয়/ক্রয়/খরচ আবার পড়ে সারসংক্ষেপ নতুন করে বানায় */
async function rebuildStatsFromData(){
  if(!hasAccess('director')) return;
  if(!navigator.onLine){ alert('এই কাজের জন্য ইন্টারনেট সংযোগ লাগবে।'); return; }
  if(!confirm('সব বিক্রয়, ক্রয় ও খরচ আবার পড়ে ড্যাশবোর্ড/রিপোর্টের সারসংক্ষেপ নতুন করে তৈরি হবে। (আপনার কোনো এন্ট্রি বদলাবে না। এন্ট্রি বেশি হলে কিছুক্ষণ সময় লাগতে পারে।) চালিয়ে যাবেন?')) return;
  const btn = document.getElementById('rebuildBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'পড়া ও গণনা হচ্ছে...'; }
  toast('⏳ হিসাব পুনঃগণনা চলছে...');
  try{
    const [sSnap, pSnap, eSnap] = await Promise.all([fsDB.collection('erp_sales').get(), fsDB.collection('erp_purchases').get(), fsDB.collection('erp_expenses').get()]);
    const sales = sSnap.docs.map(d=>d.data()), purchases = pSnap.docs.map(d=>d.data()), expenses = eSnap.docs.map(d=>d.data());
    let returns = null;
    try{ const rs = await fsDB.collection('erp_returns').get(); returns = rs.docs.map(d=>d.data()); }
    catch(e){ console.warn('erp_returns পড়া যায়নি (Firestore Rules-এ erp_returns এর অনুমতি দিন):', e); }
    await writeAggregates(computeAggregates(sales, purchases, expenses, returns), false);
    statsStale = false;
    logAudit('হিসাব পুনঃগণনা', `${sales.length} বিক্রয়, ${purchases.length} ক্রয়, ${expenses.length} খরচ`);
    toast(`✅ হয়েছে — ${sales.length} বিক্রয়, ${purchases.length} ক্রয়, ${expenses.length} খরচ`);
    if(['dashboard','reports'].includes(currentPage)) renderPage(currentPage);
  }catch(err){
    alert('পুনঃগণনা করতে সমস্যা হয়েছে: ' + err.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '🔄 সারসংক্ষেপ পুনঃগণনা করুন'; }
  }
}
async function checkStatsHealth(){
  try{
    const [s, p] = await Promise.all([fsDB.collection('erp_sales').limit(1).get(), fsDB.collection('erp_purchases').limit(1).get()]);
    const st = DB.statsAlltime || {};
    statsStale = (!s.empty && !(st.salesCount>0)) || (!p.empty && !(st.purchaseCount>0));
  }catch(e){ statsStale = false; }
  if(statsStale && ['dashboard','reports'].includes(currentPage)) renderPage(currentPage);
}
function statsBannerHtml(){
  if(!statsStale || !currentUser || !hasAccess('director')) return '';
  return `<div class="help-warn" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;font-size:13px;">
    <span style="flex:1;min-width:220px;">⚠️ পুরনো এন্ট্রিগুলোর সারসংক্ষেপ তৈরি হয়নি, তাই ড্যাশবোর্ড/রিপোর্টে হিসাব ০ বা কম দেখাচ্ছে।</span>
    <button class="btn btn-gold small-btn" onclick="rebuildStatsFromData()">🔄 এখনই ঠিক করুন</button></div>`;
}
async function restoreBackup(){
  if(!navigator.onLine){ alert('রিস্টোর করতে ইন্টারনেট সংযোগ লাগবে।'); return; }
  const file = document.getElementById('restoreFile').files[0];
  if(!file){ alert('একটি ব্যাকআপ ফাইল নির্বাচন করুন'); return; }
  if(!confirm('আপনি কি নিশ্চিত? বর্তমান সকল ডেটা প্রতিস্থাপিত হয়ে যাবে!')) return;
  const btn = document.getElementById('restoreBtn');
  const reader = new FileReader();
  reader.onload = async e=>{
    try{
      btn.disabled = true; btn.textContent = 'রিস্টোর হচ্ছে...';
      const data = JSON.parse(e.target.result);
      const collections = {
        erp_products: data.products||[], erp_customers: data.customers||[], erp_suppliers: data.suppliers||[],
        erp_sales: data.sales||[], erp_purchases: data.purchases||[], erp_expenses: data.expenses||[], erp_users: data.users||[]
      };
      if(data.returns) collections.erp_returns = data.returns;
      for(const [collName, items] of Object.entries(collections)){
        const existing = await fsDB.collection(collName).get();
        const ops = [];
        existing.forEach(d=>ops.push({type:'delete', ref:d.ref}));
        items.forEach(item=>ops.push({type:'set', ref:fsDB.collection(collName).doc(String(item.id)), data:item}));
        for(let i=0;i<ops.length;i+=400){
          const batch = fsDB.batch();
          ops.slice(i,i+400).forEach(op=>{ op.type==='delete' ? batch.delete(op.ref) : batch.set(op.ref, op.data); });
          await batch.commit();
        }
      }
      if(data.settings){ await fsDB.collection('erp_settings').doc('business').set(data.settings, {merge:true}); }
      btn.textContent = 'হিসাব পুনরায় গণনা হচ্ছে...';
      await rebuildAggregatesAfterRestore(collections.erp_sales, collections.erp_purchases, collections.erp_expenses, collections.erp_returns||null);
      logAudit('ব্যাকআপ রিস্টোর', file.name);
      alert('রিস্টোর সফল হয়েছে! পেজ রিলোড হচ্ছে...');
      location.reload();
    }catch(err){
      alert('ব্যর্থ হয়েছে: ' + err.message);
      btn.disabled = false; btn.textContent = 'রিস্টোর করুন';
    }
  };
  reader.readAsText(file);
}


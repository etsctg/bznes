/* ব্যবসা ম্যানেজার — Service Worker
   এটা শুধু অ্যাপ-শেল (HTML/CSS/JS/আইকন) ক্যাশ করে রাখে যাতে অ্যাপটা
   দ্রুত খোলে এবং "ইনস্টলযোগ্য" হিসেবে ব্রাউজার শনাক্ত করে।
   মনে রাখবেন: ডেটা (Firebase Firestore) এখনও ইন্টারনেটের উপর নির্ভরশীল —
   এই সার্ভিস ওয়ার্কার অ্যাপকে সম্পূর্ণ অফলাইন করে না। */

const CACHE_NAME = 'business-erp-shell-v1';
const SHELL_FILES = [
  './business-erp.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* app-shell ফাইলগুলোর জন্য network-first (আপডেট থাকলে সেটাই দেখাবে),
   ব্যর্থ হলে ক্যাশ থেকে দেখাবে। Firebase/Firestore-এর রিকোয়েস্ট এখানে ছোঁয়া হয় না —
   সেগুলো স্বাভাবিকভাবে ইন্টারনেটে যাবে। */
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const isShellFile = SHELL_FILES.some(f => url.includes(f.replace('./','')));
  if(!isShellFile){ return; }

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

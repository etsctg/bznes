/* ব্যবসা ম্যানেজার — Service Worker
   এটা অ্যাপ-শেল (HTML/CSS/JS/আইকন) এবং বাইরের CDN থেকে লোড হওয়া জরুরি
   স্ক্রিপ্ট (Chart.js, Firebase SDK) — দুটোই ক্যাশ করে রাখে, যাতে একবার
   অনলাইনে চালানোর পর অ্যাপ সত্যিকার অর্থে অফলাইনেও (ড্যাশবোর্ডের চার্টসহ)
   ঠিকভাবে খোলে। মনে রাখবেন: ডেটা (Firebase Firestore) সিঙ্ক করতে এখনও
   ইন্টারনেট লাগে — শুধু নতুন এন্ট্রি অফলাইনে লোকালি জমা থাকে, পরে সিঙ্ক হয়। */

const CACHE_NAME = 'business-erp-shell-v2';
const SHELL_FILES = [
  './business-erp.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];
/* বাইরের CDN স্ক্রিপ্ট — এগুলো ছাড়া ড্যাশবোর্ড চার্ট বা Firebase লোড হবে না */
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(SHELL_FILES).catch(()=>{});
      await Promise.all(CDN_FILES.map(url =>
        cache.add(url).catch(err => console.warn('CDN cache করা যায়নি:', url, err))
      ));
    })
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

const ALL_CACHED_URLS = new Set([...SHELL_FILES.map(f => f.replace('./','')), ...CDN_FILES]);

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const isCached = [...ALL_CACHED_URLS].some(f => url.includes(f) || url === f);
  if(!isCached){ return; }

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
